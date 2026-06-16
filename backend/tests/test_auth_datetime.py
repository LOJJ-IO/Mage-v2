"""Sign-in stay window with mixed timezone-aware Supabase guests."""
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.integrations.pms.base import Reservation
from app.models.schemas import GuestProfile
from app.services import auth_service


def test_sign_in_mixed_naive_fixture_and_aware_db_guest():
    aware_check_in = datetime(2026, 1, 1, 15, 0, tzinfo=timezone.utc)
    aware_check_out = datetime(2026, 12, 31, 11, 0, tzinfo=timezone.utc)

    fixture_res = Reservation(
        booking_id="BK-2026-0412",
        property_id="grand-horizon",
        guest_name="Alex Johnson",
        room_number="412",
        check_in=datetime(2026, 1, 1, 15, 0),
        check_out=datetime(2026, 12, 31, 11, 0),
        email="alex.johnson@email.com",
        in_house=True,
    )
    db_guest = GuestProfile(
        id="guest-existing",
        name="Alex Johnson",
        room_number="412",
        check_in=aware_check_in,
        check_out=aware_check_out,
        booking_id="BK-2026-0412",
        email="alex.johnson@email.com",
        property_id="grand-horizon",
    )

    mock_pms = MagicMock()
    mock_pms.find_reservations_by_contact = AsyncMock(
        return_value=[fixture_res, Reservation(
            booking_id="BK-2026-0412",
            property_id="grand-horizon",
            guest_name=db_guest.name,
            room_number=db_guest.room_number,
            check_in=aware_check_in,
            check_out=aware_check_out,
            email=db_guest.email,
            in_house=True,
        )]
    )

    mock_db = MagicMock()
    mock_db.get_guest_by_booking.return_value = db_guest
    mock_db.upsert_guest.side_effect = lambda g: g
    mock_db.register_guest_session.return_value = 1

    with (
        patch.object(auth_service, "get_settings") as mock_settings,
        patch.object(auth_service, "get_pms_provider", return_value=mock_pms),
        patch.object(auth_service, "get_database", return_value=mock_db),
        patch.object(auth_service, "ensure_demo_property"),
        patch.object(auth_service, "create_session_token", return_value="cookie"),
    ):
        mock_settings.return_value.allow_dev_guest_login = True
        mock_settings.return_value.property_id = "grand-horizon"
        mock_settings.return_value.stay_grace_hours = 12

        guest, cookie, version = asyncio.run(
            auth_service.sign_in_guest_by_email("alex.johnson@email.com")
        )

    assert guest.email == "alex.johnson@email.com"
    assert cookie == "cookie"
    assert version == 1
