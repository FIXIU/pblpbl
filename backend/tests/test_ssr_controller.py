"""Unit tests for SSR-40DA slow PWM controller and emergency stop."""

import time
import pytest
from backend.hardware.ssr_controller import SSRController


def test_ssr_power_clamping():
    ssr = SSRController(simulation_mode=True, pwm_window_sec=0.5)
    try:
        assert ssr.set_power(-10) == 0.0
        assert ssr.get_power() == 0.0

        assert ssr.set_power(150) == 100.0
        assert ssr.get_power() == 100.0

        assert ssr.set_power(45.5) == 45.5
        assert ssr.get_power() == 45.5
    finally:
        ssr.close()


def test_ssr_emergency_stop():
    ssr = SSRController(simulation_mode=True, pwm_window_sec=0.5)
    try:
        ssr.set_power(75.0)
        assert ssr.get_power() == 75.0

        # Trigger emergency stop
        ssr.emergency_stop()
        assert ssr.is_emergency_locked() is True
        assert ssr.get_power() == 0.0

        # Setting power while locked must be ignored
        ssr.set_power(50.0)
        assert ssr.get_power() == 0.0

        # Clear emergency
        ssr.clear_emergency()
        assert ssr.is_emergency_locked() is False
        assert ssr.get_power() == 0.0

        # Setting power now succeeds
        ssr.set_power(30.0)
        assert ssr.get_power() == 30.0
    finally:
        ssr.close()
