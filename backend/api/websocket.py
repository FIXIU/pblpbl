"""WebSocket Telemetry Broadcaster for 4 Hz Real-Time Streaming."""

import asyncio
import json
import logging
from typing import List, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

ws_router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """Manages active WebSocket connections from smartphone and browser clients."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict) -> None:
        if not self.active_connections:
            return

        payload = json.dumps(message)
        dead_connections: List[WebSocket] = []

        for conn in list(self.active_connections):
            try:
                await conn.send_text(payload)
            except Exception:
                dead_connections.append(conn)

        for dead in dead_connections:
            self.disconnect(dead)


ws_manager = ConnectionManager()


@ws_router.websocket("/ws/telemetry")
async def telemetry_websocket_endpoint(websocket: WebSocket):
    """Streams 4 Hz telemetry data and accepts inbound mobile commands."""
    await ws_manager.connect(websocket)

    from backend.api.routes import get_experiment_manager

    try:
        mgr = get_experiment_manager()
    except Exception:
        mgr = None

    try:
        while True:
            # Listen for inbound commands from phone/client
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
                action = msg.get("action")

                if action == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                elif action == "emergency_stop" and mgr:
                    mgr.emergency_stop()
                    await websocket.send_text(json.dumps({"type": "ack", "action": "emergency_stop"}))
                elif action == "set_power" and mgr:
                    val = float(msg.get("value", 0.0))
                    mgr.set_manual_power(val)
                    await websocket.send_text(json.dumps({"type": "ack", "action": "set_power", "value": val}))
                elif action == "trigger_snapshot" and mgr:
                    mgr.trigger_clean_snapshot()
                    await websocket.send_text(json.dumps({"type": "ack", "action": "trigger_snapshot"}))
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.debug(f"WebSocket connection error: {exc}")
        ws_manager.disconnect(websocket)
