"""SSR-40DA Slow Time-Proportional PWM Controller.

Designed specifically for Raspberry Pi 5 with RP1 southbridge:
- Uses `gpiozero` with `lgpio` pin factory (strictly avoids deprecated RPi.GPIO).
- Employs Slow Time-Proportional PWM suited for zero-crossing 50Hz AC solid state relays.
- Provides fallback to mock simulation when SIMULATION_MODE=true or on non-RPi platforms.
"""

import logging
import os
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Ensure lgpio pin factory is preferred for Raspberry Pi 5 if not set
if "GPIOZERO_PIN_FACTORY" not in os.environ:
    os.environ["GPIOZERO_PIN_FACTORY"] = "lgpio"


class SSRController:
    """Controls an SSR-40DA solid-state relay via slow time-proportional PWM."""

    def __init__(
        self,
        gpio_pin: int = 18,
        pwm_window_sec: float = 2.0,
        simulation_mode: bool = False,
    ):
        self.gpio_pin = gpio_pin
        self.pwm_window_sec = max(0.5, float(pwm_window_sec))
        self.simulation_mode = simulation_mode

        self._power_pct: float = 0.0  # 0.0 to 100.0%
        self._is_active: bool = False  # Current physical pin state (HIGH/LOW)
        self._emergency_locked: bool = False
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

        self._device = None
        self._worker_thread: Optional[threading.Thread] = None

        self._init_hardware()
        self._start_worker()

    def _init_hardware(self) -> None:
        """Initializes gpiozero OutputDevice or sets simulation mode."""
        if self.simulation_mode:
            logger.info("SSRController initialized in SIMULATION mode.")
            return

        try:
            from gpiozero import OutputDevice

            self._device = OutputDevice(self.gpio_pin, active_high=True, initial_value=False)
            logger.info(f"SSRController initialized on GPIO {self.gpio_pin} via gpiozero (lgpio).")
        except Exception as exc:
            logger.warning(
                f"Failed to initialize physical GPIO {self.gpio_pin} ({exc}). "
                f"Falling back to SIMULATION mode."
            )
            self.simulation_mode = True
            self._device = None

    def _start_worker(self) -> None:
        """Starts the background PWM timing loop thread."""
        self._worker_thread = threading.Thread(
            target=self._pwm_loop,
            name="SSR-SlowPWM-Worker",
            daemon=True,
        )
        self._worker_thread.start()

    def _pwm_loop(self) -> None:
        """Background loop executing slow time-proportional PWM."""
        while not self._stop_event.is_set():
            with self._lock:
                power = 0.0 if self._emergency_locked else self._power_pct
                window = self.pwm_window_sec

            if power <= 0.0:
                self._set_hardware_state(False)
                # Sleep in short slices so set_power or emergency_stop is responsive
                self._interruptible_sleep(min(0.2, window))
                continue

            if power >= 100.0:
                self._set_hardware_state(True)
                self._interruptible_sleep(min(0.2, window))
                continue

            # Time proportional: t_on = (power / 100.0) * window
            t_on = (power / 100.0) * window
            t_off = window - t_on

            # Turn ON for t_on duration
            self._set_hardware_state(True)
            if self._interruptible_sleep(t_on):
                break

            # Turn OFF for t_off duration
            self._set_hardware_state(False)
            if self._interruptible_sleep(t_off):
                break

        # Always leave the relay in a safe OFF state on exit
        self._set_hardware_state(False)

    def _interruptible_sleep(self, duration_sec: float) -> bool:
        """Sleeps for duration_sec or until stop_event is set.

        Returns True if stop_event was signaled.
        """
        deadline = time.monotonic() + duration_sec
        while time.monotonic() < deadline:
            if self._stop_event.is_set():
                return True
            time.sleep(min(0.02, max(0.001, deadline - time.monotonic())))
        return False

    def _set_hardware_state(self, state: bool) -> None:
        """Sets physical GPIO output and updates state."""
        self._is_active = state and not self._emergency_locked
        if self._device is not None:
            try:
                if self._is_active:
                    self._device.on()
                else:
                    self._device.off()
            except Exception as exc:
                logger.error(f"Error toggling SSR GPIO: {exc}")

    def set_power(self, power_pct: float) -> float:
        """Sets the desired SSR duty cycle (0.0 to 100.0%).

        If emergency lock is active, power is forced to 0.0%.
        """
        with self._lock:
            if self._emergency_locked:
                logger.warning("Attempted to set power while EMERGENCY LOCK is active.")
                self._power_pct = 0.0
                return 0.0

            clamped = max(0.0, min(100.0, float(power_pct)))
            self._power_pct = clamped
            return clamped

    def get_power(self) -> float:
        """Returns current configured duty cycle percentage."""
        with self._lock:
            return 0.0 if self._emergency_locked else self._power_pct

    def is_active(self) -> bool:
        """Returns True if the relay is physically in the ON portion of its cycle."""
        return self._is_active

    def emergency_stop(self) -> None:
        """Instantly cuts power to 0.0% and physically disables the relay.

        Locks the controller until clear_emergency() is called.
        """
        with self._lock:
            self._emergency_locked = True
            self._power_pct = 0.0
        self._set_hardware_state(False)
        logger.critical("EMERGENCY STOP TRIGGERED: SSR relay forced LOW and locked.")

    def clear_emergency(self) -> None:
        """Clears the emergency lock state, keeping power at 0%."""
        with self._lock:
            self._emergency_locked = False
            self._power_pct = 0.0
        logger.info("SSR emergency lock cleared. SSR power remains at 0.0%.")

    def is_emergency_locked(self) -> bool:
        """Checks if emergency lock is active."""
        with self._lock:
            return self._emergency_locked

    def close(self) -> None:
        """Stops the PWM worker thread and safely closes hardware device."""
        self._stop_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=1.0)
        self._set_hardware_state(False)
        if self._device is not None:
            try:
                self._device.close()
            except Exception:
                pass
            self._device = None
        logger.info("SSRController closed safely.")
