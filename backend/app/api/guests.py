from fastapi import APIRouter, HTTPException

from app.models.schemas import GuestProfile
from app.services.database import get_database

router = APIRouter(prefix="/guests", tags=["guests"])


@router.get("/{guest_id}", response_model=GuestProfile)
async def get_guest(guest_id: str):
    """Get guest profile by ID."""
    
    db = get_database()
    guest = db.get_guest(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    
    return guest


@router.get("/booking/{booking_id}", response_model=GuestProfile)
async def get_guest_by_booking(booking_id: str):
    """Get guest profile by booking ID."""
    
    db = get_database()
    guest = db.get_guest_by_booking(booking_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    
    return guest
