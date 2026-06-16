"""Mock PMS — reads/writes guest rows via DatabaseProtocol."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.integrations.pms.base import PMSProvider, Reservation
from app.services.database import get_database
from app.services.datetime_helpers import is_within_stay_window, utc_naive

logger = logging.getLogger(__name__)

_FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class MockPMS:
    """PMS adapter backed by local guest store and optional JSON fixtures."""

    provider_id = "mock"

    def __init__(self) -> None:
        self._db = get_database()

    def _reservation_from_guest(self, guest, property_id: str) -> Reservation:
        return Reservation(
            booking_id=guest.booking_id,
            property_id=property_id,
            guest_name=guest.name,
            room_number=guest.room_number,
            check_in=utc_naive(guest.check_in),
            check_out=utc_naive(guest.check_out),
            email=guest.email,
            phone=guest.phone,
            membership_tier=guest.membership_tier,
            pms_guest_id=getattr(guest, "pms_guest_id", None),
            in_house=True,
        )

    def _load_fixture_reservations(self, property_id: str) -> list[Reservation]:
        path = _FIXTURES_DIR / f"{property_id}.json"
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            out: list[Reservation] = []
            for row in data.get("reservations", []):
                out.append(
                    Reservation(
                        booking_id=row["booking_id"],
                        property_id=property_id,
                        guest_name=row["guest_name"],
                        room_number=row["room_number"],
                        check_in=utc_naive(datetime.fromisoformat(row["check_in"])),
                        check_out=utc_naive(datetime.fromisoformat(row["check_out"])),
                        email=row.get("email"),
                        phone=row.get("phone"),
                        membership_tier=row.get("membership_tier"),
                        pms_guest_id=row.get("pms_guest_id"),
                        in_house=row.get("in_house", True),
                    )
                )
            return out
        except Exception as e:
            logger.warning("Failed to load PMS fixture %s: %s", path, e)
            return []

    async def get_reservation(
        self, property_id: str, booking_id: str
    ) -> Optional[Reservation]:
        for res in self._load_fixture_reservations(property_id):
            if res.booking_id == booking_id:
                return res

        guest = self._db.get_guest_by_booking(booking_id, property_id=property_id)
        if guest:
            return self._reservation_from_guest(guest, property_id)

        guest_any = self._db.get_guest_by_booking(booking_id)
        if guest_any and not getattr(guest_any, "property_id", None):
            return self._reservation_from_guest(guest_any, property_id)
        return None

    async def find_reservations_by_contact(
        self,
        property_id: str,
        email: Optional[str],
        phone: Optional[str],
        *,
        in_house_only: bool = True,
    ) -> list[Reservation]:
        results: list[Reservation] = []
        seen_bookings: set[str] = set()
        email_l = (email or "").strip().lower()
        phone_n = _normalize_phone(phone)

        for res in self._load_fixture_reservations(property_id):
            if email_l and (res.email or "").lower() == email_l:
                if not in_house_only or res.in_house:
                    results.append(res)
                    seen_bookings.add(res.booking_id)
            elif phone_n and _normalize_phone(res.phone) == phone_n:
                if not in_house_only or res.in_house:
                    results.append(res)
                    seen_bookings.add(res.booking_id)

        for guest in self._db.list_guests(property_id=property_id):
            if guest.booking_id in seen_bookings:
                continue
            if email_l and (guest.email or "").lower() == email_l:
                results.append(self._reservation_from_guest(guest, property_id))
                seen_bookings.add(guest.booking_id)
            elif phone_n and _normalize_phone(guest.phone) == phone_n:
                results.append(self._reservation_from_guest(guest, property_id))
                seen_bookings.add(guest.booking_id)
        return results

    async def find_in_house_by_room(
        self,
        property_id: str,
        room_number: str,
        at: datetime,
    ) -> Optional[Reservation]:
        at_n = utc_naive(at)
        room = room_number.strip()
        for res in self._load_fixture_reservations(property_id):
            if res.room_number == room and is_within_stay_window(
                at_n, res.check_in, res.check_out
            ):
                return res
        for guest in self._db.list_guests(property_id=property_id):
            if guest.room_number == room and is_within_stay_window(
                at_n, guest.check_in, guest.check_out
            ):
                return self._reservation_from_guest(guest, property_id)
        return None


def _normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    return "".join(c for c in phone if c.isdigit())


# Satisfy Protocol for type checkers
def _assert_protocol() -> None:
    _: PMSProvider = MockPMS()
