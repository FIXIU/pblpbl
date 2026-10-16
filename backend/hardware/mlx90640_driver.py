"""MLX90640 110° FOV Thermal Camera Driver, ROI Math & 2D Heat Simulator.

Features:
- Reads 32x24 (768 pixels) thermal array via I2C1 (0x33) at 4 Hz.
- Bounding-box Region of Interest (ROI) filtering for the 10x15 cm coated metal plate.
- Calculates T_surf_avg, T_surf_max, T_surf_min, and delta_T_uniformity.
- Realistic 2D Gaussian heating, ambient cooling, and halogen IR filament glare simulation.
"""

import logging
import math
import random
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

GRID_WIDTH = 32
GRID_HEIGHT = 24
TOTAL_PIXELS = GRID_WIDTH * GRID_HEIGHT  # 768


@dataclass
class ROIConfig:
    x_min: int = 8
    x_max: int = 24
    y_min: int = 6
    y_max: int = 18

    def validate(self) -> "ROIConfig":
        """Ensures ROI coordinates are valid within the 32x24 grid."""
        x0 = max(0, min(GRID_WIDTH - 2, int(self.x_min)))
        x1 = max(x0 + 1, min(GRID_WIDTH - 1, int(self.x_max)))
        y0 = max(0, min(GRID_HEIGHT - 2, int(self.y_min)))
        y1 = max(y0 + 1, min(GRID_HEIGHT - 1, int(self.y_max)))
        return ROIConfig(x_min=x0, x_max=x1, y_min=y0, y_max=y1)

    def to_dict(self) -> Dict[str, int]:
        return {
            "x_min": self.x_min,
            "x_max": self.x_max,
            "y_min": self.y_min,
            "y_max": self.y_max,
        }


@dataclass
class ThermalStats:
    t_surf_avg: float
    t_surf_max: float
    t_surf_min: float
    delta_t_uniformity: float
    global_max: float
    global_min: float
    roi: Dict[str, int]


class MLX90640Driver:
    """Driver and simulation engine for MLX90640 32x24 thermal imaging sensor."""

    def __init__(
        self,
        i2c_bus: int = 1,
        i2c_addr: int = 0x33,
        fps: int = 4,
        roi: Optional[ROIConfig] = None,
        simulation_mode: bool = False,
    ):
        self.i2c_bus = i2c_bus
        self.i2c_addr = i2c_addr
        self.fps = fps
        self.roi = (roi or ROIConfig()).validate()
        self.simulation_mode = simulation_mode

        self._camera = None
        self._frame_buffer = [0.0] * TOTAL_PIXELS
        self._last_frame_time: float = 0.0
        self._consecutive_errors: int = 0
        self._is_connected: bool = True

        # Simulation physics state (32x24 2D temperature array in °C)
        self._sim_ambient: float = 22.0
        self._sim_plate_temp: float = 22.0  # Base physical plate temp
        self._sim_filament_glare: float = 0.0  # Optical IR glare from halogen lamp
        self._sim_frame: List[float] = [self._sim_ambient] * TOTAL_PIXELS

        self._init_hardware()

    def _init_hardware(self) -> None:
        """Initializes adafruit_mlx90640 on I2C or falls back to simulation."""
        if self.simulation_mode:
            logger.info("MLX90640Driver initialized in SIMULATION mode.")
            return

        try:
            import board
            import busio
            import adafruit_mlx90640

            i2c = busio.I2C(board.SCL, board.SDA, frequency=400000)
            self._camera = adafruit_mlx90640.MLX90640(i2c)

            # Set refresh rate
            if self.fps == 2:
                self._camera.refresh_rate = adafruit_mlx90640.RefreshRate.REFRESH_2_HZ
            elif self.fps >= 4:
                self._camera.refresh_rate = adafruit_mlx90640.RefreshRate.REFRESH_4_HZ
            else:
                self._camera.refresh_rate = adafruit_mlx90640.RefreshRate.REFRESH_2_HZ

            logger.info(
                f"MLX90640 hardware initialized on I2C at {self.fps} Hz (address {hex(self.i2c_addr)})."
            )
        except Exception as exc:
            logger.warning(
                f"Failed to initialize MLX90640 hardware ({exc}). Falling back to SIMULATION mode."
            )
            self.simulation_mode = True
            self._camera = None

    def set_roi(self, x_min: int, x_max: int, y_min: int, y_max: int) -> ROIConfig:
        """Updates and validates the Region of Interest for the 10x15 cm test plate."""
        self.roi = ROIConfig(x_min=x_min, x_max=x_max, y_min=y_min, y_max=y_max).validate()
        logger.info(f"ROI updated to: {self.roi.to_dict()}")
        return self.roi

    def get_frame(
        self,
        ssr_power_pct: float = 0.0,
        ssr_is_active: bool = False,
    ) -> Tuple[List[float], ThermalStats]:
        """Fetches the latest 32x24 thermal frame and calculates ROI statistics.

        In simulation mode, uses `ssr_power_pct` and `ssr_is_active` to model heat and glare.
        """
        now = time.monotonic()

        if self.simulation_mode or self._camera is None:
            frame = self._generate_simulated_frame(now, ssr_power_pct, ssr_is_active)
            self._is_connected = True
            self._consecutive_errors = 0
        else:
            frame = self._read_hardware_frame()

        self._frame_buffer = frame
        self._last_frame_time = now
        stats = self.calculate_roi_stats(frame, self.roi)
        return frame, stats

    def _read_hardware_frame(self) -> List[float]:
        """Reads physical 768 floats from MLX90640 with retry on I2C NACK."""
        frame = [0.0] * TOTAL_PIXELS
        try:
            self._camera.getFrame(frame)
            self._is_connected = True
            self._consecutive_errors = 0
            return [round(float(val), 2) for val in frame]
        except Exception as exc:
            self._consecutive_errors += 1
            logger.warning(f"MLX90640 I2C read error ({self._consecutive_errors}): {exc}")
            if self._consecutive_errors >= 5:
                self._is_connected = False
            # Return cached frame or fallback on transient error
            if self._frame_buffer and any(v > 0 for v in self._frame_buffer):
                return self._frame_buffer
            return [self._sim_ambient] * TOTAL_PIXELS

    def _generate_simulated_frame(
        self, now: float, ssr_power: float, ssr_active: bool
    ) -> List[float]:
        """Generates realistic 2D thermal distribution with lamp heating, cooling, and IR glare.

        Models:
        - Lamp heat flux onto central 10x15 cm plate.
        - Convective & radiative cooling to ambient (~22°C).
        - Direct filament reflection (glare) which vanishes within ~1.5s when SSR is cut.
        """
        dt = min(0.5, max(0.05, now - self._last_frame_time)) if self._last_frame_time > 0 else 0.25

        # 1. Physical plate temperature integration
        # Heating proportional to average power; cooling proportional to (T - T_amb)
        heat_input = (ssr_power / 100.0) * 1.8  # Max ~1.8 °C/sec heating rate
        heat_loss = 0.03 * (self._sim_plate_temp - self._sim_ambient)
        self._sim_plate_temp += (heat_input - heat_loss) * dt
        self._sim_plate_temp = max(self._sim_ambient, self._sim_plate_temp)

        # 2. Halogen filament glare dynamic:
        # Glare is present when SSR is firing. Drops fast (decay constant ~1.2s) when SSR cuts out.
        target_glare = (ssr_power / 100.0) * 8.5 if ssr_active else 0.0
        glare_rate = 3.0 if target_glare > self._sim_filament_glare else 1.8
        self._sim_filament_glare += (target_glare - self._sim_filament_glare) * min(1.0, glare_rate * dt)
        self._sim_filament_glare = max(0.0, self._sim_filament_glare)

        # 3. Synthesize 32x24 grid
        center_x = (self.roi.x_min + self.roi.x_max) / 2.0
        center_y = (self.roi.y_min + self.roi.y_max) / 2.0
        sigma_x = max(3.0, (self.roi.x_max - self.roi.x_min) / 2.2)
        sigma_y = max(3.0, (self.roi.y_max - self.roi.y_min) / 2.2)

        frame = [0.0] * TOTAL_PIXELS
        plate_excess = self._sim_plate_temp - self._sim_ambient

        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                idx = y * GRID_WIDTH + x
                # Gaussian falloff from center of the plate
                dx = (x - center_x) / sigma_x
                dy = (y - center_y) / sigma_y
                gaussian = math.exp(-0.5 * (dx * dx + dy * dy))

                # Plate temperature component
                temp = self._sim_ambient + plate_excess * gaussian

                # Add optical IR filament glare on the reflective plate area
                if self._sim_filament_glare > 0.0:
                    temp += self._sim_filament_glare * gaussian

                # Chamber walls / background slight warm-up
                if gaussian < 0.1:
                    temp += 0.08 * plate_excess

                # Sensor pixel noise
                noise = random.gauss(0, 0.12)
                frame[idx] = round(temp + noise, 2)

        return frame

    @staticmethod
    def calculate_roi_stats(frame: List[float], roi: ROIConfig) -> ThermalStats:
        """Calculates temperature statistics strictly for pixels within the ROI bounding box."""
        if not frame or len(frame) != TOTAL_PIXELS:
            return ThermalStats(22.0, 22.0, 22.0, 0.0, 22.0, 22.0, roi.to_dict())

        roi = roi.validate()
        roi_temps: List[float] = []

        for y in range(roi.y_min, roi.y_max + 1):
            row_offset = y * GRID_WIDTH
            for x in range(roi.x_min, roi.x_max + 1):
                roi_temps.append(frame[row_offset + x])

        if not roi_temps:
            roi_temps = [22.0]

        t_avg = sum(roi_temps) / len(roi_temps)
        t_max = max(roi_temps)
        t_min = min(roi_temps)
        delta_t_uniformity = t_max - t_min

        global_max = max(frame)
        global_min = min(frame)

        return ThermalStats(
            t_surf_avg=round(t_avg, 2),
            t_surf_max=round(t_max, 2),
            t_surf_min=round(t_min, 2),
            delta_t_uniformity=round(delta_t_uniformity, 2),
            global_max=round(global_max, 2),
            global_min=round(global_min, 2),
            roi=roi.to_dict(),
        )

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    def close(self) -> None:
        self._camera = None
        logger.info("MLX90640 driver closed.")
