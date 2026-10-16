"""Pydantic schemas for REST API and WebSocket payloads."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ROIRequest(BaseModel):
    x_min: int = Field(..., ge=0, le=30, description="Minimum X coordinate in 32x24 grid")
    x_max: int = Field(..., ge=1, le=31, description="Maximum X coordinate in 32x24 grid")
    y_min: int = Field(..., ge=0, le=22, description="Minimum Y coordinate in 32x24 grid")
    y_max: int = Field(..., ge=1, le=23, description="Maximum Y coordinate in 32x24 grid")


class ControlRequest(BaseModel):
    mode: str = Field(..., description="OFF, MANUAL_PWM, PID_HOLD, or EXPERIMENT_PROFILE")
    power_pct: Optional[float] = Field(None, ge=0.0, le=100.0, description="SSR power percentage")
    setpoint_temp: Optional[float] = Field(None, ge=10.0, le=150.0, description="PID target temperature in °C")
    feedback_source: Optional[str] = Field("MLX90640_ROI_AVG", description="MAX6675 or MLX90640_ROI_AVG")
    kp: Optional[float] = Field(None, ge=0.0)
    ki: Optional[float] = Field(None, ge=0.0)
    kd: Optional[float] = Field(None, ge=0.0)
    profile_steps: Optional[List[Dict[str, Any]]] = None


class AntiGlareRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable periodic anti-glare snapshots")
    interval_sec: Optional[float] = Field(None, ge=5.0, le=3600.0, description="Snapshot interval in seconds")


class SessionStartRequest(BaseModel):
    session_name: str = Field(..., min_length=1, max_length=100, description="Name or identifier of the test session")
    coating_name: str = Field(..., min_length=1, max_length=100, description="Name of the sample coating applied to the 10x15cm plate")
    notes: Optional[str] = Field(None, max_length=500)


class SystemStatusResponse(BaseModel):
    status: str
    simulation_mode: bool
    mode: str
    ssr_power_pct: float
    safety_tripped: bool
    safety_message: Optional[str]
    roi: Dict[str, int]
    session: Dict[str, Any]
    anti_glare_enabled: bool
    anti_glare_interval_sec: float
