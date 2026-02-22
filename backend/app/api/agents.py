import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.schemas import AgentAvailability
from app.services.database import get_database

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])


class ConnectionManager:
    """In-memory set of active WebSocket connections for broadcasting availability."""

    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def broadcast(self, data: dict) -> None:
        dead = set()
        for ws in self._connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections.discard(ws)


manager = ConnectionManager()


@router.get("/availability", response_model=AgentAvailability)
async def get_agent_availability():
    """Get current agent availability status."""
    
    db = get_database()
    availability = db.get_agent_availability()
    
    return AgentAvailability(
        human_agent_available=availability["human_agent_available"],
        ai_agent_available=availability["ai_agent_available"]
    )


@router.websocket("/ws")
async def websocket_agent_availability(websocket: WebSocket):
    """WebSocket endpoint: send current availability on connect, client receives pushes on change."""
    await manager.connect(websocket)
    try:
        db = get_database()
        availability = db.get_agent_availability()
        await websocket.send_json({
            "human_agent_available": availability["human_agent_available"],
            "ai_agent_available": availability["ai_agent_available"],
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)


@router.post("/availability/human")
async def set_human_availability(available: bool):
    """Set human agent availability (for testing)."""
    
    db = get_database()
    db.set_human_agent_available(available)
    availability = db.get_agent_availability()
    await manager.broadcast({
        "human_agent_available": availability["human_agent_available"],
        "ai_agent_available": availability["ai_agent_available"],
    })
    
    return {"human_agent_available": available}
