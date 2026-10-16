"""Unit tests for safety watchdog temperature thresholds and sensor timeouts."""

import pytest
from backend.services.safety_watchdog import SafetyWatchdog


def test_watchdog_normal_condition():
    dog = SafetyWatchdog(max_back_temp=110.0, max_surf_temp=120.0, disconnect_timeout_sec=1.5)
    tripped, reason = dog.check(t_back=45.0, t_surf_max=55.0, sensors_connected=True)
    assert tripped is False
    assert reason is None


def test_watchdog_back_temp_cutoff():
    dog = SafetyWatchdog(max_back_temp=110.0, max_surf_temp=120.0)
    tripped, reason = dog.check(t_back=112.5, t_surf_max=70.0, sensors_connected=True)
    assert tripped is True
    assert "Backplate temperature" in reason
    assert dog.is_tripped is True


def test_watchdog_surf_temp_cutoff():
    dog = SafetyWatchdog(max_back_temp=110.0, max_surf_temp=120.0)
    tripped, reason = dog.check(t_back=50.0, t_surf_max=125.0, sensors_connected=True)
    assert tripped is True
    assert "Surface temperature" in reason


def test_watchdog_reset_logic():
    dog = SafetyWatchdog(safe_recovery_temp=60.0)
    dog.manual_emergency_trip("Manual test")
    assert dog.is_tripped is True

    # Attempt reset while still hot (75°C) -> should be rejected
    success, msg = dog.attempt_reset(current_t_back=75.0, current_t_surf=50.0)
    assert success is False
    assert dog.is_tripped is True

    # Attempt reset when cooled down (40°C) -> should succeed
    success, msg = dog.attempt_reset(current_t_back=40.0, current_t_surf=38.0)
    assert success is True
    assert dog.is_tripped is False
