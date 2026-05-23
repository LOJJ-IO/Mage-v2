"""Deterministic hotel service classification for staff inbox routing."""
import re
from typing import Dict, List, Optional, Set

from app.models.schemas import ActionType
from app.services.conversation_helpers import trim_history

# Keywords for overlap scoring in request consolidation
REQUEST_KEYWORDS = frozenset({
    "towel", "towels", "pillow", "pillows", "blanket", "sheets", "housekeeping",
    "shower", "toilet", "sink", "leak", "broken", "maintenance", "ac", "heat",
    "baby", "bed", "crib", "food", "order", "menu", "wine", "coffee", "hungry",
    "parking", "noise", "front", "desk", "room", "service",
})

MAINTENANCE_PATTERNS = (
    r"\bbroken\b",
    r"\bnot\s+working\b",
    r"\bdoesn'?t\s+work\b",
    r"\bleak\b",
    r"\bshower\b",
    r"\btoilet\b",
    r"\bsink\b",
    r"\bplumbing\b",
    r"\brepair\b",
    r"\bfix\b",
    r"\bmaintenance\b",
    r"\bair\s+conditioning\b",
    r"\ba/c\b",
    r"\bac\b",
    r"\bthermostat\b",
    r"\bheating\b",
    r"\bcooling\b",
)

ROOM_SERVICE_PATTERNS = (
    r"\broom\s+service\b",
    r"\border\s+food\b",
    r"\bfood\s+order\b",
    r"\bin[- ]room\s+dining\b",
    r"\bmenu\b",
    r"\bhungry\b",
    r"\bbreakfast\s+in\s+room\b",
    r"\bcoffee\s+to\s+room\b",
    r"\bwine\b",
    r"\bbeer\b",
    r"\bcocktail\b",
    r"\bsnacks?\b",
    r"\bdeliver(?:y)?\s+(?:food|drink|meal|wine|coffee)\b",
)

HOUSEKEEPING_PATTERNS = (
    r"\btowel",
    r"\bpillow",
    r"\bblanket",
    r"\bsheets?\b",
    r"\bhousekeeping\b",
    r"\bhousekeeper\b",
    r"\bclean(?:ing)?\s+room\b",
    r"\bbaby\s+bed\b",
    r"\bcrib\b",
    r"\bextra\s+linen",
    r"\bamenities?\s+(?:to|in)\s+room\b",
)

FRONT_DESK_PATTERNS = (
    r"\bfront\s+desk\b",
    r"\bspeak\s+(?:to|with)\s+(?:a\s+)?(?:person|human|manager)\b",
    r"\bhuman\s+agent\b",
    r"\bleave\s+a\s+note\b",
    r"\btell\s+the\s+front\s+desk\b",
    r"\bmanager\b",
)

GUEST_NOTE_PATTERNS = (
    r"\bleave\s+a\s+note\b",
    r"\btell\s+the\s+front\s+desk\b",
    r"\bpass\s+(?:along|on)\b",
    r"\bmessage\s+for\s+(?:the\s+)?(?:front\s+desk|staff)\b",
)

IN_ROOM_ISSUE_PATTERNS = MAINTENANCE_PATTERNS + (
    r"\bnoise\b",
    r"\bloud\b",
    r"\btemperature\b",
    r"\bcold\b",
    r"\bhot\b",
)


def _words(message_lower: str) -> Set[str]:
    return set(re.findall(r"\b\w+\b", message_lower))


def detect_utility_action(user_message: str) -> Optional[str]:
    """Return GET_WEATHER, GET_TIME, GET_GUEST_INFO, or None for utility-style requests."""
    lower = (user_message or "").lower().strip()
    if not lower:
        return None
    if re.search(r"\b(?:weather|forecast|rain|snow)\b", lower):
        return "GET_WEATHER"
    if re.search(
        r"\b(?:what\s+time|current\s+time|time\s+is\s+it|what'?s\s+the\s+time)\b", lower
    ):
        return "GET_TIME"
    if re.search(
        r"\b(?:my\s+room|my\s+name|my\s+booking|membership\s+tier|guest\s+(?:info|profile|details))\b",
        lower,
    ):
        return "GET_GUEST_INFO"
    return None


def is_in_room_issue(user_message: str) -> bool:
    """True when the message is clearly an in-room / hotel-operations issue."""
    lower = (user_message or "").lower().strip()
    if not lower:
        return False
    return any(re.search(p, lower) for p in IN_ROOM_ISSUE_PATTERNS)


def is_guest_note_request(user_message: str) -> bool:
    lower = (user_message or "").lower().strip()
    return any(re.search(p, lower) for p in GUEST_NOTE_PATTERNS)


def classify_service(
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> ActionType:
    """
    Classify staff routing from message + recent context.
    Order: MAINTENANCE > HOUSEKEEPING > ROOM_SERVICE > CONTACT_FRONT_DESK.
    """
    lower = (user_message or "").lower().strip()
    words = _words(lower)

    if any(re.search(p, lower) for p in MAINTENANCE_PATTERNS):
        return ActionType.MAINTENANCE

    if any(re.search(p, lower) for p in HOUSEKEEPING_PATTERNS):
        return ActionType.HOUSEKEEPING

    # Room service: food/drink only — exclude supply items that look like housekeeping
    if any(re.search(p, lower) for p in ROOM_SERVICE_PATTERNS):
        if not (words & {"towel", "towels", "pillow", "blankets", "sheets", "baby", "crib"}):
            return ActionType.ROOM_SERVICE
    if words & {"hungry", "food", "menu"} and "order" in words:
        return ActionType.ROOM_SERVICE

    if is_guest_note_request(lower) or any(re.search(p, lower) for p in FRONT_DESK_PATTERNS):
        return ActionType.CONTACT_FRONT_DESK

    return ActionType.CONTACT_FRONT_DESK


def service_display_name(action_type: ActionType) -> str:
    mapping = {
        ActionType.MAINTENANCE: "maintenance",
        ActionType.HOUSEKEEPING: "housekeeping",
        ActionType.ROOM_SERVICE: "room service",
        ActionType.CONTACT_FRONT_DESK: "the front desk",
        ActionType.HANDOFF: "our team",
    }
    return mapping.get(action_type, "our team")


def build_staff_summary(
    action_type: ActionType,
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    issue_summary: str = "",
) -> str:
    substantive = infer_summary_from_context(user_message, conversation_history)
    if issue_summary.strip():
        detail = issue_summary.strip()
    else:
        detail = substantive[:200]
    normalized = action_type.value.replace("_", " ").lower()
    if action_type == ActionType.CONTACT_FRONT_DESK and is_guest_note_request(substantive):
        return f"Guest note: {detail}"[:500]
    return f"{normalized}: {detail}"[:500]


def infer_summary_from_context(
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    max_turns: int = 5,
) -> str:
    """Build a staff-facing summary from the last few user turns."""
    from app.services.conversation_helpers import resolve_substantive_user_message

    parts: List[str] = []
    history = trim_history(conversation_history)
    user_msgs = [
        (m.get("content") or "").strip()
        for m in history
        if m.get("role") == "user"
    ][-max_turns:]
    current = resolve_substantive_user_message(user_message, conversation_history)
    if current and current.lower() not in {"yes", "no", "ok", "okay", "yep", "yeah"}:
        parts.append(current)
    for msg in reversed(user_msgs):
        if not msg or msg.startswith("FAQ feedback:"):
            continue
        if msg not in parts and msg.lower() not in {"yes", "no", "ok", "okay"}:
            parts.insert(0, msg)
    combined = " → ".join(parts[-3:]) if parts else (user_message or "").strip()
    return combined[:500] or (user_message or "").strip()[:200]


def extract_request_keywords(text: str) -> Set[str]:
    words = _words(text.lower())
    return words & REQUEST_KEYWORDS


def normalize_action_type_for_staff(action_type: str) -> ActionType:
    """Map HANDOFF or unknown model types to a staff-facing category."""
    upper = (action_type or "").upper().strip()
    if upper == "HANDOFF" or upper not in {a.value for a in ActionType}:
        return ActionType.CONTACT_FRONT_DESK
    try:
        return ActionType(upper)
    except ValueError:
        return ActionType.CONTACT_FRONT_DESK


def merge_classified_action(
    model_action: Optional[tuple],
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]],
) -> tuple[str, str]:
    """
    Override model ACTION with Python classifier; return (action_type_str, issue_summary).
    """
    classified = classify_service(user_message, conversation_history)
    issue = ""
    if model_action:
        model_type, issue = model_action
        classified = normalize_action_type_for_staff(model_type)
        # Python wins for service category when model disagrees on food vs supplies
        python_type = classify_service(user_message, conversation_history)
        if python_type == ActionType.MAINTENANCE:
            classified = ActionType.MAINTENANCE
        elif python_type == ActionType.HOUSEKEEPING and classified == ActionType.ROOM_SERVICE:
            classified = ActionType.HOUSEKEEPING
        elif python_type == ActionType.ROOM_SERVICE and classified not in (
            ActionType.MAINTENANCE,
            ActionType.HOUSEKEEPING,
        ):
            classified = ActionType.ROOM_SERVICE
        elif python_type == ActionType.CONTACT_FRONT_DESK and classified == ActionType.HANDOFF:
            classified = python_type
    return classified.value, issue
