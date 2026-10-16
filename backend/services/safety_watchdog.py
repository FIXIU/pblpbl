"""Safety Watchdog Service for Coating Reflectivity Research Station.

Monitors sensor integrity and thermal limits at 4 Hz:
- MAX6675 cutoff: > 110.0°C (configurable)
- MLX90640 global maximum cutoff: > 120.0°C (configurable)
- Sensor disconnection watchdog (> 1.5s without healthy frame)
- Immediate hard cutoff of SSR heating element
"""

import logging
import time
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class SafetyWatchdog:
    """Monitors temperatures and hardware status to prevent fire or damage."""

    def __init__(
        self,
        max_back_temp: float = 110.0,
        max_surf_temp: float = 120.0,
        disconnect_timeout_sec: float = 1.5,
        safe_recovery_temp: float = 60.0,
    ):
        self.max_back_temp = max_back_temp
        self.max_surf_temp = max_surf_temp
        self.disconnect_timeout_sec = disconnect_timeout_sec
        self.safe_recovery_temp = safe_recovery_temp

        self.is_tripped: bool = False
        self.trip_reason: Optional[str] = None
        self.trip_timestamp: Optional[float] = None
        self._last_healthy_read_time: float = time.monotonic()

    def check(
        self,
        t_back: float,
        t_surf_max: float,
        sensors_connected: bool,
    ) -> Tuple[bool, Optional[str]]:
        """Evaluates telemetry values.

        Returns (is_tripped, trip_reason).
        If an unsafe condition is met, trips watchdog immediately.
        """
        now = time.monotonic()

        # Check sensor connectivity
        if sensors_connected:
            self._last_healthy_read_time = now
        elif now - self._last_healthy_read_time > self.disconnect_timeout_sec:
            self._trip(f"Sensor communication loss for > {self.disconnect_timeout_sec:.1f}s.")
            return True, self.trip_reason

        # Check MAX6675 backplate temperature
        if t_back > self.max_back_temp:
            self._trip(f"Backplate temperature {t_back:.1f}°C exceeded safe limit ({self.max_back_temp:.1f}°C)!")
            return True, self.trip_reason

        # Check MLX90640 surface temperature
        if t_surf_max > self.max_surf_temp:
            self._trip(f"Surface temperature {t_surf_max:.1f}°C exceeded safe limit ({self.max_surf_temp:.1f}°C)!")
            return True, self.trip_reason

        return self.is_tripped, self.trip_reason

    def _trip(self, reason: str) -> None:
        """Internal trip trigger."""
        if not self.is_tripped:
            self.is_tripped = True
            self.trip_reason = reason
            self.trip_timestamp = time.monotonic()
            logger.critical(f"*** SAFETY WATCHDOG TRIPPED *** Reason: {reason}")

    def manual_emergency_trip(self, reason: str = "Operator pressed Emergency STOP.") -> None:
        """Manual trip via UI button or API call."""
        self._trip(reason)

    def attempt_reset(self, current_t_back: float, current_t_surf: float) -> Tuple[bool, str]:
        """Attempts to clear emergency trip.

        Only permitted if temperatures have cooled below safe recovery threshold.
        """
        if not self.is_tripped:
            return True, "System is not in emergency state."

        if current_t_back >= self.safe_recovery_temp or current_t_surf >= self.safe_recovery_temp:
            msg = (
                f"Cannot reset: Temperatures must cool below {self.safe_recovery_temp:.1f}°C first "
                f"(Current: T_back={current_t_back:.1f}°C, T_surf={current_t_surf:.1f}°C)."
            )
            logger.warning(msg)
            return False, msg

        self.is_tripped = False
        self.trip_reason = None
        self.trip_timestamp = None
        self._last_healthy_read_time = time.monotonic()
        logger.info("Safety watchdog emergency state cleared by operator.")
        return True, "Emergency state cleared successfully."
