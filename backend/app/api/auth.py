"""Guest authentication — magic link verify and session cookie."""
from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.models.schemas import GuestProfile, MagicLinkRequest
from app.services import auth_service
from app.services.guest_session import (
    SESSION_COOKIE,
    get_current_guest_profile,
    get_optional_guest_session,
)
from app.services.database import get_database

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/magic-link")
async def create_magic_link(body: MagicLinkRequest, request: Request):
    """
    Internal/webhook: create one-time token and send email.
    Returns verify_url when DEBUG=true.
    """
    try:
        return await auth_service.request_magic_link(
            body.property_id,
            body.booking_id,
            body.email or "",
            request_host=request.headers.get("host"),
            forwarded_host=request.headers.get("x-forwarded-host"),
            forwarded_proto=request.headers.get("x-forwarded-proto"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/verify")
async def verify_magic_link(
    response: Response,
    t: str = Query(..., min_length=8),
    redirect: bool = Query(True),
):
    """Exchange one-time token for HttpOnly session cookie."""
    try:
        guest, cookie_value, _version = await auth_service.verify_magic_link(t)
    except ValueError as e:
        if redirect:
            return RedirectResponse(
                url=f"/welcome?{urlencode({'auth_error': str(e)})}",
                status_code=302,
            )
        raise HTTPException(status_code=400, detail=str(e))

    if redirect:
        resp = RedirectResponse(url="/", status_code=302)
    else:
        resp = Response(content='{"ok":true}', media_type="application/json")

    resp.set_cookie(
        key=SESSION_COOKIE,
        value=cookie_value,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )
    return resp


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/session")
async def get_session(request: Request):
    session = await get_optional_guest_session(request)
    if not session:
        return {"authenticated": False}
    db = get_database()
    guest = db.get_guest(session.guest_id)
    return {
        "authenticated": True,
        "guest_id": session.guest_id,
        "property_id": session.property_id,
        "guest_name": guest.name if guest else None,
    }
