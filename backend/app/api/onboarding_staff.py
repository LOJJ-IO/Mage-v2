"""Staff & Admin onboarding routes.

Public (no auth):
  POST /api/staff/onboarding/request  — submit access request, get staff_code
  POST /api/staff/onboarding/sign-in  — exchange access key for session identity

Manager-gated (X-Staff-Key of an approved manager, or legacy bootstrap key):
  GET  /api/admin/staff/pending        — list pending requests
  POST /api/admin/staff/{id}/approve   — approve + issue one-time access key
  POST /api/admin/staff/{id}/reject    — reject request
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.models.schemas import StaffMember
from app.services import staff_auth_service
from app.services.database import get_database

logger = logging.getLogger(__name__)

router = APIRouter(tags=["staff-onboarding"])


# ---------------------------------------------------------------------------
# Request / response schemas (local — not shared with guest auth)
# ---------------------------------------------------------------------------


class StaffAccessRequestBody(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=120)
    requested_role: str
    property_id: Optional[str] = None
    email: Optional[str] = None


class StaffAccessRequestResponse(BaseModel):
    staff_code: str
    status: str


class StaffSignInBody(BaseModel):
    access_key: str = Field(..., min_length=1)


class StaffSignInResponse(BaseModel):
    staff_member_id: str
    staff_code: str
    display_name: str
    approved_role: str
    property_id: str


class ApproveBody(BaseModel):
    approved_role: Optional[str] = None


class ApproveResponse(BaseModel):
    access_key: str
    staff_code: str
    display_name: str
    approved_role: str


class RejectResponse(BaseModel):
    status: str
    staff_code: str


# ---------------------------------------------------------------------------
# Manager auth dependency
# ---------------------------------------------------------------------------


def _require_manager_key(
    x_staff_key: Optional[str] = Header(None, alias="X-Staff-Key"),
) -> str:
    if not x_staff_key:
        raise HTTPException(status_code=403, detail="Manager key required in X-Staff-Key header")
    return x_staff_key


# ---------------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------------


@router.post(
    "/staff/onboarding/request",
    response_model=StaffAccessRequestResponse,
    summary="Submit a staff access request",
)
async def request_staff_access(
    body: StaffAccessRequestBody,
    db=Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> StaffAccessRequestResponse:
    """
    Register a new staff member request. Returns a provisional staff_code
    (e.g. STF-A7K2) that the staff member uses to track their pending request.
    An approved manager must then grant access via the admin approve endpoint.
    """
    property_id = body.property_id or settings.property_id
    member = await staff_auth_service.request_staff_access(
        db,
        display_name=body.display_name,
        requested_role=body.requested_role,
        property_id=property_id,
        email=body.email,
    )
    return StaffAccessRequestResponse(
        staff_code=member.staff_code,
        status=member.status.value if hasattr(member.status, "value") else str(member.status),
    )


@router.post(
    "/staff/onboarding/sign-in",
    response_model=StaffSignInResponse,
    summary="Sign in with a staff access key",
)
async def staff_sign_in(
    body: StaffSignInBody,
    db=Depends(get_database),
) -> StaffSignInResponse:
    """
    Exchange a plain-text access key for identity. Returns the staff member's
    ID, staff_code, display name, approved role, and property. The caller must
    store the raw key in sessionStorage under 'mage-staff-key' for subsequent
    X-Staff-Key header use; this endpoint does NOT set a cookie.
    """
    member = await staff_auth_service.sign_in_with_key(db, body.access_key)
    approved_role = (
        member.approved_role.value
        if hasattr(member.approved_role, "value")
        else str(member.approved_role)
    )
    return StaffSignInResponse(
        staff_member_id=member.id,
        staff_code=member.staff_code,
        display_name=member.display_name,
        approved_role=approved_role,
        property_id=member.property_id,
    )


# ---------------------------------------------------------------------------
# Manager-gated admin routes
# ---------------------------------------------------------------------------


@router.get(
    "/admin/staff/pending",
    summary="List pending staff access requests",
)
async def list_pending_staff(
    raw_key: str = Depends(_require_manager_key),
    db=Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Return all pending staff requests for the configured property."""
    await staff_auth_service.verify_manager_key(db, raw_key, settings)
    members: list[StaffMember] = await staff_auth_service.list_pending(
        db, settings.property_id
    )
    return [
        {
            "id": m.id,
            "staff_code": m.staff_code,
            "display_name": m.display_name,
            "requested_role": m.requested_role.value
            if hasattr(m.requested_role, "value")
            else str(m.requested_role),
            "status": m.status.value if hasattr(m.status, "value") else str(m.status),
            "property_id": m.property_id,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in members
    ]


@router.post(
    "/admin/staff/{member_id}/approve",
    response_model=ApproveResponse,
    summary="Approve a pending staff request and issue an access key",
)
async def approve_staff_member(
    member_id: str,
    body: ApproveBody,
    raw_key: str = Depends(_require_manager_key),
    db=Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> ApproveResponse:
    """
    Approve a pending staff request. Generates a one-time access key shown
    only in this response — it is never stored in plain text and cannot be
    retrieved again. The manager must securely hand it to the staff member.
    If approved_role is omitted, the requested_role is used.
    """
    manager = await staff_auth_service.verify_manager_key(db, raw_key, settings)
    manager_id = manager.id if manager is not None else "bootstrap"

    existing = db.get_staff_member_by_id(member_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Staff member not found")

    role_to_grant = body.approved_role or (
        existing.requested_role.value
        if hasattr(existing.requested_role, "value")
        else str(existing.requested_role)
    )

    member, plain_key = await staff_auth_service.approve_member(
        db,
        member_id=member_id,
        approved_role=role_to_grant,
        approved_by=manager_id,
    )
    approved_role = (
        member.approved_role.value
        if hasattr(member.approved_role, "value")
        else str(member.approved_role)
    )
    logger.info(
        "Staff member %s (%s) approved as %s by %s",
        member.display_name,
        member.staff_code,
        approved_role,
        manager_id,
    )
    return ApproveResponse(
        access_key=plain_key,
        staff_code=member.staff_code,
        display_name=member.display_name,
        approved_role=approved_role,
    )


@router.post(
    "/admin/staff/{member_id}/reject",
    response_model=RejectResponse,
    summary="Reject a pending staff request",
)
async def reject_staff_member(
    member_id: str,
    raw_key: str = Depends(_require_manager_key),
    db=Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> RejectResponse:
    """Reject a pending staff access request."""
    manager = await staff_auth_service.verify_manager_key(db, raw_key, settings)
    manager_id = manager.id if manager is not None else "bootstrap"

    member = await staff_auth_service.reject_member(
        db, member_id=member_id, approved_by=manager_id
    )
    return RejectResponse(
        status=member.status.value if hasattr(member.status, "value") else str(member.status),
        staff_code=member.staff_code,
    )
