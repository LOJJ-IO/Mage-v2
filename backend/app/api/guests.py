from fastapi import APIRouter, Depends, HTTPException

from app.api.staff import verify_staff_key
from app.models.schemas import GuestProfile
from app.services.database import get_database
from app.services.guest_session import get_current_guest_profile

router = APIRouter(prefix="/guests", tags=["guests"])


@router.get("/me", response_model=GuestProfile)
async def get_current_guest_me(guest: GuestProfile = Depends(get_current_guest_profile)):
    """Return authenticated guest from session cookie."""
    return guest


@router.get("/{guest_id}", response_model=GuestProfile)
async def get_guest(guest_id: str, guest: GuestProfile = Depends(get_current_guest_profile)):
    """Get guest profile by ID (session must match)."""
    if guest.id != guest_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return guest
