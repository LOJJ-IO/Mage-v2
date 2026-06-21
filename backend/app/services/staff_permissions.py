"""RBAC permission matrix and FastAPI dependency for staff authentication."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Callable, FrozenSet, Optional

from fastapi import Depends, Header, HTTPException

from app.core.config import get_settings
from app.models.schemas import ActionType, StaffMemberStatus, StaffRole
from app.services.database import get_database

# ---------------------------------------------------------------------------
# Permission matrices (single source of truth — frontend mirrors these)
# ---------------------------------------------------------------------------

ROLE_NAV: dict[StaffRole, FrozenSet[str]] = {
    StaffRole.MANAGER: frozenset({
        "tasks", "assigned", "schedule", "review", "guest-chat", "help-desk", "knowledge"
    }),
    StaffRole.FRONT_DESK: frozenset({
        "tasks", "assigned", "schedule", "review", "guest-chat", "help-desk", "knowledge"
    }),
    StaffRole.MAINTENANCE: frozenset({"tasks", "assigned", "schedule"}),
    StaffRole.HOUSEKEEPING: frozenset({"tasks", "assigned", "schedule"}),
    StaffRole.ROOM_SERVICE: frozenset({"tasks", "assigned", "schedule"}),
}

ROLE_ACTION_TYPES: dict[StaffRole, FrozenSet[ActionType]] = {
    StaffRole.MANAGER: frozenset(ActionType),
    StaffRole.FRONT_DESK: frozenset(ActionType),
    StaffRole.MAINTENANCE: frozenset({ActionType.MAINTENANCE, ActionType.HANDOFF}),
    StaffRole.HOUSEKEEPING: frozenset({ActionType.HOUSEKEEPING, ActionType.HANDOFF}),
    StaffRole.ROOM_SERVICE: frozenset({ActionType.ROOM_SERVICE, ActionType.HANDOFF}),
}

# Roles that may see the "Get help with this task" button (Agent 6)
TASK_HELP_ROLES: FrozenSet[StaffRole] = frozenset(StaffRole)

# Roles that may browse the Help Desk sidebar
BROWSE_HELP_ROLES: FrozenSet[StaffRole] = frozenset({
    StaffRole.MANAGER, StaffRole.FRONT_DESK
})

# Roles that may manually reassign a task to another team
REASSIGN_TEAM_ROLES: FrozenSet[StaffRole] = frozenset({
    StaffRole.MANAGER, StaffRole.FRONT_DESK
})

# Valid reassignment targets (HANDOFF is resolved at log time)
REASSIGNABLE_ACTION_TYPES: FrozenSet[ActionType] = frozenset({
    ActionType.MAINTENANCE,
    ActionType.HOUSEKEEPING,
    ActionType.ROOM_SERVICE,
    ActionType.CONTACT_FRONT_DESK,
})


# ---------------------------------------------------------------------------
# StaffContext — resolved identity carried through a request
# ---------------------------------------------------------------------------

@dataclass
class StaffContext:
    id: str
    display_name: str
    staff_code: str
    role: StaffRole
    property_id: str


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_current_staff(
    x_staff_key: Optional[str] = Header(None, alias="X-Staff-Key"),
) -> StaffContext:
    """Resolve X-Staff-Key to a StaffContext; raise 401 on failure."""
    if not x_staff_key:
        raise HTTPException(status_code=401, detail="Missing X-Staff-Key header")

    settings = get_settings()

    # Legacy bootstrap: shared dev/property key → synthetic manager
    if x_staff_key == settings.staff_access_key:
        return StaffContext(
            id="legacy-staff",
            display_name="Staff",
            staff_code="LEGACY",
            role=StaffRole.MANAGER,
            property_id=settings.property_id,
        )

    # Per-user key: hash and look up approved staff member
    key_hash = hashlib.sha256(x_staff_key.encode()).hexdigest()
    db = get_database()
    member = db.get_staff_member_by_access_key_hash(key_hash)

    if member is None or member.status != StaffMemberStatus.APPROVED:
        raise HTTPException(status_code=401, detail="Invalid or missing staff key")

    role = member.approved_role or StaffRole.FRONT_DESK
    return StaffContext(
        id=member.id,
        display_name=member.display_name,
        staff_code=member.staff_code,
        role=role,
        property_id=member.property_id,
    )


def require_role(*roles: StaffRole) -> Callable[..., StaffContext]:
    """Return a FastAPI dependency that enforces one of the given roles."""
    role_set = frozenset(roles)

    def _dep(ctx: StaffContext = Depends(get_current_staff)) -> StaffContext:
        if ctx.role not in role_set:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return ctx

    return _dep
