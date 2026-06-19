"""Returning guest sign-in by email or booking ID."""
import asyncio
from datetime import datetime, timedelta
from unittest.mock import patch

from app.models.schemas import GuestProfile
from app.services import auth_service
from app.services.database import MockDatabase


def _active_guest(**overrides) -> GuestProfile:
    now = datetime.utcnow()
    defaults = dict(
        id="guest-abc",
        name="Jane Doe",
        room_number="204",
        check_in=now - timedelta(days=1),
        check_out=now + timedelta(days=2),
        booking_id="BK-2026-TEST01",
        email="jane@example.com",
        property_id="grand-horizon",
    )
    defaults.update(overrides)
    return GuestProfile(**defaults)


def _run_sign_in(db: MockDatabase, **kwargs):
    with (
        patch.object(auth_service, "get_database", return_value=db),
        patch.object(auth_service, "get_settings") as mock_settings,
        patch.object(auth_service, "ensure_demo_property"),
        patch.object(auth_service, "create_session_token", return_value="session-cookie"),
    ):
        mock_settings.return_value.property_id = "grand-horizon"
        mock_settings.return_value.stay_grace_hours = 12
        return asyncio.run(auth_service.sign_in_returning_guest(**kwargs))


def test_sign_in_by_email():
    db = MockDatabase()
    guest = _active_guest()
    db.upsert_guest(guest)

    signed_in, cookie, version = _run_sign_in(db, email="jane@example.com")

    assert signed_in.id == guest.id
    assert cookie == "session-cookie"
    assert version == 1


def test_sign_in_by_booking_id():
    db = MockDatabase()
    guest = _active_guest()
    db.upsert_guest(guest)

    signed_in, cookie, _version = _run_sign_in(db, booking_id="BK-2026-TEST01")

    assert signed_in.id == guest.id
    assert cookie == "session-cookie"


def test_sign_in_email_case_insensitive():
    db = MockDatabase()
    guest = _active_guest(email="Jane@Example.COM")
    db.upsert_guest(guest)

    signed_in, _, _ = _run_sign_in(db, email="jane@example.com")

    assert signed_in.id == guest.id


def test_sign_in_rejects_mismatched_email_and_booking():
    db = MockDatabase()
    db.upsert_guest(_active_guest(id="guest-1", email="a@example.com", booking_id="BK-A"))
    db.upsert_guest(_active_guest(id="guest-2", email="b@example.com", booking_id="BK-B"))

    try:
        _run_sign_in(db, email="a@example.com", booking_id="BK-B")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "do not match" in str(exc).lower()


def test_sign_in_rejects_ended_stay():
    db = MockDatabase()
    now = datetime.utcnow()
    guest = _active_guest(
        check_in=now - timedelta(days=10),
        check_out=now - timedelta(days=5),
    )
    db.upsert_guest(guest)

    try:
        _run_sign_in(db, email=guest.email)
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "ended" in str(exc).lower()


def test_sign_in_not_found():
    db = MockDatabase()

    try:
        _run_sign_in(db, booking_id="BK-MISSING")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "no stay found" in str(exc).lower()
