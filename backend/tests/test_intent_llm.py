"""Unit tests for classifier JSON parsing and closing heuristics."""
import json

from app.services.intent_llm import (
    parse_classifier_json,
    format_classifier_routing_json,
    build_copy_writer_user_content,
    is_disqualified_classifier_model,
    ClassifierResult,
    get_classifier_system_prompt,
    CLASSIFIER_SYSTEM_PROMPT,
)
from app.services.faq_intents import is_conversation_closing, _words as faq_words


def test_parse_classifier_json_abilities_only():
    raw = (
        '{"abilities": ["D"], "tasks": [{"service": "HOUSEKEEPING", "title": "Towels"}], '
        '"confidence": 0.92, "request_type": "new", "message": "On the way!"}'
    )
    result = parse_classifier_json(raw, user_message="extra towels please")
    assert result is not None
    assert result.abilities == ["D"]
    assert result.service == "HOUSEKEEPING"
    assert result.confidence == 0.92
    assert result.title == "Towels"
    assert result.message == "On the way!"
    assert result.request_type == "new"
    assert result.salvaged is False


def test_parse_classifier_json_markdown_fence():
    raw = '```json\n{"abilities": [], "tasks": [], "confidence": 0.8}\n```'
    result = parse_classifier_json(raw)
    assert result is not None
    assert result.abilities == []
    assert result.service is None


def test_parse_legacy_intent_infers_abilities():
    raw = (
        '{"intent": "TASK|HOUSEKEEPING", "abilities": [], '
        '"tasks": [{"service": "ROOM_SERVICE", "title": "Towels"}], "confidence": 0.0}'
    )
    result = parse_classifier_json(
        raw, user_message="Can you send extra towels to my room?"
    )
    assert result is not None
    assert result.abilities == []
    assert result.confidence == 0.75


def test_parse_legacy_service_without_abilities_key():
    raw = (
        '{"intent": "TASK", "service": "HOUSEKEEPING", "title": "Towels", '
        '"confidence": 0.9}'
    )
    result = parse_classifier_json(raw, user_message="towels please")
    assert result is not None
    assert result.abilities == ["D"]
    assert result.service == "HOUSEKEEPING"


def test_salvaged_ignores_model_confidence():
    raw = 'x "abilities": ["D"], "service": "ROOM_SERVICE", "title": "Towels", "confidence": 0.0'
    result = parse_classifier_json(
        raw, salvaged=True, user_message="send towels"
    )
    assert result is not None
    assert result.confidence == 0.75
    assert result.salvaged is True
    assert result.abilities == ["D"]


def test_salvaged_non_task_low_confidence():
    raw = 'noise "abilities": [], "confidence": 0.0'
    result = parse_classifier_json(
        raw, salvaged=True, user_message="what restaurants are nearby?"
    )
    assert result is not None
    assert result.confidence == 0.45


def test_parse_multi_task_legacy_fields():
    raw = (
        '{"intent": "MULTI_TASK", "abilities": ["D"], "service": "MAINTENANCE", '
        '"secondary_service": "ROOM_SERVICE", "title": "Shower not functioning", '
        '"secondary_title": "Bottle of wine requested", "confidence": 0.9}'
    )
    result = parse_classifier_json(raw, user_message="shower broken and wine")
    assert result is not None
    assert len(result.tasks) == 2
    assert result.service == "MAINTENANCE"
    assert result.secondary_service == "ROOM_SERVICE"


def test_parse_tasks_array_three_entries():
    raw = json.dumps({
        "abilities": ["D"],
        "tasks": [
            {"service": "HOUSEKEEPING", "title": "Extra towels requested"},
            {"service": "ROOM_SERVICE", "title": "Wine and cheese requested"},
            {"service": "ROOM_SERVICE", "title": "Chamdor wine requested"},
        ],
        "info_source": None,
        "request_type": "new",
        "confidence": 0.9,
        "message": "All set!",
    })
    result = parse_classifier_json(raw, user_message="towels wine cheese")
    assert result is not None
    assert len(result.tasks) == 3


def test_classifier_prompt_loaded_at_startup():
    prompt = get_classifier_system_prompt()
    assert prompt == CLASSIFIER_SYSTEM_PROMPT
    assert "CLASSIFY LATEST MESSAGE ONLY" in prompt or "latest message" in prompt.lower()
    assert "Do NOT include an" in prompt or "Do NOT emit" in prompt or '"intent"' not in prompt.split("OUTPUT")[-1]
    assert "{hotel_name}" not in prompt


def test_format_routing_json_no_intent():
    result = ClassifierResult(
        confidence=0.9,
        raw="",
        abilities=["D"],
        tasks=[
            {"service": "MAINTENANCE", "title": "Shower broken"},
            {"service": "ROOM_SERVICE", "title": "Wine requested"},
        ],
        request_type="new",
        message="On it!",
    )
    data = json.loads(format_classifier_routing_json(result))
    assert "intent" not in data
    assert data["abilities"] == ["D"]
    assert len(data["tasks"]) == 2


def test_parse_info_abilities():
    raw = (
        '{"abilities": ["E"], "tasks": [], "confidence": 0.9, '
        '"info_source": "HOTEL_DOCS", "request_type": "status_check", "message": "Sure."}'
    )
    result = parse_classifier_json(raw, user_message="pool hours")
    assert result is not None
    assert result.abilities == ["E"]
    assert result.info_source == "HOTEL_DOCS"


def test_parse_utility_abilities():
    raw = (
        '{"abilities": ["B"], "tasks": [], "request_type": "status_check", '
        '"confidence": 0.95, "message": "Let me grab that for you."}'
    )
    result = parse_classifier_json(raw, user_message="what time is it")
    assert result is not None
    assert result.abilities == ["B"]


def test_disqualified_models():
    assert is_disqualified_classifier_model("liquid/lfm-2.5-1.2b-instruct:free")
    assert is_disqualified_classifier_model("openai/gpt-5-nano")
    assert is_disqualified_classifier_model("nvidia/nemotron-nano-9b-v2:free")
    assert not is_disqualified_classifier_model("google/gemini-2.0-flash-exp:free")


def test_parse_classifier_json_invalid_returns_none():
    assert parse_classifier_json("no json here at all") is None


def test_closing_snacks_thats_all_not_closing():
    msg = "i just need the snacks, that's all"
    words = faq_words(msg)
    assert is_conversation_closing(msg, words) is False


def test_copy_writer_user_content_uses_routing_not_full_chat():
    routing = format_classifier_routing_json(
        ClassifierResult(
            confidence=0.88,
            raw="",
            abilities=["D"],
            tasks=[{"service": "HOUSEKEEPING", "title": "Towels"}],
        )
    )
    body = build_copy_writer_user_content(
        routing_json=routing,
        user_message="Extra towels please",
        conversation_gist="Extra towels please",
    )
    assert "Routing from classifier" in body
    data = json.loads(routing)
    assert data["abilities"] == ["D"]
    assert "intent" not in data
    assert "Guest message to respond to:" in body


def test_closing_pure_thats_all_is_closing():
    msg = "that's all"
    words = faq_words(msg)
    assert is_conversation_closing(msg, words) is True
