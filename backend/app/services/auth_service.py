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
from app.models.schemas import GuestProfile, GuestAccountTier
from app.services.database import get_database
from app.services.datetime_helpers import (
    is_within_stay_window,
    stay_has_ended,
    stay_has_not_started,
    utc_naive,
)
from app.services.email_service import send_email
from app.emails.magic_link import build_magic_link_plain_text, render_magic_link_html
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
    subject = f"Your link to chat with {property_name}"
    body = build_magic_link_plain_text(property_name=property_name, verify_url=verify_url)
    html_body = render_magic_link_html(property_name=property_name, verify_url=verify_url)
    await send_email(email, subject, body, html=html_body)


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


def _reservation_to_guest(
    reservation,
    existing_id: Optional[str] = None,
    *,
    account_tier: GuestAccountTier = GuestAccountTier.PILOT_TESTER,
) -> GuestProfile:
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
        account_tier=account_tier,
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
        account_tier=GuestAccountTier.DEV_INTERNAL,
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

    # Consume the token so it cannot be replayed.
    db.mark_auth_token_used(token_hash)

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


# ---------------------------------------------------------------------------
# Self-serve guest onboarding (Agent 2)
# ---------------------------------------------------------------------------

_VERIFY_TOKEN_TTL_HOURS = 24


def _generate_booking_id(*, property_id: str, db) -> str:
    """Create a unique booking ID for self-serve registration."""
    year = datetime.utcnow().year
    for _ in range(10):
        candidate = f"BK-{year}-{secrets.token_hex(4).upper()}"
        if not db.get_guest_by_booking(candidate, property_id=property_id):
            return candidate
    return f"BK-{year}-{uuid.uuid4().hex[:8].upper()}"


def _generate_room_number() -> str:
    """Assign a random hotel-style room number when the guest omits one."""
    return str(secrets.randbelow(900) + 100)


def _build_email_verify_url(
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
    return f"{base}/onboard/guest/verify?{urlencode({'t': token})}"


async def register_guest(
    name: str,
    email: str,
    booking_id: Optional[str],
    check_in: datetime,
    check_out: datetime,
    *,
    room_number: str = "",
    property_id: Optional[str] = None,
    request_host: str | None = None,
    forwarded_host: str | None = None,
    forwarded_proto: str | None = None,
) -> dict:
    """
    Self-serve guest registration.

    Creates (or upserts) the guest record immediately and sends a magic-link
    email in a single step — no intermediate email-verification hop.

    Returns {"magic_link_sent": True, "email": email} always.
    In DEBUG mode also returns {"verify_url": <magic-link-url>}.
    """
    settings = get_settings()
    pid = (property_id or settings.property_id).strip()

    name = name.strip()
    email = email.strip().lower()
    booking_id = (booking_id or "").strip()

    if not name:
        raise ValueError("Name is required")
    if not email:
        raise ValueError("Email is required")
    if not check_in or not check_out:
        raise ValueError("Check-in and check-out dates are required")
    if check_out <= check_in:
        raise ValueError("Check-out must be after check-in")

    db = get_database()
    prop = ensure_demo_property(db, pid)
    if not prop:
        raise ValueError(f"Unknown property: {pid}")

    if not booking_id:
        booking_id = _generate_booking_id(property_id=pid, db=db)

    room_number = (room_number or "").strip() or _generate_room_number()

    # Upsert the guest row — preserve existing guest_id if booking already known.
    existing = db.get_guest_by_booking(booking_id, property_id=pid)
    guest_id = existing.id if existing else f"guest-{uuid.uuid4().hex[:8]}"

    guest = GuestProfile(
        id=guest_id,
        name=name,
        room_number=room_number,
        check_in=utc_naive(check_in),
        check_out=utc_naive(check_out),
        booking_id=booking_id,
        email=email,
        property_id=pid,
    )
    db.upsert_guest(guest)

    # Issue a magic link directly — one email, one click to sign in.
    raw_ml, _expires = create_magic_link_token(pid, booking_id)
    verify_url = build_verify_url(
        raw_ml,
        request_host=request_host,
        forwarded_host=forwarded_host,
        forwarded_proto=forwarded_proto,
    )
    await send_magic_link_email(email, verify_url, property_name=prop.name)

    result: dict = {"magic_link_sent": True, "email": email}
    if settings.debug:
        result["verify_url"] = verify_url
    return result


async def verify_guest_email(
    token: str,
    *,
    request_host: str | None = None,
    forwarded_host: str | None = None,
    forwarded_proto: str | None = None,
) -> dict:
    """
    Step 2 of self-serve guest onboarding.

    Consumes the email-verification token (one-time use), creates/upserts the
    guest record, and triggers a magic-link email so the guest can sign in.

    Returns {"verified": True, "magic_link_sent": True}.
    In DEBUG mode also returns {"verify_url": <magic-link-url>}.
    """
    settings = get_settings()
    db = get_database()

    token_hash = _hash_token(token)
    row = db.consume_email_verification(token_hash)
    if not row:
        raise ValueError("Invalid or expired verification link. Please register again.")

    guest_data: dict = row["guest_data"]
    pid: str = row["property_id"]
    email: str = row["email"]
    booking_id: str = row["booking_id"]

    prop = ensure_demo_property(db, pid)
    if not prop:
        raise ValueError(f"Unknown property: {pid}")

    # Upsert the guest row — preserve existing guest_id if booking already known.
    existing = db.get_guest_by_booking(booking_id, property_id=pid)
    guest_id = existing.id if existing else f"guest-{uuid.uuid4().hex[:8]}"

    check_in_dt = datetime.fromisoformat(guest_data["check_in"])
    check_out_dt = datetime.fromisoformat(guest_data["check_out"])

    guest = GuestProfile(
        id=guest_id,
        name=guest_data["name"],
        room_number=guest_data.get("room_number") or "",
        check_in=utc_naive(check_in_dt),
        check_out=utc_naive(check_out_dt),
        booking_id=booking_id,
        email=email,
        property_id=pid,
    )
    db.upsert_guest(guest)

    # Now issue a magic link for the verified guest.
    raw_ml, _expires = create_magic_link_token(pid, booking_id)
    verify_url = build_verify_url(
        raw_ml,
        request_host=request_host,
        forwarded_host=forwarded_host,
        forwarded_proto=forwarded_proto,
    )
    await send_magic_link_email(email, verify_url, property_name=prop.name)

    result: dict = {"verified": True, "magic_link_sent": True}
    if settings.debug:
        result["verify_url"] = verify_url
    return result


async def sign_in_guest_by_name_and_booking(
    name: str,
    booking_id: str,
    property_id: Optional[str] = None,
) -> tuple[GuestProfile, str, int]:
    """
    Returning-guest sign-in: name + booking_id → session cookie.

    Name matching is case-insensitive with whitespace trimming.
    Returns (guest, session_cookie_value, session_version).
    Preserves existing guest_id so conversation history is intact.
    """
    settings = get_settings()
    pid = (property_id or settings.property_id).strip()

    name = name.strip()
    booking_id = booking_id.strip()

    if not name:
        raise ValueError("Name is required")
    if not booking_id:
        raise ValueError("Booking ID is required")

    db = get_database()
    ensure_demo_property(db, pid)

    guest = db.get_guest_by_name_and_booking(name, booking_id, property_id=pid)
    if not guest:
        raise ValueError("No stay found matching that name and booking ID.")

    try:
        session_version = db.register_guest_session(guest.id, pid)
    except Exception as exc:
        logger.exception("Session registration failed for booking %s", booking_id)
        raise ValueError(
            "Database not ready for guest sign-in. Run the Supabase migrations "
            "and try again."
        ) from exc

    cookie_value = create_session_token(guest.id, pid, session_version)
    return guest, cookie_value, session_version
