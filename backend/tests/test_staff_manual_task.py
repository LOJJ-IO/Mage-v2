"""Tests for manually creating staff inbox tasks."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import GuestProfile
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
def guest_id(db):
    gid = "guest-manual-create"
    db.guests[gid] = GuestProfile(
        id=gid,
        name="Manual Guest",
        room_number="212",
        check_in=datetime.utcnow(),
        check_out=datetime.utcnow(),
        booking_id="b-manual",
    )
    return gid


def test_manager_can_create_task_with_team(client, staff_key, guest_id):
    response = client.post(
        "/api/staff/actions",
        json={
            "summary": "Lobby flowers",
            "guest_id": guest_id,
            "action_type": "HOUSEKEEPING",
            "status": "pending",
        },
        headers={"X-Staff-Key": staff_key},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["action_type"] == "HOUSEKEEPING"
    assert data["summary"] == "Lobby flowers"
    assert data["guest_id"] == guest_id


def test_maintenance_auto_assigns_team(client, db, guest_id):
    from app.services.staff_permissions import StaffContext, StaffRole, get_current_staff

    def fake_staff() -> StaffContext:
        return StaffContext(
            id="maint-1",
            display_name="Maint",
            staff_code="M1",
            role=StaffRole.MAINTENANCE,
            property_id="grand-horizon",
        )

    app.dependency_overrides[get_current_staff] = fake_staff
    try:
        response = client.post(
            "/api/staff/actions",
            json={"summary": "Fix AC", "guest_id": guest_id},
            headers={"X-Staff-Key": "any-key"},
        )
        assert response.status_code == 200
        assert response.json()["action_type"] == "MAINTENANCE"
    finally:
        app.dependency_overrides.pop(get_current_staff, None)


def test_manager_must_specify_team(client, staff_key, guest_id):
    response = client.post(
        "/api/staff/actions",
        json={"summary": "No team", "guest_id": guest_id},
        headers={"X-Staff-Key": staff_key},
    )
    assert response.status_code == 400
