from fastapi import APIRouter, Depends, Header, HTTPException
from typing import List, Optional

from app.core.config import get_settings
from app.models.schemas import StaffAction, StaffActionStatus, UpdateStaffActionRequest
from app.services.database import get_database

router = APIRouter(prefix="/staff", tags=["staff"])


def verify_staff_key(x_staff_key: Optional[str] = Header(None, alias="X-Staff-Key")):
    settings = get_settings()
    if not x_staff_key or x_staff_key != settings.staff_access_key:
        raise HTTPException(status_code=401, detail="Invalid or missing staff key")
    return True


@router.get("/actions", response_model=List[StaffAction])
async def list_staff_actions(
    status: Optional[StaffActionStatus] = None,
    limit: int = 50,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    return db.list_staff_actions(limit=min(limit, 100), status=status)


@router.get("/actions/{action_id}", response_model=StaffAction)
async def get_staff_action(
    action_id: str,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    action = db.get_staff_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@router.patch("/actions/{action_id}", response_model=StaffAction)
async def update_staff_action(
    action_id: str,
    request: UpdateStaffActionRequest,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    action = db.update_staff_action_status(action_id, request.status)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action
