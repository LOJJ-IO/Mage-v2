"""Tests for service-scoped task escalation."""
from datetime import datetime, timedelta

from app.models.schemas import ActionType, StaffActionEscalationType, StaffActionStatus
from app.services.database import MockDatabase
from app.services import request_consolidation as rc


def _patch_db(monkeypatch):
    db = MockDatabase()
    monkeypatch.setattr(rc, "get_database", lambda: db)
    return db


def _ensure_guest(db: MockDatabase, guest_id: str, room: str = "101"):
    from app.models.schemas import GuestProfile

    db.guests[guest_id] = GuestProfile(
        id=guest_id,
        name="Test Guest",
        room_number=room,
        check_in=datetime.utcnow(),
        check_out=datetime.utcnow(),
        booking_id=f"b-{guest_id}",
    )


def test_escalate_zero_pending_creates_task(monkeypatch):
    db = _patch_db(monkeypatch)
    guest_id = "guest-1"
    _ensure_guest(db, guest_id)

    action, msg = rc.escalate_or_create_task(
        guest_id,
        "HOUSEKEEPING",
        "Extra towels",
        "follow_up_escalation",
        "any update on towels?",
    )
    assert action is not None
    assert action.action_type == ActionType.HOUSEKEEPING
    assert msg


def test_escalate_one_pending_escalates(monkeypatch):
    db = _patch_db(monkeypatch)
    guest_id = "guest-2"
    _ensure_guest(db, guest_id, "202")
    pending = db.log_staff_action(
        guest_id=guest_id,
        action_type=ActionType.HOUSEKEEPING,
        summary="Towels requested",
        source_message="need towels",
    )
    assert pending is not None

    action, msg = rc.escalate_or_create_task(
        guest_id,
        "HOUSEKEEPING",
        "Still waiting",
        "follow_up_escalation",
        "haven't heard back",
    )
    assert action is not None
    assert action.escalation_type == StaffActionEscalationType.ESCALATED
    assert "prioritize" in msg.lower() or "flagged" in msg.lower()


def test_escalate_multiple_pending_clarification(monkeypatch):
    db = _patch_db(monkeypatch)
    guest_id = "guest-3"
    _ensure_guest(db, guest_id, "303")
    db.log_staff_action(
        guest_id=guest_id,
        action_type=ActionType.HOUSEKEEPING,
        summary="Towels",
        source_message="towels",
    )
    db.log_staff_action(
        guest_id=guest_id,
        action_type=ActionType.HOUSEKEEPING,
        summary="Pillows",
        source_message="pillows",
    )

    action, msg = rc.escalate_or_create_task(
        guest_id,
        "HOUSEKEEPING",
        "Follow up",
        "follow_up_escalation",
        "which one?",
    )
    assert action is None
    assert "multiple" in msg.lower()


def test_list_pending_filters_by_service_and_age(monkeypatch):
    db = _patch_db(monkeypatch)
    guest_id = "guest-4"
    from app.models.schemas import StaffAction

    _ensure_guest(db, guest_id, "404")
    old_id = "old-action"
    db.staff_actions[old_id] = StaffAction(
        id=old_id,
        guest_id=guest_id,
        action_type=ActionType.HOUSEKEEPING,
        summary="Old",
        source_message="old",
        status=StaffActionStatus.PENDING,
        created_at=datetime.utcnow() - timedelta(hours=2),
    )
    db.log_staff_action(
        guest_id=guest_id,
        action_type=ActionType.MAINTENANCE,
        summary="Shower",
        source_message="shower",
    )
    hk = db.log_staff_action(
        guest_id=guest_id,
        action_type=ActionType.HOUSEKEEPING,
        summary="Towels",
        source_message="towels",
    )
    pending = db.list_pending_actions_for_guest_service(
        guest_id, ActionType.HOUSEKEEPING, max_age_minutes=60
    )
    assert len(pending) == 1
    assert pending[0].id == hk.id
