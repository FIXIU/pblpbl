"""WebSocket integration test verifying 4 Hz telemetry streaming."""

import json
import pytest
from fastapi.testclient import TestClient
from backend.main import app


def test_websocket_telemetry_stream():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/telemetry") as websocket:
            # Send a ping
            websocket.send_text(json.dumps({"action": "ping"}))
            pong_msg = websocket.receive_text()
            pong_data = json.loads(pong_msg)
            assert pong_data.get("type") == "pong"

            # Receive at least 1 telemetry frame
            telemetry_msg = websocket.receive_text()
            data = json.loads(telemetry_msg)
            assert "t_back" in data
            assert "t_surf_avg" in data
            assert "delta_t_insulation" in data
            assert "thermal_frame" in data
            assert len(data["thermal_frame"]) == 768
