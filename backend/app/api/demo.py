"""Sales demo entry — opens the demo hotel (see app.demo) as staff, admin or a guest."""
import time
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.demo import DEMO_STAFF_KEY
from app.demo.seed import RESEED_AFTER, create_demo_visitor, get_demo_database
from app.services.guest_session import SESSION_COOKIE, create_session_token

router = APIRouter(prefix="/demo", tags=["demo"])

# A forced reseed rebuilds the whole hotel for every visitor; once a minute is plenty.
_FORCE_EVERY_SECONDS = 60
_last_force = [float("-inf")]


@router.post("/enter")
async def enter_demo(
    as_: Literal["staff", "admin", "guest"] = Query("staff", alias="as"),
    fresh: bool = False,
):
    """Seeds the demo hotel if it's missing or stale (`fresh=1` rebuilds it
    now), then hands back a way in: the demo manager's staff key for staff
    and admin, or a session cookie for a new demo guest."""
    settings = get_settings()
    if not settings.demo_enabled:
        raise HTTPException(status_code=404, detail="Demo is not available")
    force = False
    if fresh and time.monotonic() - _last_force[0] > _FORCE_EVERY_SECONDS:
        _last_force[0] = time.monotonic()
        force = True
    db = get_demo_database(force=force)

    if as_ != "guest":
        return {"staff_key": DEMO_STAFF_KEY, "role": "manager"}

    guest = create_demo_visitor()
    version = db.register_guest_session(guest.id, guest.property_id)
    ttl_hours = int(RESEED_AFTER.total_seconds() // 3600)
    response = JSONResponse({"guest": guest.model_dump(mode="json")})
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(guest.id, guest.property_id, version, ttl_hours=ttl_hours),
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        max_age=ttl_hours * 3600,
        path="/",
    )
    return response
