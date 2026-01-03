from fastapi import APIRouter

from app.models.schemas import AgentAvailability
from app.services.database import mock_db

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/availability", response_model=AgentAvailability)
async def get_agent_availability():
    """Get current agent availability status."""
    
    availability = mock_db.get_agent_availability()
    
    return AgentAvailability(
        human_agent_available=availability["human_agent_available"],
        ai_agent_available=availability["ai_agent_available"]
    )


@router.post("/availability/human")
async def set_human_availability(available: bool):
    """Set human agent availability (for testing)."""
    
    mock_db.set_human_agent_available(available)
    
    return {"human_agent_available": available}
