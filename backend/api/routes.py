"""FastAPI REST routes for system status, actuator control, ROI setup, and session management."""

import logging
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from backend.api.models import (
    AntiGlareRequest,
    ControlRequest,
    ROIRequest,
    SessionStartRequest,
    SystemStatusResponse,
)
from backend.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["API"])

# Dependency container set in main.py
_app_context: Dict[str, Any] = {}


def set_app_context(context: Dict[str, Any]) -> None:
    global _app_context
    _app_context = context


def get_experiment_manager():
    mgr = _app_context.get("experiment_manager")
    if mgr is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ExperimentManager not initialized.",
        )
    return mgr


@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status(mgr=Depends(get_experiment_manager)):
    """Returns current system mode, safety status, active session, and ROI."""
    telemetry = mgr.get_latest_telemetry()
    return SystemStatusResponse(
        status="ok",
        simulation_mode=settings.simulation_mode,
        mode=mgr.mode.value,
        ssr_power_pct=mgr.ssr.get_power(),
        safety_tripped=mgr.watchdog.is_tripped,
        safety_message=mgr.watchdog.trip_reason,
        roi=mgr.mlx.roi.to_dict(),
        session=mgr.logger.get_status(),
        anti_glare_enabled=mgr.anti_glare_enabled,
        anti_glare_interval_sec=mgr.anti_glare_interval_sec,
    )


@router.post("/control")
async def set_control_mode(req: ControlRequest, mgr=Depends(get_experiment_manager)):
    """Switches control mode (OFF, MANUAL_PWM, PID_HOLD, EXPERIMENT_PROFILE)."""
    target_mode = req.mode.upper()

    if target_mode == "OFF":
        mgr.turn_off()
        return {"status": "success", "mode": "OFF", "ssr_power_pct": 0.0}

    if target_mode == "MANUAL_PWM":
        if req.power_pct is None:
            raise HTTPException(status_code=400, detail="power_pct is required for MANUAL_PWM mode.")
        mgr.set_manual_power(req.power_pct)
        return {"status": "success", "mode": "MANUAL_PWM", "power_pct": mgr.manual_power_pct}

    if target_mode == "PID_HOLD":
        if req.setpoint_temp is None:
            raise HTTPException(status_code=400, detail="setpoint_temp is required for PID_HOLD mode.")
        mgr.set_pid_mode(
            setpoint=req.setpoint_temp,
            feedback_source=req.feedback_source or "MLX90640_ROI_AVG",
            kp=req.kp,
            ki=req.ki,
            kd=req.kd,
        )
        return {
            "status": "success",
            "mode": "PID_HOLD",
            "setpoint": req.setpoint_temp,
            "feedback_source": mgr.pid_feedback_source.value,
        }

    if target_mode == "EXPERIMENT_PROFILE":
        if not req.profile_steps:
            raise HTTPException(status_code=400, detail="profile_steps is required for EXPERIMENT_PROFILE.")
        mgr.start_profile(req.profile_steps)
        return {"status": "success", "mode": "EXPERIMENT_PROFILE", "steps_count": len(req.profile_steps)}

    raise HTTPException(status_code=400, detail=f"Unknown mode: {req.mode}")


@router.post("/roi")
async def set_roi_bounding_box(req: ROIRequest, mgr=Depends(get_experiment_manager)):
    """Updates the 10x15 cm plate Region of Interest bounding box on the 32x24 grid."""
    updated = mgr.mlx.set_roi(
        x_min=req.x_min,
        x_max=req.x_max,
        y_min=req.y_min,
        y_max=req.y_max,
    )
    return {"status": "success", "roi": updated.to_dict()}


@router.post("/anti-glare")
async def configure_anti_glare(req: AntiGlareRequest, mgr=Depends(get_experiment_manager)):
    """Configures periodic clean snapshot mode ("Pomiar bez odbić IR")."""
    mgr.set_anti_glare_config(enabled=req.enabled, interval_sec=req.interval_sec)
    return {
        "status": "success",
        "anti_glare_enabled": mgr.anti_glare_enabled,
        "interval_sec": mgr.anti_glare_interval_sec,
    }


@router.post("/anti-glare/trigger")
async def trigger_anti_glare_snapshot(mgr=Depends(get_experiment_manager)):
    """Manually triggers an immediate clean anti-glare snapshot."""
    mgr.trigger_clean_snapshot()
    return {"status": "success", "message": "Clean snapshot scheduled on next cycle."}


@router.post("/session/start")
async def start_session(req: SessionStartRequest, mgr=Depends(get_experiment_manager)):
    """Starts recording an experiment session to CSV."""
    res = mgr.logger.start_session(session_name=req.session_name, coating_name=req.coating_name)
    return {"status": "success", "session": res}


@router.post("/session/stop")
async def stop_session(mgr=Depends(get_experiment_manager)):
    """Stops the active recording session and closes the CSV file."""
    res = mgr.logger.stop_session()
    return {"status": "success", "session": res}


@router.get("/sessions")
async def list_sessions(mgr=Depends(get_experiment_manager)):
    """Lists all saved session CSV files available for download."""
    return {"sessions": mgr.logger.list_sessions()}


@router.get("/sessions/{filename}/download")
async def download_session_file(filename: str, mgr=Depends(get_experiment_manager)):
    """Downloads a specific session CSV file to the phone or laptop."""
    file_path = mgr.logger.get_session_file(filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="Session file not found.")
    return FileResponse(
        path=file_path,
        media_type="text/csv",
        filename=filename,
    )


@router.delete("/sessions/{filename}")
async def delete_session_file(filename: str, mgr=Depends(get_experiment_manager)):
    """Deletes a session CSV file."""
    deleted = mgr.logger.delete_session_file(filename)
    if not deleted:
        raise HTTPException(status_code=404, detail="File could not be found or deleted.")
    return {"status": "success", "message": f"File {filename} deleted."}


@router.post("/emergency-stop")
async def emergency_stop(mgr=Depends(get_experiment_manager)):
    """Immediately cuts SSR power and locks down heating."""
    mgr.emergency_stop()
    return {"status": "emergency_locked", "message": "SSR power cut to 0%."}


@router.post("/emergency-reset")
async def emergency_reset(mgr=Depends(get_experiment_manager)):
    """Attempts to clear emergency trip if temperatures are within safe thresholds."""
    success, msg = mgr.reset_emergency()
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}
