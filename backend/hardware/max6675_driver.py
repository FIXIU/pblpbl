"""MAX6675 K-Type Thermocouple SPI Driver & Simulator.

Features:
- Hardware SPI0 communication (SCLK=GPIO 11, MISO=GPIO 9, CE0=GPIO 8) on Raspberry Pi.
- Multi-sensor array architecture (supports CE0, CE1, or arbitrary CS pins).
- 220ms conversion time enforcement (rate-limits hardware polling to max 4 Hz).
- Fault detection: Open-circuit / disconnected thermocouple bit inspection (bit 2).
- Realistic thermal lag & conduction simulation for development/testing without hardware.
"""

import logging
import math
import random
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class ThermocoupleFaultError(Exception):
    """Raised when MAX6675 reports an open thermocouple circuit or invalid reading."""
    pass


class MAX6675Sensor:
    """Driver for a single MAX6675 sensor over SPI."""

    def __init__(
        self,
        name: str = "backplate_1",
        spi_bus: int = 0,
        spi_device: int = 0,
        simulation_mode: bool = False,
    ):
        self.name = name
        self.spi_bus = spi_bus
        self.spi_device = spi_device
        self.simulation_mode = simulation_mode

        self._spi = None
        self._last_read_time: float = 0.0
        self._last_temp: float = 22.0  # Ambient starting temperature
        self._min_read_interval: float = 0.22  # 220ms conversion time constraint
        self._is_connected: bool = True

        # Simulation physics state
        self._sim_temp: float = 22.0
        self._sim_ambient: float = 22.0

        self._init_hardware()

    def _init_hardware(self) -> None:
        """Initializes spidev device or falls back to simulation."""
        if self.simulation_mode:
            logger.info(f"MAX6675 [{self.name}] initialized in SIMULATION mode.")
            return

        try:
            import spidev

            self._spi = spidev.SpiDev()
            self._spi.open(self.spi_bus, self.spi_device)
            self._spi.max_speed_hz = 1_000_000  # 1 MHz SPI clock (MAX6675 supports up to 4.3MHz)
            self._spi.mode = 0b00  # SPI Mode 0
            logger.info(
                f"MAX6675 [{self.name}] initialized on SPI bus={self.spi_bus}, device={self.spi_device}."
            )
        except Exception as exc:
            logger.warning(
                f"Failed to initialize physical SPI for MAX6675 [{self.name}] ({exc}). "
                f"Falling back to SIMULATION mode."
            )
            self.simulation_mode = True
            self._spi = None

    def read_temperature(self, front_surface_temp: Optional[float] = None) -> float:
        """Reads temperature in degrees Celsius with 0.25°C resolution.

        Enforces minimum 220ms interval between hardware reads.
        In simulation mode, accepts optional `front_surface_temp` to model thermal conduction.
        """
        now = time.monotonic()

        # If called faster than conversion time, return cached recent temperature
        if now - self._last_read_time < self._min_read_interval:
            return self._last_temp

        if self.simulation_mode or self._spi is None:
            temp = self._simulate_temperature(now, front_surface_temp)
        else:
            temp = self._read_hardware()

        self._last_read_time = now
        self._last_temp = temp
        return temp

    def _read_hardware(self) -> float:
        """Performs raw 16-bit SPI transfer and parses MAX6675 bits."""
        try:
            # MAX6675 outputs 16 bits MSB-first while chip select is LOW
            raw_bytes = self._spi.xfer2([0x00, 0x00])
            raw_value = (raw_bytes[0] << 8) | raw_bytes[1]

            # Bit 2 is HIGH when thermocouple is open/disconnected
            if raw_value & 0x04:
                self._is_connected = False
                raise ThermocoupleFaultError(
                    f"MAX6675 [{self.name}] detected open thermocouple input (bit 2 set)."
                )

            # Bits 14..3 contain the 12-bit temperature value (resolution 0.25°C)
            temp_c = ((raw_value >> 3) & 0x0FFF) * 0.25
            self._is_connected = True
            return round(temp_c, 2)

        except ThermocoupleFaultError:
            raise
        except Exception as exc:
            self._is_connected = False
            raise ThermocoupleFaultError(
                f"SPI communication failure on MAX6675 [{self.name}]: {exc}"
            ) from exc

    def _simulate_temperature(
        self, now: float, front_surface_temp: Optional[float]
    ) -> float:
        """Simulates 1D conductive heat transfer through the metal plate with thermal lag.

        dT_back/dt = k_conduction * (T_front - T_back) - k_ambient * (T_back - T_ambient)
        """
        dt = min(0.5, max(0.05, now - self._last_read_time)) if self._last_read_time > 0 else 0.25
        t_front = front_surface_temp if front_surface_temp is not None else 22.0

        # Physical thermal parameters for 10x15 cm steel/aluminum test plate
        k_conduction = 0.08  # Heat flow rate through plate
        k_ambient_loss = 0.02  # Heat loss to ambient back air

        d_temp = (k_conduction * (t_front - self._sim_temp) - k_ambient_loss * (self._sim_temp - self._sim_ambient)) * dt
        self._sim_temp += d_temp

        # Small sensor discretization and electrical noise
        noise = random.gauss(0, 0.05)
        quantized = round((self._sim_temp + noise) * 4.0) / 4.0  # 0.25°C steps
        return max(self._sim_ambient, quantized)

    @property
    def is_connected(self) -> bool:
        """Returns True if the sensor is communicating properly and circuit is closed."""
        return self._is_connected

    def close(self) -> None:
        """Closes SPI bus interface."""
        if self._spi is not None:
            try:
                self._spi.close()
            except Exception:
                pass
            self._spi = None


class MAX6675Array:
    """Manages an array of MAX6675 sensors."""

    def __init__(
        self,
        sensors_config: Optional[List[Dict]] = None,
        simulation_mode: bool = False,
    ):
        self.simulation_mode = simulation_mode
        self.sensors: Dict[str, MAX6675Sensor] = {}

        default_config = [
            {"name": "backplate_center", "spi_bus": 0, "spi_device": 0}
        ]
        config = sensors_config or default_config

        for item in config:
            sensor = MAX6675Sensor(
                name=item["name"],
                spi_bus=item.get("spi_bus", 0),
                spi_device=item.get("spi_device", 0),
                simulation_mode=self.simulation_mode,
            )
            self.sensors[item["name"]] = sensor

    def read_all(self, front_surface_temp: Optional[float] = None) -> Dict[str, float]:
        """Reads temperatures from all configured thermocouple sensors."""
        readings = {}
        for name, sensor in self.sensors.items():
            readings[name] = sensor.read_temperature(front_surface_temp=front_surface_temp)
        return readings

    def get_primary_temperature(self, front_surface_temp: Optional[float] = None) -> float:
        """Returns temperature from the primary thermocouple (default 'backplate_center')."""
        if "backplate_center" in self.sensors:
            return self.sensors["backplate_center"].read_temperature(front_surface_temp)
        if self.sensors:
            first_sensor = next(iter(self.sensors.values()))
            return first_sensor.read_temperature(front_surface_temp)
        return 22.0

    def all_connected(self) -> bool:
        """Checks if all sensors in the array report healthy connections."""
        return all(sensor.is_connected for sensor in self.sensors.values())

    def close(self) -> None:
        """Closes all SPI sensor devices."""
        for sensor in self.sensors.values():
            sensor.close()
