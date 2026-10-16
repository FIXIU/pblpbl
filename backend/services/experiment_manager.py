"""Experiment Manager & Telemetry Orchestrator.

Coordinates:
- 4 Hz Telemetry Worker reading MLX90640 and MAX6675
- Control Modes: OFF, MANUAL_PWM, PID_HOLD, EXPERIMENT_PROFILE
- Anti-Glare Snapshot State Machine ("Pomiar bez odbić IR")
- Safety Watchdog integration
- CSV Session Logging
- Broadcasts real-time state to WebSockets
"""

import asyncio
import enum
import logging
import time
from typing import Any, Callable, Dict, List, Optional

from backend.config import settings
from backend.hardware.max6675_driver import MAX6675Array
from backend.hardware.mlx90640_driver import MLX90640Driver, ROIConfig
from backend.hardware.ssr_controller import SSRController
from backend.services.pid_controller import PIDController
from backend.services.safety_watchdog import SafetyWatchdog
from backend.services.session_logger import SessionLogger

logger = logging.getLogger(__name__)


class ControlMode(str, enum.Enum):
    OFF = "OFF"
    MANUAL_PWM = "MANUAL_PWM"
    PID_HOLD = "PID_HOLD"
    EXPERIMENT_PROFILE = "EXPERIMENT_PROFILE"


class PIDFeedbackSource(str, enum.Enum):
    MAX6675 = "MAX6675"
    MLX90640_ROI_AVG = "MLX90640_ROI_AVG"


class AntiGlareState(str, enum.Enum):
    IDLE = "IDLE"
    HOLDING_OFF = "HOLDING_OFF"
    CAPTURING = "CAPTURING"


class ExperimentProfileStep:
    def __init__(self, name: str, duration_sec: float, power_pct: float):
        self.name = name
        self.duration_sec = duration_sec
        self.power_pct = power_pct


class ExperimentManager:
    """Central engine managing hardware loops, control logic, anti-glare FSM, and logging."""

    def __init__(
        self,
        ssr: SSRController,
        max6675_array: MAX6675Array,
        mlx90640: MLX90640Driver,
        pid: PIDController,
        watchdog: SafetyWatchdog,
        logger_service: SessionLogger,
    ):
        self.ssr = ssr
        self.max6675 = max6675_array
        self.mlx = mlx90640
        self.pid = pid
        self.watchdog = watchdog
        self.logger = logger_service

        # Control state
        self.mode: ControlMode = ControlMode.OFF
        self.manual_power_pct: float = 0.0
        self.pid_feedback_source: PIDFeedbackSource = PIDFeedbackSource.MLX90640_ROI_AVG

        # Profile state
        self.profile_steps: List[ExperimentProfileStep] = []
        self.profile_current_step_idx: int = 0
        self.profile_step_start_time: float = 0.0

        # Anti-Glare Snapshot state
        self.anti_glare_enabled: bool = False
        self.anti_glare_interval_sec: float = settings.anti_glare_default_interval_sec
        self.anti_glare_cooldown_sec: float = settings.anti_glare_cooldown_sec
        self.anti_glare_state: AntiGlareState = AntiGlareState.IDLE
        self._anti_glare_last_trigger_time: float = time.monotonic()
        self._anti_glare_hold_start_time: float = 0.0
        self._anti_glare_saved_power: float = 0.0
        self._is_clean_snapshot: bool = False
        self._single_snapshot_requested: bool = False

        # Telemetry cache & subscribers
        self._latest_telemetry: Dict[str, Any] = {}
        self._telemetry_callbacks: List[Callable[[Dict[str, Any]], Any]] = []
        self._is_running: bool = False
        self._worker_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Starts the async 4 Hz telemetry and control loop."""
        if self._is_running:
            return
        self._is_running = True
        self._worker_task = asyncio.create_task(self._telemetry_loop(), name="Telemetry-Worker")
        logger.info("ExperimentManager background telemetry loop started at 4 Hz.")

    async def stop(self) -> None:
        """Stops the telemetry loop safely."""
        self._is_running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self.ssr.emergency_stop()
        self.logger.stop_session()
        logger.info("ExperimentManager stopped.")

    def register_telemetry_callback(self, callback: Callable[[Dict[str, Any]], Any]) -> None:
        """Registers a callback (e.g. WebSocket broadcaster) invoked on each telemetry tick."""
        if callback not in self._telemetry_callbacks:
            self._telemetry_callbacks.append(callback)

    def unregister_telemetry_callback(self, callback: Callable[[Dict[str, Any]], Any]) -> None:
        if callback in self._telemetry_callbacks:
            self._telemetry_callbacks.remove(callback)

    def get_latest_telemetry(self) -> Dict[str, Any]:
        """Returns the most recent telemetry packet."""
        return self._latest_telemetry

    # --- Hardware Telemetry & Control Loop (4 Hz) ---

    async def _telemetry_loop(self) -> None:
        """Runs continuously at ~4 Hz (250ms period)."""
        target_period = 0.25  # 4 Hz

        while self._is_running:
            start_time = time.monotonic()

            try:
                packet = await self._tick(start_time)
                self._latest_telemetry = packet

                # Broadcast packet to all WebSocket subscribers
                for cb in list(self._telemetry_callbacks):
                    try:
                        res = cb(packet)
                        if asyncio.iscoroutine(res):
                            await res
                    except Exception as exc:
                        logger.debug(f"Error in telemetry callback: {exc}")

            except Exception as exc:
                logger.error(f"Error during telemetry tick: {exc}", exc_info=True)

            # High-resolution sleep to maintain steady 4 Hz rate
            elapsed = time.monotonic() - start_time
            sleep_time = max(0.01, target_period - elapsed)
            await asyncio.sleep(sleep_time)

    async def _tick(self, now: float) -> Dict[str, Any]:
        """Executes a single telemetry step: sensing, control, safety, logging."""
        # 1. Read MLX90640 thermal camera frame and compute ROI stats
        current_ssr_power = self.ssr.get_power()
        ssr_is_firing = self.ssr.is_active()

        frame_32x24, roi_stats = self.mlx.get_frame(
            ssr_power_pct=current_ssr_power,
            ssr_is_active=ssr_is_firing,
        )

        # 2. Read MAX6675 backplate thermocouple
        t_back = self.max6675.get_primary_temperature(front_surface_temp=roi_stats.t_surf_avg)

        # 3. Calculate Key Metric: Insulation Delta-T (T_surf - T_back)
        delta_t_insulation = round(roi_stats.t_surf_avg - t_back, 2)

        # 4. Check Safety Watchdog
        sensors_healthy = self.mlx.is_connected and self.max6675.all_connected()
        watchdog_tripped, trip_reason = self.watchdog.check(
            t_back=t_back,
            t_surf_max=roi_stats.t_surf_max,
            sensors_connected=sensors_healthy,
        )

        if watchdog_tripped:
            self.mode = ControlMode.OFF
            self.ssr.emergency_stop()

        # 5. Anti-Glare Snapshot FSM
        self._process_anti_glare_fsm(now)

        # 6. Execute Control Mode if not in Anti-Glare holding or emergency
        target_power = 0.0
        if not self.watchdog.is_tripped and self.anti_glare_state == AntiGlareState.IDLE:
            target_power = self._evaluate_control_mode(t_back, roi_stats.t_surf_avg, now)
            self.ssr.set_power(target_power)

        effective_power = self.ssr.get_power()

        # 7. Session Data Logging
        self.logger.log_tick(
            mode=self.mode.value,
            ssr_power_pct=effective_power,
            max6675_temp_c=t_back,
            roi_avg_temp_c=roi_stats.t_surf_avg,
            roi_max_temp_c=roi_stats.t_surf_max,
            roi_min_temp_c=roi_stats.t_surf_min,
            delta_t_insulation=delta_t_insulation,
            is_clean_snapshot=self._is_clean_snapshot,
            raw_thermal_frame=frame_32x24 if self._is_clean_snapshot else None,
        )

        # Build telemetry payload
        packet = {
            "timestamp": time.time(),
            "mode": self.mode.value,
            "ssr_power_pct": effective_power,
            "ssr_active": self.ssr.is_active(),
            "t_back": t_back,
            "t_surf_avg": roi_stats.t_surf_avg,
            "t_surf_max": roi_stats.t_surf_max,
            "t_surf_min": roi_stats.t_surf_min,
            "delta_t_uniformity": roi_stats.delta_t_uniformity,
            "delta_t_insulation": delta_t_insulation,
            "roi": roi_stats.roi,
            "is_clean_snapshot": self._is_clean_snapshot,
            "anti_glare_active": self.anti_glare_state != AntiGlareState.IDLE,
            "safety_triggered": self.watchdog.is_tripped,
            "safety_message": self.watchdog.trip_reason,
            "session": self.logger.get_status(),
            "thermal_frame": frame_32x24,
        }

        # Clear snapshot flag for next tick
        if self._is_clean_snapshot:
            self._is_clean_snapshot = False

        return packet

    def _evaluate_control_mode(self, t_back: float, t_surf_avg: float, now: float) -> float:
        """Determines target SSR power based on active mode."""
        if self.mode == ControlMode.OFF:
            return 0.0

        if self.mode == ControlMode.MANUAL_PWM:
            return self.manual_power_pct

        if self.mode == ControlMode.PID_HOLD:
            feedback_val = t_back if self.pid_feedback_source == PIDFeedbackSource.MAX6675 else t_surf_avg
            return self.pid.compute(feedback_val, now)

        if self.mode == ControlMode.EXPERIMENT_PROFILE:
            return self._evaluate_profile_step(now)

        return 0.0

    def _evaluate_profile_step(self, now: float) -> float:
        """Executes sequential profile steps."""
        if not self.profile_steps or self.profile_current_step_idx >= len(self.profile_steps):
            self.mode = ControlMode.OFF
            return 0.0

        current_step = self.profile_steps[self.profile_current_step_idx]
        elapsed = now - self.profile_step_start_time

        if elapsed >= current_step.duration_sec:
            # Advance to next step
            self.profile_current_step_idx += 1
            if self.profile_current_step_idx < len(self.profile_steps):
                self.profile_step_start_time = now
                next_step = self.profile_steps[self.profile_current_step_idx]
                logger.info(f"Advanced to profile step {self.profile_current_step_idx + 1}: {next_step.name}")
                return next_step.power_pct
            else:
                logger.info("Experiment profile completed all steps. Switching to OFF.")
                self.mode = ControlMode.OFF
                return 0.0

        return current_step.power_pct

    def _process_anti_glare_fsm(self, now: float) -> None:
        """Anti-Glare Snapshot ("Pomiar bez odbić IR") Finite State Machine."""
        if self.anti_glare_state == AntiGlareState.IDLE:
            # Check periodic trigger or on-demand request
            should_trigger = self._single_snapshot_requested or (
                self.anti_glare_enabled
                and (now - self._anti_glare_last_trigger_time >= self.anti_glare_interval_sec)
                and self.ssr.get_power() > 0.0
            )

            if should_trigger:
                self._single_snapshot_requested = False
                self._anti_glare_saved_power = self.ssr.get_power()
                self.ssr.set_power(0.0)  # Cut filament power
                self._anti_glare_hold_start_time = now
                self.anti_glare_state = AntiGlareState.HOLDING_OFF
                logger.info("Anti-Glare Snapshot: SSR cut to 0%. Waiting for filament glare to subside...")

        elif self.anti_glare_state == AntiGlareState.HOLDING_OFF:
            if now - self._anti_glare_hold_start_time >= self.anti_glare_cooldown_sec:
                # Filament glare has dissipated. Record clean snapshot on this tick!
                self.anti_glare_state = AntiGlareState.CAPTURING
                self._is_clean_snapshot = True
                logger.info("Anti-Glare Snapshot: Clean frame captured!")

        elif self.anti_glare_state == AntiGlareState.CAPTURING:
            # Restore saved power and return to normal mode
            self.ssr.set_power(self._anti_glare_saved_power)
            self._anti_glare_last_trigger_time = now
            self.anti_glare_state = AntiGlareState.IDLE
            logger.info("Anti-Glare Snapshot: SSR power restored. Resuming normal loop.")

    # --- Public Control Methods ---

    def set_manual_power(self, power_pct: float) -> None:
        """Sets manual power mode with specified percentage."""
        self.mode = ControlMode.MANUAL_PWM
        self.manual_power_pct = max(0.0, min(100.0, float(power_pct)))
        if self.anti_glare_state == AntiGlareState.IDLE:
            self.ssr.set_power(self.manual_power_pct)
        logger.info(f"Control mode set to MANUAL_PWM ({self.manual_power_pct:.1f}%)")

    def set_pid_mode(
        self,
        setpoint: float,
        feedback_source: str = "MLX90640_ROI_AVG",
        kp: Optional[float] = None,
        ki: Optional[float] = None,
        kd: Optional[float] = None,
    ) -> None:
        """Activates PID temperature holding mode."""
        self.mode = ControlMode.PID_HOLD
        self.pid.reset()
        self.pid.set_target(setpoint)
        if kp is not None and ki is not None and kd is not None:
            self.pid.set_tunings(kp, ki, kd)

        if feedback_source.upper() == "MAX6675":
            self.pid_feedback_source = PIDFeedbackSource.MAX6675
        else:
            self.pid_feedback_source = PIDFeedbackSource.MLX90640_ROI_AVG
        logger.info(f"Control mode set to PID_HOLD (Target: {setpoint:.1f}°C, Feedback: {self.pid_feedback_source.value})")

    def turn_off(self) -> None:
        """Sets control mode to OFF and drops power to 0%."""
        self.mode = ControlMode.OFF
        self.ssr.set_power(0.0)
        logger.info("Control mode set to OFF.")

    def start_profile(self, steps: List[Dict[str, Any]]) -> None:
        """Loads and starts an automated experiment profile."""
        self.profile_steps = [
            ExperimentProfileStep(
                name=step.get("name", f"Step {i+1}"),
                duration_sec=float(step.get("duration_sec", 60.0)),
                power_pct=float(step.get("power_pct", 0.0)),
            )
            for i, step in enumerate(steps)
        ]
        self.profile_current_step_idx = 0
        self.profile_step_start_time = time.monotonic()
        self.mode = ControlMode.EXPERIMENT_PROFILE
        logger.info(f"Started experiment profile with {len(self.profile_steps)} steps.")

    def trigger_clean_snapshot(self) -> None:
        """Requests an immediate Anti-Glare clean snapshot."""
        self._single_snapshot_requested = True
        logger.info("On-demand Clean Snapshot requested.")

    def set_anti_glare_config(self, enabled: bool, interval_sec: Optional[float] = None) -> None:
        """Configures periodic anti-glare clean snapshot triggering."""
        self.anti_glare_enabled = enabled
        if interval_sec is not None:
            self.anti_glare_interval_sec = max(5.0, float(interval_sec))
        logger.info(f"Anti-glare config updated: enabled={enabled}, interval={self.anti_glare_interval_sec}s")

    def emergency_stop(self) -> None:
        """Operator emergency stop trigger."""
        self.mode = ControlMode.OFF
        self.watchdog.manual_emergency_trip("Operator triggered Emergency STOP.")
        self.ssr.emergency_stop()

    def reset_emergency(self) -> Tuple[bool, str]:
        """Operator request to clear emergency lockout."""
        t_back = self.max6675.get_primary_temperature()
        t_surf = self.mlx.roi_stats.t_surf_max if hasattr(self.mlx, "roi_stats") else 22.0
        success, msg = self.watchdog.attempt_reset(t_back, t_surf)
        if success:
            self.ssr.clear_emergency()
            self.mode = ControlMode.OFF
        return success, msg
