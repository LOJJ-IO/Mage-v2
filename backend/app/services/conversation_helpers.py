"""Conversation history helpers for routing and staff actions."""
import json
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set

from app.services.faq_intents import SHORT_ACK_WORDS, is_short_ack

HISTORY_LIMIT = 12

FOLLOW_UP_PATTERNS = (
    r"\b(?:in\s+the\s+)?next\s+\d+\s+minutes?\b",
    r"\b(?:asap|right\s+away|soon|tonight|this\s+morning|this\s+evening)\b",
    r"\bplease\b",
    r"\bwhen\b",
    r"\b\d{1,2}\s*(?:am|pm)\b",
)


def trim_history(conversation_history: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
    if not conversation_history:
        return []
    return conversation_history[-HISTORY_LIMIT:]


def _words(message_lower: str) -> Set[str]:
    return set(re.findall(r"\b\w+\b", message_lower))


def is_faq_stored_message(content: str) -> bool:
    stripped = (content or "").strip()
    if not stripped.startswith("{"):
        return False
    try:
        data = json.loads(stripped)
        return isinstance(data, dict) and data.get("_mage") == "faq"
    except json.JSONDecodeError:
        return False


def resolve_substantive_user_message(
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]],
) -> str:
    """Use prior guest message when the current turn is only yes/no/ack."""
    current = (user_message or "").strip()
    lower = current.lower()
    if not is_short_ack(lower) and lower not in SHORT_ACK_WORDS:
        if len(lower) > 12 or " " in lower:
            return current
    if not conversation_history:
        return current
    for msg in reversed(trim_history(conversation_history)):
        if msg.get("role") != "user":
            continue
        prior = (msg.get("content") or "").strip()
        if not prior:
            continue
        prior_lower = prior.lower()
        if is_short_ack(prior_lower):
            continue
        if len(prior) > 3:
            return prior
    return current


def is_internal_conversation_message(content: str) -> bool:
    """Messages stored for ops but hidden from guest history UI."""
    text = (content or "").strip()
    return text.startswith("FAQ feedback:")


def is_follow_up_detail(user_message: str) -> bool:
    """Timing/detail follow-ups that should append to a pending staff action."""
    lower = user_message.lower().strip()
    if len(lower) > 120:
        return False
    if any(re.search(p, lower) for p in FOLLOW_UP_PATTERNS):
        return True
    words = _words(lower)
    if words & {"minutes", "minute", "hour", "hours", "asap", "soon", "tonight"}:
        return True
    if words & {"yet", "still", "waiting"}:
        return True
    if "haven't heard" in lower or "have not heard" in lower or "still waiting" in lower:
        return True
    return len(lower) < 60 and bool(words & {"please"})


def build_faq_llm_context(trigger_content: str, faq_titles: Optional[List[str]]) -> str:
    titles = ", ".join(faq_titles or []) or "general hotel FAQs"
    return (
        f"The guest asked: {trigger_content.strip()}\n"
        f"We showed FAQ topics: {titles}. They indicated the FAQs did not fully help.\n"
        "Answer directly and helpfully. If they need something sent to the room, "
        "confirm you are logging it for staff (do not only tell them to dial 0)."
    )
