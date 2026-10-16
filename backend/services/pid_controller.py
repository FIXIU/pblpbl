"""Discrete PID Controller with Anti-Windup Clamping for Thermal Systems."""

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


class PIDController:
    """Discrete Proportional-Integral-Derivative controller for heating power regulation."""

    def __init__(
        self,
        kp: float = 3.5,
        ki: float = 0.08,
        kd: float = 2.0,
        setpoint: float = 60.0,
        output_limits: tuple[float, float] = (0.0, 100.0),
    ):
        self.kp = float(kp)
        self.ki = float(ki)
        self.kd = float(kd)
        self.setpoint = float(setpoint)
        self.output_min, self.output_max = output_limits

        self._integral: float = 0.0
        self._last_error: Optional[float] = None
        self._last_time: Optional[float] = None
        self._last_output: float = 0.0

    def compute(self, current_val: float, now: Optional[float] = None) -> float:
        """Computes new SSR duty cycle (0.0% to 100.0%) based on current temperature."""
        current_time = now if now is not None else time.monotonic()

        if self._last_time is None:
            self._last_time = current_time
            self._last_error = self.setpoint - current_val
            return self.output_min

        dt = current_time - self._last_time
        if dt <= 0.0:
            return self._last_output

        error = self.setpoint - current_val

        # Proportional term
        p_term = self.kp * error

        # Integral term with anti-windup clamping
        self._integral += error * dt
        # Clamp integral term alone to output bounds to avoid saturation
        i_max = self.output_max / max(1e-5, self.ki)
        self._integral = max(-i_max, min(i_max, self._integral))
        i_term = self.ki * self._integral

        # Derivative term on error (or measurement)
        d_term = 0.0
        if self._last_error is not None and dt > 0:
            d_term = self.kd * (error - self._last_error) / dt

        # Raw output
        output = p_term + i_term + d_term

        # Clamp output to 0..100%
        clamped_output = max(self.output_min, min(self.output_max, output))

        # Anti-windup back-calculation: if saturated, prevent integral growth in direction of error
        if (output > self.output_max and error > 0) or (output < self.output_min and error < 0):
            self._integral -= error * dt

        self._last_error = error
        self._last_time = current_time
        self._last_output = round(clamped_output, 1)

        return self._last_output

    def set_tunings(self, kp: float, ki: float, kd: float) -> None:
        """Updates PID gain coefficients."""
        self.kp = max(0.0, float(kp))
        self.ki = max(0.0, float(ki))
        self.kd = max(0.0, float(kd))
        logger.info(f"PID tunings updated: Kp={self.kp}, Ki={self.ki}, Kd={self.kd}")

    def set_target(self, setpoint: float) -> None:
        """Updates target temperature setpoint in °C."""
        self.setpoint = float(setpoint)
        logger.info(f"PID setpoint updated to {self.setpoint:.1f}°C")

    def reset(self) -> None:
        """Resets integral accumulator and history."""
        self._integral = 0.0
        self._last_error = None
        self._last_time = None
        self._last_output = 0.0
