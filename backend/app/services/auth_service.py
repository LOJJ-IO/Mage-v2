"""Guest auth: magic-link tokens, email delivery, verify flow."""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

from app.core.config import get_settings, resolve_frontend_url
from app.knowledge.property_helpers import ensure_demo_property
from app.integrations.pms.registry import get_pms_provider
from app.models.schemas import GuestProfile
from app.services.database import get_database
from app.services.datetime_helpers import (
    is_within_stay_window,
    stay_has_ended,
    stay_has_not_started,
    utc_naive,
)
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


def build_verify_url(
    token: str,
    *,
    request_host: str | None = None,
    forwarded_host: str | None = None,
    forwarded_proto: str | None = None,
) -> str:
    base = resolve_frontend_url(
        request_host=request_host,
        forwarded_host=forwarded_host,
        forwarded_proto=forwarded_proto,
    ).rstrip("/")
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
        "This link expires soon — bookmark it to sign back in during your stay."
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
    *,
    request_host: str | None = None,
    forwarded_host: str | None = None,
    forwarded_proto: str | None = None,
) -> dict:
    """Internal/webhook: create token and send email."""
    db = get_database()
    prop = ensure_demo_property(db, property_id)
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
    verify_url = build_verify_url(
        raw,
        request_host=request_host,
        forwarded_host=forwarded_host,
        forwarded_proto=forwarded_proto,
    )
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
        check_in=utc_naive(reservation.check_in),
        check_out=utc_naive(reservation.check_out),
        booking_id=reservation.booking_id,
        email=reservation.email,
        phone=reservation.phone,
        membership_tier=reservation.membership_tier,
        property_id=reservation.property_id,
        pms_booking_id=reservation.booking_id,
        pms_guest_id=reservation.pms_guest_id,
    )


async def sign_in_guest_by_email(
    email: str,
    property_id: Optional[str] = None,
) -> tuple[GuestProfile, str, int]:
    """Look up an in-house stay by email via PMS and open a guest session."""
    settings = get_settings()
    if not settings.allow_dev_guest_login:
        raise ValueError("Email sign-in is not enabled")

    pid = (property_id or settings.property_id).strip()
    email_l = (email or "").strip().lower()
    if not email_l:
        raise ValueError("Email is required")

    pms = get_pms_provider(pid)
    reservations = await pms.find_reservations_by_contact(pid, email_l, None)
    if not reservations:
        raise ValueError("No stay found for this email")

    now = datetime.utcnow()
    grace = timedelta(hours=settings.stay_grace_hours)
    active = [
        r
        for r in reservations
        if is_within_stay_window(now, r.check_in, r.check_out, grace=grace)
    ]
    if not active:
        raise ValueError("No active stay found for this email")

    reservation = active[0]
    db = get_database()
    ensure_demo_property(db, pid)
    existing = db.get_guest_by_booking(reservation.booking_id, property_id=pid)
    guest = _reservation_to_guest(
        reservation,
        existing_id=existing.id if existing else None,
    )
    try:
        guest = db.upsert_guest(guest)
        session_version = db.register_guest_session(guest.id, pid)
    except Exception as exc:
        logger.exception("Guest sign-in database write failed for %s", email_l)
        raise ValueError(
            "Database not ready for guest sign-in. Run the Supabase migrations "
            "(docs/supabase_core_migration.sql, then properties, then staff_actions) "
            "in the Supabase SQL editor, then try again."
        ) from exc
    cookie_value = create_session_token(guest.id, pid, session_version)
    return guest, cookie_value, session_version


async def verify_magic_link(token: str) -> tuple[GuestProfile, str, int]:
    """
    Validate token, hydrate guest from PMS, upsert guest row.
    Returns (guest, session_cookie_value, session_version).
    """
    settings = get_settings()
    db = get_database()
    token_hash = _hash_token(token)
    row = db.validate_auth_token(token_hash)
    if not row:
        raise ValueError(
            "Invalid or expired link. Request a new one from this deployment — "
            "localhost links do not work on Vercel."
        )

    property_id = row["property_id"]
    booking_id = row["booking_id"]

    pms = get_pms_provider(property_id)
    reservation = await pms.get_reservation(property_id, booking_id)
    if not reservation:
        raise ValueError("Reservation no longer available")

    now = datetime.utcnow()
    grace = timedelta(hours=settings.stay_grace_hours)
    if stay_has_not_started(now, reservation.check_in, grace=grace):
        raise ValueError("Your stay has not started yet")
    if stay_has_ended(now, reservation.check_out, grace=grace):
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
    """Invalidate sessions and stay links on checkout webhook."""
    db = get_database()
    db.revoke_auth_tokens_for_booking(property_id, booking_id)
    guest = db.get_guest_by_booking(booking_id, property_id=property_id)
    if not guest:
        return 0
    return db.revoke_guest_sessions(guest.id, property_id)
