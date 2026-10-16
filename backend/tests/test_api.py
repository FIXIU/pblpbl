"""End-to-end integration tests for FastAPI REST endpoints."""

import pytest
from fastapi.testclient import TestClient
from backend.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"


def test_get_status(client):
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "mode" in data
    assert "ssr_power_pct" in data
    assert "roi" in data


def test_control_modes(client):
    # Set manual power
    res = client.post("/api/control", json={"mode": "MANUAL_PWM", "power_pct": 35.0})
    assert res.status_code == 200
    assert res.json()["power_pct"] == 35.0

    # Set PID mode
    res = client.post(
        "/api/control",
        json={"mode": "PID_HOLD", "setpoint_temp": 65.0, "feedback_source": "MLX90640_ROI_AVG"},
    )
    assert res.status_code == 200
    assert res.json()["setpoint"] == 65.0

    # Turn OFF
    res = client.post("/api/control", json={"mode": "OFF"})
    assert res.status_code == 200
    assert res.json()["ssr_power_pct"] == 0.0


def test_roi_update(client):
    res = client.post("/api/roi", json={"x_min": 5, "x_max": 20, "y_min": 4, "y_max": 16})
    assert res.status_code == 200
    roi = res.json()["roi"]
    assert roi["x_min"] == 5
    assert roi["x_max"] == 20


def test_session_lifecycle_api(client):
    # Start session
    res = client.post(
        "/api/session/start",
        json={"session_name": "API_Test", "coating_name": "White_Reflective_CoolRoof"},
    )
    assert res.status_code == 200
    session_info = res.json()["session"]
    assert session_info["is_active"] is True
    assert session_info["session_name"] == "API_Test"

    # List sessions
    res_list = client.get("/api/sessions")
    assert res_list.status_code == 200
    sessions = res_list.json()["sessions"]
    assert len(sessions) >= 1

    # Stop session
    res_stop = client.post("/api/session/stop")
    assert res_stop.status_code == 200
    assert res_stop.json()["session"]["is_active"] is False


def test_emergency_stop_and_reset(client):
    # Trigger emergency stop
    res = client.post("/api/emergency-stop")
    assert res.status_code == 200
    assert res.json()["status"] == "emergency_locked"

    # Check status
    stat = client.get("/api/status").json()
    assert stat["safety_tripped"] is True
    assert stat["ssr_power_pct"] == 0.0

    # Reset emergency
    res_reset = client.post("/api/emergency-reset")
    assert res_reset.status_code == 200
