"""Staff & Admin identity service.

Handles per-staff access key issuance, sign-in validation, and manager
approval flows. Keeps route handlers thin; all business rules live here.

Bootstrap: if no approved manager exists yet, the legacy STAFF_ACCESS_KEY
env var is accepted on admin routes. Once a real manager is approved,
operators should rotate the legacy key out of use.
"""

import hashlib
import secrets
import string
from typing import Optional

from fastapi import HTTPException, status as http_status

from app.models.schemas import StaffMember, StaffMemberStatus, StaffRole

STAFF_ROLES: frozenset[str] = frozenset(r.value for r in StaffRole)

_CODE_CHARS = string.ascii_uppercase + string.digits


# ---------------------------------------------------------------------------
# Crypto helpers
# ---------------------------------------------------------------------------


def hash_key(raw: str) -> str:
    """Return SHA-256 hex digest of raw access key."""
    return hashlib.sha256(raw.encode()).hexdigest()


def generate_access_key() -> str:
    """Generate a cryptographically secure access key (43 URL-safe chars)."""
    return secrets.token_urlsafe(32)


# ---------------------------------------------------------------------------
# Core flows
# ---------------------------------------------------------------------------


async def request_staff_access(
    db,
    *,
    display_name: str,
    requested_role: str,
    property_id: str,
    email: Optional[str] = None,
) -> StaffMember:
    """
    Register a new staff access request.
    Returns a StaffMember in PENDING status with an assigned staff_code.
    """
    if requested_role not in STAFF_ROLES:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid role '{requested_role}'. Must be one of: {sorted(STAFF_ROLES)}",
        )
    name = display_name.strip()
    if not name:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="display_name must not be blank",
        )
    return db.create_staff_request(
        property_id=property_id,
        display_name=name,
        requested_role=requested_role,
        email=email,
    )


async def sign_in_with_key(db, raw_key: str) -> StaffMember:
    """
    Validate a plain-text access key and return the approved StaffMember.
    Raises 401 with a specific detail for pending/rejected/unknown keys.
    """
    if not raw_key:
        raise HTTPException(status_code=401, detail="Access key is required")
    key_hash = hash_key(raw_key)
    member: Optional[StaffMember] = db.get_staff_member_by_access_key_hash(key_hash)
    if member is None:
        raise HTTPException(status_code=401, detail="Invalid access key")
    if member.status == StaffMemberStatus.PENDING:
        raise HTTPException(
            status_code=401,
            detail="Access key not yet approved — ask your manager",
        )
    if member.status == StaffMemberStatus.REJECTED:
        raise HTTPException(status_code=401, detail="Access key has been rejected")
    if member.status != StaffMemberStatus.APPROVED:
        raise HTTPException(status_code=401, detail="Access key is not active")
    return member


async def list_pending(db, property_id: str) -> list[StaffMember]:
    """Return all pending staff requests for the property."""
    return db.list_pending_staff(property_id)


async def approve_member(
    db,
    *,
    member_id: str,
    approved_role: str,
    approved_by: str,
) -> tuple[StaffMember, str]:
    """
    Generate a fresh access key, store its hash, and mark the member approved.
    Returns (member, plaintext_key). The plaintext key is shown exactly once
    and never stored; callers must not log it.
    """
    if approved_role not in STAFF_ROLES:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid role '{approved_role}'",
        )
    raw_key = generate_access_key()
    key_hash = hash_key(raw_key)
    member = db.approve_staff_member(
        id=member_id,
        approved_role=approved_role,
        access_key_hash=key_hash,
        approved_by=approved_by,
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return member, raw_key


async def reject_member(
    db,
    *,
    member_id: str,
    approved_by: Optional[str] = None,
) -> StaffMember:
    """Mark a pending staff request as rejected."""
    member = db.reject_staff_member(id=member_id, approved_by=approved_by)
    if member is None:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return member


async def verify_manager_key(db, raw_key: str, settings) -> Optional[StaffMember]:
    """
    Authenticate an admin action.

    Returns the StaffMember if the key belongs to an approved manager.
    Returns None for the legacy bootstrap STAFF_ACCESS_KEY (treated as manager).
    Raises HTTP 403 if the key is invalid or not a manager role.

    Bootstrap path: legacy STAFF_ACCESS_KEY is accepted so the first real
    manager can be approved before any per-user managers exist. Rotate this
    key out once a named manager is onboarded.
    """
    if not raw_key:
        raise HTTPException(status_code=403, detail="Manager access required")

    # Bootstrap: legacy shared env key maps to implicit manager
    if raw_key == settings.staff_access_key:
        return None

    key_hash = hash_key(raw_key)
    member: Optional[StaffMember] = db.get_staff_member_by_access_key_hash(key_hash)
    if member is None or member.status != StaffMemberStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Manager access required")
    if member.approved_role != StaffRole.MANAGER:
        raise HTTPException(status_code=403, detail="Manager access required")
    return member
