"""PMS adapter contract — vendor-agnostic reservation lookup."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol, runtime_checkable


@dataclass
class Reservation:
    """Normalized reservation from any PMS adapter."""

    booking_id: str
    property_id: str
    guest_name: str
    room_number: str
    check_in: datetime
    check_out: datetime
    email: Optional[str] = None
    phone: Optional[str] = None
    membership_tier: Optional[str] = None
    pms_guest_id: Optional[str] = None
    in_house: bool = True


@runtime_checkable
class PMSProvider(Protocol):
    """Plug-and-play PMS interface; one implementation per vendor."""

    provider_id: str

    async def get_reservation(
        self, property_id: str, booking_id: str
    ) -> Optional[Reservation]:
        ...

    async def find_reservations_by_contact(
        self,
        property_id: str,
        email: Optional[str],
        phone: Optional[str],
        *,
        in_house_only: bool = True,
    ) -> list[Reservation]:
        ...

    async def find_in_house_by_room(
        self,
        property_id: str,
        room_number: str,
        at: datetime,
    ) -> Optional[Reservation]:
        ...
