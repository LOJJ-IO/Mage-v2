"""Tests for manual staff team reassignment and dashboard metrics."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import ActionType, GuestProfile
from app.services.database import MockDatabase


@pytest.fixture
def db(monkeypatch):
    database = MockDatabase()
    monkeypatch.setattr("app.api.staff.get_database", lambda: database)
    return database


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def staff_key():
    return "mage-staff-dev"


@pytest.fixture
def action_id(db):
    guest_id = "guest-test-reassign"
    db.guests[guest_id] = GuestProfile(
        id=guest_id,
        name="Test Guest",
        room_number="101",
        check_in=datetime.utcnow(),
        check_out=datetime.utcnow(),
        booking_id="b-test-reassign",
    )
    action = db.log_staff_action(
        guest_id=guest_id,
        action_type=ActionType.MAINTENANCE,
        summary="Leaky faucet",
        source_message="The faucet is dripping",
    )
    return action.id


def test_manager_can_reassign_team_and_records_metric(client, staff_key, action_id, monkeypatch):
    recorded: list[dict] = []

    def capture(**kwargs) -> None:
        recorded.append(kwargs)

    monkeypatch.setattr("app.api.staff.record_staff_team_reassignment_event", capture)

    response = client.patch(
        f"/api/staff/actions/{action_id}",
        json={"action_type": "HOUSEKEEPING"},
        headers={"X-Staff-Key": staff_key},
    )
    assert response.status_code == 200
    assert response.json()["action_type"] == "HOUSEKEEPING"
    assert len(recorded) == 1
    assert recorded[0]["from_team"] == "MAINTENANCE"
    assert recorded[0]["to_team"] == "HOUSEKEEPING"


def test_reassignment_aggregates_into_dashboard_metrics():
    from app.services.metrics_aggregations import aggregate_dev, aggregate_marketing

    events = [
        {
            "event_type": "staff_team_reassignment",
            "guest_id": "g1",
            "created_at": datetime.utcnow().isoformat(),
            "metadata": {"from_team": "MAINTENANCE", "to_team": "HOUSEKEEPING"},
        },
        {
            "event_type": "staff_team_reassignment",
            "guest_id": "g2",
            "created_at": datetime.utcnow().isoformat(),
            "metadata": {"from_team": "CONTACT_FRONT_DESK", "to_team": "MAINTENANCE"},
        },
    ]
    marketing = aggregate_marketing(
        events,
        labor_cost_per_call=5.0,
        avg_call_minutes=4.0,
        happiness_threshold=70,
    )
    dev = aggregate_dev(events)

    assert marketing["manual_team_reassignments_count"] == 2
    assert dev["manual_team_reassignments_count"] == 2
    assert dev["team_reassignments_by_target"]["HOUSEKEEPING"] == 1
    assert dev["team_reassignments_by_target"]["MAINTENANCE"] == 1


def test_same_team_reassignment_is_no_op(client, staff_key, action_id, monkeypatch):
    recorded: list[dict] = []
    monkeypatch.setattr(
        "app.api.staff.record_staff_team_reassignment_event",
        lambda **kwargs: recorded.append(kwargs),
    )

    response = client.patch(
        f"/api/staff/actions/{action_id}",
        json={"action_type": "MAINTENANCE"},
        headers={"X-Staff-Key": staff_key},
    )
    assert response.status_code == 200
    assert len(recorded) == 0
