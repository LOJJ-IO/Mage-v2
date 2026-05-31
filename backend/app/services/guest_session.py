"""Signed HttpOnly guest session cookies."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request

from app.core.config import get_settings
from app.models.schemas import GuestProfile
from app.services.database import get_database

logger = logging.getLogger(__name__)

SESSION_COOKIE = "mage_session"


@dataclass
class GuestSession:
    guest_id: str
    property_id: str
    session_version: int
    expires_at: datetime


def _signing_key() -> bytes:
    settings = get_settings()
    secret = (settings.auth_secret or settings.staff_access_key or "mage-dev-secret").encode()
    return hashlib.sha256(secret).digest()


def create_session_token(
    guest_id: str,
    property_id: str,
    session_version: int,
    *,
    ttl_hours: Optional[int] = None,
) -> str:
    settings = get_settings()
    hours = ttl_hours if ttl_hours is not None else settings.session_ttl_hours
    expires = datetime.utcnow() + timedelta(hours=hours)
    payload = {
        "guest_id": guest_id,
        "property_id": property_id,
        "session_version": session_version,
        "exp": expires.isoformat(),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(_signing_key(), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw + b"." + sig).decode()


def decode_session_token(token: str) -> Optional[GuestSession]:
    try:
        decoded = base64.urlsafe_b64decode(token.encode())
        raw, sig = decoded.rsplit(b".", 1)
        expected = hmac.new(_signing_key(), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(raw.decode())
        expires = datetime.fromisoformat(payload["exp"])
        if expires < datetime.utcnow():
            return None
        return GuestSession(
            guest_id=payload["guest_id"],
            property_id=payload["property_id"],
            session_version=int(payload["session_version"]),
            expires_at=expires,
        )
    except Exception:
        return None


def get_session_from_request(request: Request) -> Optional[GuestSession]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    session = decode_session_token(token)
    if not session:
        return None
    db = get_database()
    if db.is_guest_session_revoked(session.guest_id, session.property_id, session.session_version):
        return None
    return session


async def get_current_guest(request: Request) -> GuestSession:
    """Require valid guest session cookie."""
    session = get_session_from_request(request)
    if not session:
        raise HTTPException(status_code=401, detail="Guest session required")
    return session


async def get_current_guest_profile(
    session: GuestSession = Depends(get_current_guest),
) -> GuestProfile:
    db = get_database()
    guest = db.get_guest(session.guest_id)
    if not guest:
        raise HTTPException(status_code=401, detail="Guest not found")
    return guest


async def get_optional_guest_session(request: Request) -> Optional[GuestSession]:
    return get_session_from_request(request)


async def resolve_guest_id_for_chat(
    request: Request,
    guest_id: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    """
    Return (guest_id, property_id) for chat endpoints.
    Uses session when dev login disabled; otherwise allows legacy guest_id param.
    """
    settings = get_settings()
    session = get_session_from_request(request)
    if session:
        return session.guest_id, session.property_id
    if settings.allow_dev_guest_login and guest_id:
        db = get_database()
        guest = db.get_guest(guest_id)
        if guest:
            prop = getattr(guest, "property_id", None) or settings.property_id
            return guest_id, prop
        return guest_id, settings.property_id
    if guest_id and settings.allow_dev_guest_login:
        return guest_id, settings.property_id
    return None, None
