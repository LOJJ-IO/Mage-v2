"""Tests for conversation session grouping and completion rate."""
from datetime import datetime, timedelta

from app.services.conversation_sessions import (
    compute_conversation_completion_rate,
    group_routing_into_sessions,
)
from app.services.metrics_aggregations import filter_events_by_range


def _routing(guest_id: str, created_at: datetime, **extra) -> dict:
    return {
        "event_type": "routing",
        "guest_id": guest_id,
        "created_at": created_at.isoformat(),
        "success": True,
        **extra,
    }


def test_filter_events_excludes_dev_internal_guests():
    events = [
        {"event_type": "routing", "guest_id": "dev-1", "created_at": "2026-06-01T10:00:00"},
        {"event_type": "routing", "guest_id": "pilot-1", "created_at": "2026-06-01T10:00:00"},
    ]
    filtered = filter_events_by_range(events, exclude_guest_ids={"dev-1"})
    assert len(filtered) == 1
    assert filtered[0]["guest_id"] == "pilot-1"


def test_session_groups_by_gap():
    base = datetime(2026, 6, 1, 10, 0, 0)
    events = [
        _routing("g1", base),
        _routing("g1", base + timedelta(minutes=5)),
        _routing("g1", base + timedelta(minutes=45)),
    ]
    sessions = group_routing_into_sessions(events, now=base + timedelta(hours=2))
    assert len(sessions) == 2
    assert sessions[0].event_count == 2
    assert sessions[1].event_count == 1


def test_completion_rate_completed_session():
    base = datetime(2026, 6, 1, 10, 0, 0)
    events = [
        _routing("g1", base),
        _routing("g1", base + timedelta(minutes=5)),
    ]
    result = compute_conversation_completion_rate(
        events, now=base + timedelta(hours=1)
    )
    assert result["sessions_completed"] == 1
    assert result["conversation_completion_rate_pct"] == 100.0


def test_completion_rate_abandoned_on_escalation():
    base = datetime(2026, 6, 1, 10, 0, 0)
    events = [
        _routing("g1", base, escalation_type="contact", staff_action_logged=True),
    ]
    result = compute_conversation_completion_rate(
        events, now=base + timedelta(hours=1)
    )
    assert result["sessions_abandoned"] == 1
    assert result["conversation_completion_rate_pct"] == 0.0
