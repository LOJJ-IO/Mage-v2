"""Guest authentication — magic link verify and session cookie."""
from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.models.schemas import (
    GuestEmailSignInRequest,
    GuestProfile,
    GuestRegisterRequest,
    GuestSignInByBookingRequest,
    GuestVerifyEmailRequest,
    MagicLinkRequest,
)
from app.services import auth_service
from app.services.guest_session import (
    SESSION_COOKIE,
    get_current_guest_profile,
    get_optional_guest_session,
)
from app.services.database import get_database

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _set_session_cookie(response: Response, cookie_value: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=cookie_value,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )


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
    except Exception as e:
        if settings.debug:
            raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail="Magic link failed. Check server logs.")


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
                url=f"/?{urlencode({'auth_error': str(e)})}",
                status_code=302,
            )
        raise HTTPException(status_code=400, detail=str(e))

    if redirect:
        resp = RedirectResponse(url="/", status_code=302)
    else:
        resp = Response(content='{"ok":true}', media_type="application/json")

    _set_session_cookie(resp, cookie_value)
    return resp


@router.post("/email-sign-in", response_model=GuestProfile)
async def email_sign_in(body: GuestEmailSignInRequest, response: Response):
    """Guest sign-in by email lookup against PMS (dev/demo)."""
    try:
        guest, cookie_value, _version = await auth_service.sign_in_guest_by_email(
            body.email,
            body.property_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _set_session_cookie(response, cookie_value)
    return guest


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


# ---------------------------------------------------------------------------
# Self-serve guest onboarding (Agent 2)
# ---------------------------------------------------------------------------


@router.post("/guest/register")
async def guest_register(body: GuestRegisterRequest, request: Request):
    """
    Step 1: new guest submits stay info → verification email sent.

    Returns { verification_sent, email }.
    In DEBUG mode also includes { verify_url } for local testing.
    """
    try:
        result = await auth_service.register_guest(
            name=body.name,
            email=body.email,
            booking_id=body.booking_id or None,
            check_in=body.check_in,
            check_out=body.check_out,
            room_number=body.room_number or "",
            property_id=body.property_id,
            request_host=request.headers.get("host"),
            forwarded_host=request.headers.get("x-forwarded-host"),
            forwarded_proto=request.headers.get("x-forwarded-proto"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if settings.debug:
            raise HTTPException(status_code=500, detail=str(exc))
        raise HTTPException(status_code=500, detail="Registration failed. Check server logs.")
    return result


@router.post("/guest/verify-email")
async def guest_verify_email(
    request: Request,
    body: GuestVerifyEmailRequest | None = None,
    t: str | None = Query(default=None),
):
    """
    Step 2: consume email-verification token → create guest → send magic link.

    Token accepted in JSON body { token } OR as query param ?t=.
    Returns { verified, magic_link_sent }.
    In DEBUG mode also includes { verify_url } (the magic-link URL).
    """
    token = (body.token if body else None) or t
    if not token:
        raise HTTPException(status_code=422, detail="token is required")
    try:
        result = await auth_service.verify_guest_email(
            token,
            request_host=request.headers.get("host"),
            forwarded_host=request.headers.get("x-forwarded-host"),
            forwarded_proto=request.headers.get("x-forwarded-proto"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if settings.debug:
            raise HTTPException(status_code=500, detail=str(exc))
        raise HTTPException(status_code=500, detail="Email verification failed. Check server logs.")
    return result


@router.post("/guest/sign-in", response_model=GuestProfile)
async def guest_sign_in(body: GuestSignInByBookingRequest, response: Response):
    """
    Returning-guest sign-in: name + booking_id → mage_session cookie + GuestProfile.

    Preserves the same guest_id so conversation history is intact.
    """
    try:
        guest, cookie_value, _version = await auth_service.sign_in_guest_by_name_and_booking(
            name=body.name,
            booking_id=body.booking_id,
            property_id=body.property_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if settings.debug:
            raise HTTPException(status_code=500, detail=str(exc))
        raise HTTPException(status_code=500, detail="Sign-in failed. Check server logs.")

    _set_session_cookie(response, cookie_value)
    return guest
