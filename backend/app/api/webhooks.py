"""PMS webhooks — booking events trigger magic links and session revoke."""
from __future__ import annotations

import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.config import get_settings
from app.knowledge.property_helpers import ensure_demo_property
from app.services import auth_service
from app.services.database import get_database

router = APIRouter(prefix="/webhooks/pms", tags=["webhooks"])
logger = logging.getLogger(__name__)
settings = get_settings()


def _verify_signature(body: bytes, signature: str | None, secret: str) -> bool:
    if not secret or not signature:
        return settings.debug
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.replace("sha256=", ""))


@router.post("/{property_id}")
async def pms_webhook(
    property_id: str,
    request: Request,
    x_signature: str | None = Header(None, alias="X-Signature"),
):
    """
    Normalized PMS events:
    - reservation.created / checked_in → send magic link
    - checked_out → revoke guest sessions
    """
    body = await request.body()
    db = get_database()
    prop = ensure_demo_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    secret = settings.webhook_secret or ""
    if not _verify_signature(body, x_signature, secret):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = await request.json()
    event_type = payload.get("event") or payload.get("type", "")
    booking_id = payload.get("booking_id") or payload.get("reservation_id", "")

    if not booking_id:
        raise HTTPException(status_code=400, detail="booking_id required")

    if event_type in ("reservation.created", "checked_in", "check_in"):
        email = payload.get("email", "")
        try:
            result = await auth_service.request_magic_link(property_id, booking_id, email)
            return {"ok": True, "action": "magic_link_sent", **result}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if event_type in ("checked_out", "check_out"):
        count = await auth_service.revoke_sessions_for_booking(property_id, booking_id)
        return {"ok": True, "action": "sessions_revoked", "count": count}

    return {"ok": True, "action": "ignored", "event": event_type}
