"""Guest auth: magic-link tokens, email delivery, verify flow."""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

from app.core.config import get_settings
from app.integrations.pms.registry import get_pms_provider
from app.models.schemas import GuestProfile
from app.services.database import get_database
from app.services.guest_session import create_session_token

logger = logging.getLogger(__name__)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_magic_link_token(property_id: str, booking_id: str) -> tuple[str, datetime]:
    """Create one-time opaque token; store hash in DB."""
    settings = get_settings()
    raw = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=settings.auth_token_ttl_hours)
    db = get_database()
    db.create_auth_token(
        token_hash=_hash_token(raw),
        property_id=property_id,
        booking_id=booking_id,
        expires_at=expires,
    )
    return raw, expires


def build_verify_url(token: str) -> str:
    settings = get_settings()
    base = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    return f"{base}/auth/verify?{urlencode({'t': token})}"


async def send_magic_link_email(
    email: str,
    verify_url: str,
    *,
    property_name: str,
) -> None:
    settings = get_settings()
    subject = f"Your link to chat with {property_name}"
    body = (
        f"Use this link to access the guest assistant for {property_name}:\n\n"
        f"{verify_url}\n\n"
        "This link expires soon and can only be used once."
    )
    if settings.debug:
        logger.info("Magic link for %s: %s", email, verify_url)
        return
    provider = (settings.email_provider or "").strip().lower()
    if not provider:
        logger.warning("EMAIL_PROVIDER not set; magic link logged only (debug off)")
        logger.info("Magic link for %s: %s", email, verify_url)
        return
    # Placeholder for Resend/SendGrid — log until credentials wired
    logger.info(
        "Would send email via %s to %s: subject=%r body=%r",
        provider,
        email,
        subject,
        body[:200],
    )


async def request_magic_link(
    property_id: str,
    booking_id: str,
    email: str,
) -> dict:
    """Internal/webhook: create token and send email."""
    db = get_database()
    prop = db.get_property(property_id)
    if not prop:
        raise ValueError(f"Unknown property: {property_id}")

    pms = get_pms_provider(property_id)
    reservation = await pms.get_reservation(property_id, booking_id)
    if not reservation:
        raise ValueError("Reservation not found")
    if email and reservation.email and email.lower() != reservation.email.lower():
        raise ValueError("Email does not match reservation")

    target_email = email or reservation.email
    if not target_email:
        raise ValueError("No email on reservation")

    raw, expires = create_magic_link_token(property_id, booking_id)
    verify_url = build_verify_url(raw)
    await send_magic_link_email(target_email, verify_url, property_name=prop.name)

    result = {"sent": True, "expires_at": expires.isoformat()}
    if get_settings().debug:
        result["verify_url"] = verify_url
    return result


def _reservation_to_guest(reservation, existing_id: Optional[str] = None) -> GuestProfile:
    guest_id = existing_id or f"guest-{uuid.uuid4().hex[:8]}"
    return GuestProfile(
        id=guest_id,
        name=reservation.guest_name,
        room_number=reservation.room_number,
        check_in=reservation.check_in,
        check_out=reservation.check_out,
        booking_id=reservation.booking_id,
        email=reservation.email,
        phone=reservation.phone,
        membership_tier=reservation.membership_tier,
        property_id=reservation.property_id,
        pms_booking_id=reservation.booking_id,
        pms_guest_id=reservation.pms_guest_id,
    )


async def verify_magic_link(token: str) -> tuple[GuestProfile, str, int]:
    """
    Validate token, hydrate guest from PMS, upsert guest row.
    Returns (guest, session_cookie_value, session_version).
    """
    settings = get_settings()
    db = get_database()
    token_hash = _hash_token(token)
    row = db.consume_auth_token(token_hash)
    if not row:
        raise ValueError("Invalid or expired link")

    property_id = row["property_id"]
    booking_id = row["booking_id"]

    pms = get_pms_provider(property_id)
    reservation = await pms.get_reservation(property_id, booking_id)
    if not reservation:
        raise ValueError("Reservation no longer available")

    now = datetime.utcnow()
    grace = timedelta(hours=settings.stay_grace_hours)
    if now < reservation.check_in - grace:
        raise ValueError("Your stay has not started yet")
    if now > reservation.check_out + grace:
        raise ValueError("Your stay has ended")

    existing = db.get_guest_by_booking(booking_id, property_id=property_id)
    guest = _reservation_to_guest(
        reservation,
        existing_id=existing.id if existing else None,
    )
    guest = db.upsert_guest(guest)

    session_version = db.register_guest_session(guest.id, property_id)
    cookie_value = create_session_token(guest.id, property_id, session_version)
    return guest, cookie_value, session_version


async def revoke_sessions_for_booking(property_id: str, booking_id: str) -> int:
    """Invalidate sessions on checkout webhook."""
    db = get_database()
    guest = db.get_guest_by_booking(booking_id, property_id=property_id)
    if not guest:
        return 0
    return db.revoke_guest_sessions(guest.id, property_id)
