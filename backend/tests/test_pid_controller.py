"""Unit tests for discrete PID controller with anti-windup."""

import pytest
from backend.services.pid_controller import PIDController


def test_pid_heating_response():
    # Setpoint 60°C, starting cold at 20°C
    pid = PIDController(kp=2.0, ki=0.1, kd=1.0, setpoint=60.0)

    # First call initializes baseline
    out1 = pid.compute(current_val=20.0, now=0.0)
    assert out1 == 0.0

    # Next call after 1 second: error is 40°C -> P = 80, I = 4, Output is 84.0%
    out2 = pid.compute(current_val=20.0, now=1.0)
    assert out2 == 84.0

    # Very cold (0°C) -> error is 60°C -> P = 120 -> Clamped at 100%
    out_cold = pid.compute(current_val=0.0, now=2.0)
    assert out_cold == 100.0

    # Overheated at 80°C -> error is -20°C -> Output should clamp at 0%
    out3 = pid.compute(current_val=80.0, now=3.0)
    assert out3 == 0.0


def test_pid_reset():
    pid = PIDController(kp=2.0, ki=0.1, kd=1.0, setpoint=50.0)
    pid.compute(current_val=20.0, now=0.0)
    pid.compute(current_val=20.0, now=1.0)
    assert pid._integral != 0.0

    pid.reset()
    assert pid._integral == 0.0
    assert pid._last_error is None
