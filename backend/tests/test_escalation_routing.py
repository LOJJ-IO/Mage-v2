"""Tests for two-layer routing: SOCIAL (G) and contact front desk."""
import asyncio

from app.services.intent_llm import ClassifierResult
from app.services.llm_service import (
    LLMService,
    _guest_explicitly_wants_to_speak,
    _handle_contact_front_desk_segments,
    _is_pure_social_abilities,
)


def test_is_pure_social_abilities():
    assert _is_pure_social_abilities(["G"]) is True
    assert _is_pure_social_abilities(["D"]) is False


def test_route_social_g_returns_classifier_message():
    svc = LLMService()
    classified = ClassifierResult(
        confidence=0.95,
        raw="",
        abilities=["G"],
        tasks=[],
        request_type="social",
        message="Hi there! How can I help?",
    )
    segments = asyncio.run(
        svc._route_by_abilities(classified, "hello", [], "guest-demo", None)
    )
    assert len(segments) == 1
    assert "Hi there" in segments[0]["content"]


def test_guest_explicitly_wants_to_speak():
    assert _guest_explicitly_wants_to_speak("I need to talk to someone at the front desk")
    assert not _guest_explicitly_wants_to_speak("what time is checkout")


def test_contact_explicit_requires_confirmation():
    classified = ClassifierResult(
        confidence=0.9,
        raw="",
        abilities=["D"],
        tasks=[{"service": "CONTACT_FRONT_DESK", "title": "Guest wants to speak"}],
        request_type="new",
        message="I can connect you to the front desk.",
    )
    segments = _handle_contact_front_desk_segments(
        classified, "I want to talk to the front desk", None, None
    )
    assert len(segments) == 1
    assert segments[0].get("require_contact_confirmation") is True


def test_contact_silent_no_confirmation(monkeypatch):
    logged = []

    def fake_log(*args, **kwargs):
        logged.append(kwargs)
        return None

    monkeypatch.setattr("app.services.llm_service._try_log_staff_action", fake_log)
    classified = ClassifierResult(
        confidence=0.85,
        raw="",
        abilities=["D"],
        tasks=[{"service": "CONTACT_FRONT_DESK", "title": "Unclear request"}],
        request_type="new",
        message="The front desk can help with that.",
    )
    segments = _handle_contact_front_desk_segments(
        classified, "maybe something with billing?", "guest-1", None
    )
    assert len(segments) == 1
    assert not segments[0].get("require_contact_confirmation")
    assert logged
    assert logged[0].get("escalation_type").value == "contact"
