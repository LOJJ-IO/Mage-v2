"""FAQ relevance and cooldown filters."""
from datetime import datetime, timedelta

from app.services.faq_intents import (
    collect_faq_matches,
    faq_bundle_on_cooldown,
    faq_plausibly_answers_question,
    filter_faqs_for_display,
    _words,
)


def test_spa_question_does_not_match_pool_faq():
    msg = "when does the spa close?"
    words = _words(msg)
    matched = collect_faq_matches(msg, words)
    ids = {f.id for f in matched}
    assert "pool" not in ids
    assert "spa" in ids


def test_pool_faq_does_not_answer_spa_hours():
    msg = "when does the spa close?"
    matched = collect_faq_matches(msg, _words(msg))
    pool = next((f for f in matched if f.id == "pool"), None)
    assert pool is None


def test_spa_faq_passes_relevance_for_hours_question():
    msg = "when does the spa close?"
    matched = collect_faq_matches(msg, _words(msg))
    spa = next(f for f in matched if f.id == "spa")
    assert faq_plausibly_answers_question(msg, spa) is True


def test_filter_removes_irrelevant_pool_for_spa():
    msg = "who works at the spa?"
    raw = collect_faq_matches(msg, _words(msg))
    filtered = filter_faqs_for_display(msg, raw, [])
    assert all(f.id != "pool" for f in filtered)


def test_faq_cooldown_blocks_repeat_bundle():
    bundle = "spa"
    history = [
        {
            "role": "assistant",
            "content": (
                '{"_mage":"faq","intro":"x","items":[{"id":"spa","title":"Spa","body":"y"}],'
                '"trigger_content":"when does the spa close?","faq_resolved":null}'
            ),
            "created_at": (datetime.utcnow() - timedelta(minutes=2)).isoformat(),
        }
    ]
    assert faq_bundle_on_cooldown(bundle, history) is True


def test_faq_cooldown_expires():
    bundle = "spa"
    history = [
        {
            "role": "assistant",
            "content": (
                '{"_mage":"faq","intro":"x","items":[{"id":"spa","title":"Spa","body":"y"}],'
                '"trigger_content":"when does the spa close?","faq_resolved":null}'
            ),
            "created_at": (datetime.utcnow() - timedelta(minutes=15)).isoformat(),
        }
    ]
    assert faq_bundle_on_cooldown(bundle, history) is False
