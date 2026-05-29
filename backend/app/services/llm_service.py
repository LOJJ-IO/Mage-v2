import asyncio
import logging
import re
import time
from datetime import datetime
import httpx
from pathlib import Path
from typing import AsyncGenerator, Optional, List, Dict, Any, Literal, Tuple, Set
from collections import deque
from urllib.parse import quote
from zoneinfo import ZoneInfo
from app.core.config import get_settings
from app.models.schemas import (
    ConversationContext,
    ActionType,
    MessageKind,
    StaffActionEscalationType,
)
from app.services.database import get_database
from app.services.social_shortcuts import is_standalone_thanks
from app.services.conversation_helpers import (
    trim_history,
    resolve_substantive_user_message,
    is_follow_up_detail,
    build_faq_llm_context,
)
from app.services.faq_intents import (
    collect_faq_matches,
    filter_faqs_for_display,
    is_task_request,
    pick_faq_intro,
    is_conversation_closing,
    should_show_faq_with_task,
    _words as faq_words,
)
from app.services.service_routing import (
    classify_service,
    build_staff_summary,
    infer_summary_from_context,
    is_in_room_issue,
    detect_utility_action,
    service_display_name,
    merge_classified_action,
    normalize_action_type_for_staff,
)
from app.services.request_consolidation import (
    append_to_best_pending,
    escalate_or_create_task,
    list_pending_actions_for_guest,
)
from app.services.intent_llm import (
    call_classifier,
    ClassifierError,
    ClassifierResult,
    format_classifier_routing_json,
    build_copy_writer_user_content,
    is_disqualified_classifier_model,
)

STAFF_LOG_TYPES = frozenset({
    "MAINTENANCE",
    "ROOM_SERVICE",
    "HOUSEKEEPING",
    "CONTACT_FRONT_DESK",
})

_PROMISE_PHRASES = re.compile(
    r"\b(?:logged|submitted|notified|request\s+received|sent\s+your\s+request|i'?ve\s+sent|team\s+will)\b",
    re.I,
)

_LEAKED_ENUM_LINE = re.compile(
    r"^(?:MAINTENANCE|ROOM_SERVICE|HOUSEKEEPING|HANDOFF|CONTACT_FRONT_DESK)\s*$",
    re.I,
)

settings = get_settings()
logger = logging.getLogger(__name__)

STAFF_INBOX_ACTION_TYPES = frozenset({
    "MAINTENANCE",
    "ROOM_SERVICE",
    "HOUSEKEEPING",
    "CONTACT_FRONT_DESK",
    "HANDOFF",
})

_GREETING_SHORT_CIRCUIT = frozenset({
    "hello", "hi", "hey", "ok", "okay", "thanks", "thx",
})

_EXPLICIT_SPEAK_PHRASES = (
    "speak to",
    "talk to",
    "contact",
    "call ",
    " person",
    "someone",
    "representative",
    "agent",
    "need to talk",
    "want to talk",
    "front desk",
)


def _is_pure_social_abilities(abilities: List[str]) -> bool:
    return abilities == ["G"] or (len(abilities) == 1 and abilities[0] == "G")


def _text_segment_dict(
    content: str,
    *,
    require_contact: bool = False,
) -> Dict[str, Any]:
    return {
        "content": content,
        "kind": MessageKind.TEXT.value,
        "require_contact_confirmation": require_contact,
    }


def _guest_explicitly_wants_to_speak(user_message: str) -> bool:
    msg_lower = (user_message or "").lower()
    return any(phrase in msg_lower for phrase in _EXPLICIT_SPEAK_PHRASES)


def _escalation_type_for_request(request_type: str) -> StaffActionEscalationType:
    mapping = {
        "follow_up_escalation": StaffActionEscalationType.ESCALATED,
        "repetition": StaffActionEscalationType.REPETITION,
        "status_check": StaffActionEscalationType.STATUS_CHECK,
        "social": StaffActionEscalationType.NORMAL,
    }
    return mapping.get(request_type, StaffActionEscalationType.NORMAL)


def _handle_contact_front_desk_segments(
    classified: ClassifierResult,
    user_message: str,
    guest_id: Optional[str],
    conversation_history: Optional[List[Dict[str, str]]],
) -> List[Dict[str, Any]]:
    title = ""
    if classified.tasks:
        title = (classified.tasks[0].get("title") or "").strip()
    if not title:
        title = (classified.message or "Guest inquiry")[:200]

    if classified.request_type == "follow_up_escalation" and guest_id:
        _, guest_msg = escalate_or_create_task(
            guest_id,
            "CONTACT_FRONT_DESK",
            title,
            "follow_up_escalation",
            user_message,
            conversation_history,
        )
        return [_text_segment_dict(guest_msg)]

    if _guest_explicitly_wants_to_speak(user_message):
        content = (classified.message or "I can connect you to the front desk.").strip()
        return [_text_segment_dict(content, require_contact=True)]

    if guest_id:
        _try_log_staff_action(
            guest_id,
            "CONTACT_FRONT_DESK",
            title,
            user_message,
            conversation_history=conversation_history,
            user_message=user_message,
            escalation_type=StaffActionEscalationType.CONTACT,
            skip_pending_append=True,
        )
    content = (
        classified.message
        or "The front desk can help with that — they'll reach out shortly."
    ).strip()
    return [_text_segment_dict(content)]

_LOGGED_TASK_PHRASES = (
    "maintenance on the way",
    "maintenance will",
    "room service",
    "housekeeping",
    "bringing up",
    "logged",
    "confirmed",
)


def _extract_logged_tasks_from_history(
    conversation_history: Optional[List[Dict[str, str]]],
) -> List[Dict[str, str]]:
    """Scan assistant messages for logged task confirmations."""
    logged: List[Dict[str, str]] = []
    if not conversation_history:
        return logged
    for msg in conversation_history:
        if msg.get("role") != "assistant":
            continue
        content = (msg.get("content") or "").lower()
        if not any(phrase in content for phrase in _LOGGED_TASK_PHRASES):
            continue
        if "maintenance" in content:
            service = "MAINTENANCE"
        elif "room service" in content:
            service = "ROOM_SERVICE"
        elif "housekeeping" in content:
            service = "HOUSEKEEPING"
        else:
            continue
        logged.append({"service": service, "summary": content[:100]})
    return logged


def _build_logged_tasks_summary(
    guest_id: Optional[str],
    conversation_history: Optional[List[Dict[str, str]]],
) -> List[Dict[str, str]]:
    """Pending staff inbox rows plus heuristic extractions from chat."""
    seen_services: Set[str] = set()
    out: List[Dict[str, str]] = []
    if guest_id:
        for action in list_pending_actions_for_guest(guest_id):
            svc = action.action_type.value if hasattr(action.action_type, "value") else str(action.action_type)
            if svc in seen_services:
                continue
            seen_services.add(svc)
            out.append({"service": svc, "summary": (action.summary or "")[:100]})
    for item in _extract_logged_tasks_from_history(conversation_history):
        svc = item["service"]
        if svc not in seen_services:
            seen_services.add(svc)
            out.append(item)
    return out


def _is_hotel_docs_source(info_source: Optional[str]) -> bool:
    return (info_source or "").upper().strip() == "HOTEL_DOCS"


def _try_log_staff_action(
    guest_id: Optional[str],
    action_type: str,
    summary: str,
    source_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    user_message: Optional[str] = None,
    *,
    escalation_type: StaffActionEscalationType = StaffActionEscalationType.NORMAL,
    skip_pending_append: bool = False,
) -> Optional[Any]:
    """Log or append staff action. Returns StaffAction on success."""
    if not guest_id:
        return None
    if (
        user_message
        and is_follow_up_detail(user_message)
        and not skip_pending_append
    ):
        try:
            appended = append_to_best_pending(guest_id, user_message)
            if appended:
                return appended
        except Exception as e:
            logger.exception("Staff action append error: %s", e)
    resolved_type = normalize_action_type_for_staff(action_type)
    if resolved_type == ActionType.HANDOFF:
        resolved_type = classify_service(
            user_message or source_message or "",
            conversation_history,
        )
    if resolved_type.value not in STAFF_LOG_TYPES:
        return None
    substantive = resolve_substantive_user_message(
        source_message or user_message or "",
        conversation_history,
    )
    summary_text = (summary or "").strip()
    if not summary_text or summary_text.lower() in {"yes", "no", "ok", "okay"}:
        summary_text = build_staff_summary(
            resolved_type,
            substantive,
            conversation_history,
        )
    try:
        return get_database().log_staff_action(
            guest_id=guest_id,
            action_type=resolved_type,
            summary=summary_text,
            source_message=substantive,
            escalation_type=escalation_type,
            guest_conversation_thread_id=guest_id,
        )
    except Exception as e:
        logger.exception("Staff action log error: %s", e)
        return None


def _contains_promise_language(text: str) -> bool:
    return bool(_PROMISE_PHRASES.search(text or ""))


def _ensure_logged_for_promise(
    guest_id: Optional[str],
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]],
    segments: List[Dict[str, Any]],
    logged_action: Optional[Any],
) -> Optional[Any]:
    """Fallback log when model promised action but nothing was stored."""
    if logged_action or not guest_id:
        return logged_action
    combined = " ".join((s.get("content") or "") for s in segments)
    if not _contains_promise_language(combined):
        return None
    action_type = classify_service(user_message, conversation_history)
    summary = build_staff_summary(action_type, user_message, conversation_history)
    return _try_log_staff_action(
        guest_id,
        action_type.value,
        summary,
        user_message,
        conversation_history=conversation_history,
        user_message=user_message,
    )


def _finalize_segments(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Final guest-text pass on all assistant segments before API response."""
    out: List[Dict[str, Any]] = []
    for seg in segments:
        copy = dict(seg)
        if copy.get("kind") == MessageKind.FAQ.value:
            if copy.get("intro"):
                copy["intro"] = LLMService._sanitize_guest_text(copy["intro"])
            if copy.get("content"):
                copy["content"] = LLMService._sanitize_guest_text(copy["content"])
        elif copy.get("content"):
            copy["content"] = LLMService._sanitize_guest_text(copy["content"])
        out.append(copy)
    return out


_STAFF_CONFIRM_MSG = (
    "I can confirm your request is with our team—they'll follow up shortly."
)


def _staff_confirm_already_in_segments(segments: List[Dict[str, Any]]) -> bool:
    """True if guest already has our standard confirmation bubble."""
    needle = "confirm your request is with our team"
    confirm_lower = _STAFF_CONFIRM_MSG.lower()
    for seg in segments:
        c = (seg.get("content") or "").lower().strip()
        if needle in c or c == confirm_lower:
            return True
    return False


def _wrap_staff_task_segments(
    _action_type: ActionType,
    model_text: str,
    logged: bool,
) -> List[Dict[str, Any]]:
    """Guest reply when a task was logged: model text plus confirmation when staff inbox updated."""
    segments: List[Dict[str, Any]] = []
    clean = LLMService._sanitize_guest_text(model_text) if model_text else ""
    confirm_lower = _STAFF_CONFIRM_MSG.lower()
    # Show copy unless it is essentially the same as the confirm bubble (avoid duplicate).
    if clean and clean.lower() != confirm_lower and not _staff_confirm_already_in_segments(
        [{"content": clean}]
    ):
        segments.append(
            {"content": clean, "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}
        )
    if logged:
        if not _staff_confirm_already_in_segments(segments):
            segments.append(
                {
                    "content": _STAFF_CONFIRM_MSG,
                    "kind": MessageKind.TEXT.value,
                    "require_contact_confirmation": False,
                }
            )
    elif clean:
        return segments if segments else [
            {"content": clean, "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}
        ]
    else:
        segments.append(
            {
                "content": "I'm sorry, I didn't catch that. Could you rephrase that for me?",
                "kind": MessageKind.TEXT.value,
                "require_contact_confirmation": False,
            }
        )
    return segments


class RateLimiter:
    """Simple sliding window rate limiter."""
    
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: deque = deque()
        self._lock = asyncio.Lock()
    
    async def acquire(self) -> bool:
        """Try to acquire a request slot. Returns True if allowed."""
        async with self._lock:
            now = time.time()
            
            # Remove old requests outside the window
            while self.requests and self.requests[0] < now - self.window_seconds:
                self.requests.popleft()
            
            if len(self.requests) < self.max_requests:
                self.requests.append(now)
                return True
            
            return False
    
    async def wait_and_acquire(self, timeout: float = 30.0) -> bool:
        """Wait until a slot is available or timeout."""
        start = time.time()
        while time.time() - start < timeout:
            if await self.acquire():
                return True
            await asyncio.sleep(0.1)
        return False


# Global rate limiter instance
rate_limiter = RateLimiter(
    max_requests=settings.rate_limit_requests,
    window_seconds=settings.rate_limit_window
)


# System prompts for different contexts (BOT only; FRONT_DESK_AGENT does not use LLM)
SYSTEM_PROMPTS = {
    ConversationContext.BOT: """You are Mage, a friendly and helpful AI assistant for hotel guests. 
You help guests with questions about their stay, hotel amenities, local recommendations, and general inquiries.
Be warm, professional, and concise. If you cannot help with something, offer to connect them with the front desk.
Keep responses brief and mobile-friendly (2-3 sentences typically).""",

    ConversationContext.FRONT_DESK_AGENT: """You are simulating a human front desk agent for testing purposes.
Respond as a professional, friendly hotel employee would.
Be helpful, empathetic, and solution-oriented.
Use natural language and occasional small talk appropriate for hospitality."""
}

# Used only by small model when it classifies message as not relevant (Python intent never returns this)
NON_ANSWER = "I'm here to help with your stay—amenities, room, dining, and local tips. For anything else, the front desk is happy to help!"
# Legacy; FAQ panels use dedicated helpfulness buttons instead
SATISFACTION_SUFFIX = "\n\nDo you require any further assistance? (Yes / No)"
CLOSING_AFTER_NO = "Glad I could help! Let me know if you need anything else during your stay."
FAQ_HELPFUL_ACK = "Glad that helped! Let me know if you need anything else."
HELLO_RESPONSE = "Hello! I'm Mage, your hotel assistant. I can help with room service, amenities, local recommendations, or any questions about your stay. What can I do for you?"
ACKNOWLEDGMENT_RESPONSE = "I understand. I'm here if you'd like more help with anything about your stay."
THANKS_RESPONSE = "You're welcome! Let me know if you need anything else during your stay."

_DEFERRAL_PATTERNS = (
    r"\bhold on\b",
    r"\bjust a moment\b",
    r"\bone moment\b",
    r"\bplease wait\b",
    r"\blet me (?:check|get|pull|confirm)\b",
    r"\bteam will follow up\b",
    r"\bfollow up shortly\b",
)

# When OPENROUTER_API_KEY is unset, rotate these instead of one identical line every time
_NO_API_KEY_FALLBACK_VARIANTS = [
    "I can help with Wi-Fi, checkout times, dining, the pool, parking, and housekeeping. What would you like to know?",
    "Ask about room amenities, restaurant hours, local tips, or I can connect you with the front desk—what do you need?",
    "For room service, dial 0 from your room phone. I can also help with Wi-Fi, checkout, fitness hours, and common requests.",
    "Tell me if you need anything about your stay: billing, lost items, maintenance, or local recommendations.",
    "I'm here for questions about the hotel—amenities, dining, your room, or getting in touch with staff. What's on your mind?",
]

# Cached hotel knowledge (path -> content) so we don't read the file every request
_hotel_knowledge_cache: Dict[str, str] = {}


def _load_hotel_knowledge() -> str:
    """Load hotel knowledge from the file at settings.hotel_knowledge_path. Returns '' if path empty or file missing."""
    path = (settings.hotel_knowledge_path or "").strip()
    if not path:
        return ""
    if path in _hotel_knowledge_cache:
        return _hotel_knowledge_cache[path]
    try:
        p = Path(path)
        if not p.is_absolute():
            p = Path(__file__).resolve().parent.parent.parent / path
        content = p.read_text(encoding="utf-8").strip()
        _hotel_knowledge_cache[path] = content
        return content
    except Exception:
        return ""


# OpenRouter free/auto routers often pick slow "thinking" models that exhaust max_tokens.
_OPENROUTER_BROAD_ROUTERS = frozenset({"openrouter/free", "openrouter/auto"})

# Substrings that indicate reasoning-heavy models to skip when fallbacks are available.
_THINKING_MODEL_MARKERS = ("thinking", "reason", "ring-", "r1", "deepseek-r1")


def _is_thinking_model_id(model_id: str) -> bool:
    lower = (model_id or "").lower()
    return any(m in lower for m in _THINKING_MODEL_MARKERS)


def _models_to_try(primary: str, *, prefer_fast: bool = True) -> List[str]:
    """Build list of model IDs to try: primary first, then fallbacks (no duplicates)."""
    primary = (primary or "").strip()
    fallbacks = [m.strip() for m in (settings.llm_model_fallbacks or "").split(",") if m.strip()]
    use_router = primary in _OPENROUTER_BROAD_ROUTERS
    if use_router:
        # Honor openrouter/free and openrouter/auto as first choice (user-configured routers).
        prefer_fast = False
        candidates = [primary]
        for fb in fallbacks:
            if fb not in candidates:
                candidates.append(fb)
    else:
        candidates = [primary] + fallbacks if primary else fallbacks
    out: List[str] = []
    seen: Set[str] = set()
    for m in candidates:
        if not m or m in seen:
            continue
        if prefer_fast and _is_thinking_model_id(m) and len(candidates) > 1:
            continue
        seen.add(m)
        out.append(m)
    if not out and primary:
        out = [primary]
    return out


def _format_guest_context(guest_id: Optional[str]) -> str:
    """Inject signed-in guest details so the model does not ask for room/booking."""
    if not guest_id:
        return ""
    guest = get_database().get_guest(guest_id)
    if not guest:
        return (
            "\nGuest session: This chat is linked to a checked-in guest. "
            "Do not ask for room number or booking ID.\n"
        )
    parts = [
        "\nCurrent guest (already signed in — never ask for room number or booking ID):",
        f"- Name: {guest.name}",
        f"- Room: {guest.room_number}",
    ]
    if guest.booking_id:
        parts.append(f"- Booking: {guest.booking_id}")
    if guest.membership_tier:
        parts.append(f"- Membership: {guest.membership_tier}")
    parts.append(
        "For in-room requests (towels, housekeeping, maintenance, room service), "
        "confirm you are sending the request to their room and use the correct ACTION line. "
        "Staff already receive this guest's room with the request."
    )
    return "\n".join(parts) + "\n"


# Set False (or say "revert the system prompt") to restore _SMALL_MODEL_SYSTEM_LEGACY.
_SMALL_MODEL_SYSTEM_SHORT = True

_SMALL_MODEL_SYSTEM_LEGACY = """You are the hotel assistant for {hotel_name}. Only answer questions about the guest's stay, the hotel, or hotel services. For anything else, respond NOT_RELEVANT.

Output format (strict):
- First line must be exactly one of: NOT_RELEVANT, HANDOFF, or ANSWER.
- If NOT_RELEVANT: first line is NOT_RELEVANT, nothing else.
- If HANDOFF (relevant but too complex): first line is HANDOFF, nothing else.
- If ANSWER: first line is ANSWER, second line is your brief guest-visible reply, and optionally add ONE ACTION line after that.
  ACTION: MAINTENANCE, ACTION: ROOM_SERVICE, ACTION: HOUSEKEEPING
  ACTION: CONTACT_FRONT_DESK (if guest explicitly wants to speak to a person)
  ACTION: GET_TIME (if guest asks for the current time)
  ACTION: GET_WEATHER (if guest asks for the current weather)
  ACTION: GET_GUEST_INFO (if guest asks for their room, name, or membership)

Rules:
- Never output ANSWER, HANDOFF, NOT_RELEVANT, or ACTION in the guest-visible reply line.
- Do NOT invent weather or time values. For weather/time questions, keep the reply generic and add ACTION: GET_WEATHER or ACTION: GET_TIME.
- Only use service ACTIONs (MAINTENANCE, ROOM_SERVICE, HOUSEKEEPING) when the guest is asking to create or route a service request.
- For informational questions (amenities, directions, explanations), do not add service ACTIONs.
- Short follow-ups like "okay", "i see", "got it", and "thanks" should stay relevant and never be classified as NOT_RELEVANT when they refer to the ongoing hotel conversation.
- Broken fixtures, plumbing, climate, showers, toilets, and in-room equipment are always hotel-related; NEVER use NOT_RELEVANT for them.
- ROOM_SERVICE is only for in-room food and beverages. Towels, linens, baby beds, and supplies are HOUSEKEEPING. Repairs are MAINTENANCE.
- Do not tell guests to call or visit the front desk for requests you can handle; you represent the hotel operations team.
- Never put MAINTENANCE, ROOM_SERVICE, HOUSEKEEPING, HANDOFF, CONTACT_FRONT_DESK, or the word ACTION in the guest-visible reply line.
- If the guest adds timing or details (e.g. "in 15 minutes") to a request already discussed, confirm the detail in your reply and do NOT add a new ACTION line.
- When guest context (name/room) is provided below, never ask for room number, booking ID, or check-in details—they are already known.
- Never output XML, JSON, or tags such as tool_call in guest-visible text.

Put NOT_RELEVANT or HANDOFF on the first line by itself when applicable. For ANSWER, use exactly: line 1 ANSWER, line 2 reply, optional line 3 ACTION."""

_SMALL_MODEL_SYSTEM_SHORT_TEXT = """You are the hotel assistant for {hotel_name}. Stay/hotel topics only; else NOT_RELEVANT.

Line 1: NOT_RELEVANT | HANDOFF | ANSWER
ANSWER → line 2: short guest reply (no protocol words). Optional line 3: ACTION: MAINTENANCE|ROOM_SERVICE|HOUSEKEEPING|CONTACT_FRONT_DESK|GET_TIME|GET_WEATHER|GET_GUEST_INFO

Towels/supplies=HOUSEKEEPING; in-room food/drink=ROOM_SERVICE; repairs=MAINTENANCE. Broken fixtures are never NOT_RELEVANT. Service ACTION only when guest wants something done, not for pure info. Timing-only follow-ups: no new ACTION. If guest name/room is below, never ask for room or booking. No XML/tags in reply."""


def _get_small_model_system(hotel_context: str = "") -> str:
    """Build the small model system prompt with hotel name and optional hotel knowledge."""
    hotel_name = settings.hotel_name or "the hotel"
    if _SMALL_MODEL_SYSTEM_SHORT:
        base = _SMALL_MODEL_SYSTEM_SHORT_TEXT.format(hotel_name=hotel_name)
    else:
        base = _SMALL_MODEL_SYSTEM_LEGACY.format(hotel_name=hotel_name)
        if hotel_context:
            base += f"\nHotel knowledge:\n{hotel_context}\n"
    return base


class LLMService:
    """Service for interacting with LLM via OpenRouter."""
    
    def __init__(self):
        self.base_url = settings.openrouter_base_url
        self.api_key = (settings.openrouter_api_key or "").strip()
        self.model = settings.llm_model

    @staticmethod
    def _no_api_key_fallback_text(user_message: str) -> str:
        """Stable variety when no LLM key: same message always maps to the same variant."""
        s = user_message or ""
        idx = abs(sum(ord(c) for c in s)) % len(_NO_API_KEY_FALLBACK_VARIANTS)
        return _NO_API_KEY_FALLBACK_VARIANTS[idx]
        
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mage-hotel.app",
            "X-Title": "Mage Hotel Assistant"
        }

    def _build_request_body(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        temperature: float,
        *,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Build JSON body for chat/completions; add plugins for openrouter/auto when LLM_AUTO_ALLOWED_MODELS is set."""
        cap = max_tokens if max_tokens is not None else settings.llm_max_tokens
        body: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": cap,
            "temperature": temperature,
        }
        if model in _OPENROUTER_BROAD_ROUTERS and (settings.llm_auto_allowed_models or "").strip():
            patterns = [p.strip() for p in settings.llm_auto_allowed_models.split(",") if p.strip()]
            if patterns:
                body["plugins"] = [{"id": "auto-router", "allowed_models": patterns}]
        return body

    @staticmethod
    def _extract_usable_content(raw: str, finish_reason: str) -> str:
        """Use model output; recover ANSWER/ACTION block if a thinking model hit length."""
        text = (raw or "").strip()
        if not text:
            return ""
        if finish_reason != "length":
            return text
        for marker in ("ANSWER\n", "ANSWER\r\n", "\nANSWER\n"):
            idx = text.rfind(marker)
            if idx >= 0:
                return text[idx:].strip()
        lines = text.splitlines()
        tail = "\n".join(lines[-8:]).strip()
        return tail or text[:500]
    
    def _build_messages(
        self,
        user_message: str,
        context: ConversationContext,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Build message array for the API."""
        system = SYSTEM_PROMPTS.get(context, SYSTEM_PROMPTS[ConversationContext.BOT])
        guest_block = _format_guest_context(guest_id)
        if guest_block:
            system = system + guest_block
        messages = [{"role": "system", "content": system}]
        
        # Add conversation history
        if conversation_history:
            messages.extend(trim_history(conversation_history))
        
        # Build user message content
        if images:
            content = [{"type": "text", "text": user_message}]
            for img in images[:4]:  # Max 4 images
                content.append({
                    "type": "image_url",
                    "image_url": {"url": img}
                })
            messages.append({"role": "user", "content": content})
        else:
            messages.append({"role": "user", "content": user_message})
        
        return messages
    
    def _build_small_model_messages(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Build message array for the small model (relevance + answer/handoff)."""
        hotel_context = _load_hotel_knowledge()
        system_content = _get_small_model_system(hotel_context) + _format_guest_context(guest_id)
        messages = [{"role": "system", "content": system_content}]
        if conversation_history:
            messages.extend(trim_history(conversation_history))
        if images:
            content = [{"type": "text", "text": user_message}]
            for img in images[:4]:
                content.append({"type": "image_url", "image_url": {"url": img}})
            messages.append({"role": "user", "content": content})
        else:
            messages.append({"role": "user", "content": user_message})
        return messages
    
    async def _fetch_weather(self, location: str = "Edmonton") -> str:
        """Fetch current weather using wttr.in (no API key required)."""
        try:
            encoded_location = quote((location or "").strip() or settings.default_weather_location)
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"https://wttr.in/{encoded_location}?format=%C,+%t")
                response.raise_for_status()
                weather = response.text.strip()
                if not weather or "Unknown location" in weather:
                    return "currently unavailable"
                return weather
        except Exception as e:
            logger.error("Failed to fetch weather: %s", e)
            return "currently unavailable"

    def _extract_weather_location(self, user_message: str) -> str:
        """Extract weather location from the message, with a hotel-config default fallback."""
        default_location = (settings.default_weather_location or "").strip()
        if not default_location:
            hotel_context = _load_hotel_knowledge()
            for pattern in (
                r"(?im)^\s*city\s*:\s*([a-zA-Z][a-zA-Z\s\-']{1,60})\s*$",
                r"(?im)^\s*location\s*:\s*([a-zA-Z][a-zA-Z\s\-']{1,60})\s*$",
            ):
                match = re.search(pattern, hotel_context)
                if match:
                    default_location = match.group(1).strip()
                    break
        default_location = default_location or "Edmonton"
        message = (user_message or "").strip()
        match = re.search(r"(?:weather\s+(?:in|for)|in)\s+([a-zA-Z][a-zA-Z\s\-']{1,60})\??$", message, flags=re.I)
        if not match:
            return default_location
        location = re.sub(r"\s+", " ", match.group(1)).strip(" ?.,!")
        return location or default_location

    def _build_time_message(self) -> str:
        """Build a formatted current-time message in hotel timezone."""
        tz_name = (settings.hotel_timezone or "").strip()
        try:
            tz = ZoneInfo(tz_name) if tz_name else datetime.now().astimezone().tzinfo
        except Exception:
            tz = datetime.now().astimezone().tzinfo
            tz_name = ""
        now = datetime.now(tz)
        suffix = f" ({tz_name})" if tz_name else ""
        return f"The current time is {now.strftime('%I:%M %p')}{suffix}."

    async def _build_weather_message(self, user_message: str) -> str:
        """Build weather message with extracted or configured location."""
        location = self._extract_weather_location(user_message)
        weather = await self._fetch_weather(location)
        if weather == "currently unavailable":
            return f"I'm sorry, I couldn't fetch live weather for {location} right now."
        return f"The weather in {location} is {weather}."

    @staticmethod
    def _sanitize_guest_text(text: str) -> str:
        """Remove protocol markers and collapse extra blank lines for guest-facing output."""
        cleaned = (text or "").strip()
        if not cleaned:
            return ""
        cleaned = re.sub(r"<\s*/?\s*tool_call\s*/?\s*>", "", cleaned, flags=re.I)
        cleaned = re.sub(r"^\s*(?:ANSWER|HANDOFF|NOT_RELEVANT)\s*:?\s*", "", cleaned, flags=re.I)
        lines: List[str] = []
        for line in cleaned.splitlines():
            stripped = line.strip()
            if not stripped:
                if lines and lines[-1] != "":
                    lines.append("")
                continue
            if re.match(r"^(?:ANSWER|HANDOFF|NOT_RELEVANT)\b", stripped, flags=re.I):
                continue
            if re.match(r"^ACTION\s*:", stripped, flags=re.I):
                continue
            if _LEAKED_ENUM_LINE.match(stripped):
                continue
            lines.append(stripped)
        return "\n".join(lines).strip()

    @staticmethod
    def _contains_deferral_phrase(text: str) -> bool:
        """Detect phrases that imply a promised follow-up message."""
        lowered = (text or "").lower()
        return any(re.search(pattern, lowered) for pattern in _DEFERRAL_PATTERNS)

    @staticmethod
    def _build_ticket_summary(action_type: str, issue_summary: str, user_message: str) -> str:
        """Create a ticket summary with user detail when model omits detail."""
        if issue_summary.strip():
            return issue_summary.strip()
        normalized_action = action_type.replace("_", " ").strip().lower()
        return f"{normalized_action}: {(user_message or '').strip()[:200]}"

    def _parse_action_from_content(self, content: str) -> Tuple[str, Optional[Tuple[str, str]]]:
        """Strip ACTION: line and leading ANSWER line from content; return (clean_text, (action_type, issue_summary) or None)."""
        action: Optional[Tuple[str, str]] = None
        lines = (content or "").split("\n")
        kept = []
        for line in lines:
            stripped = line.strip()
            if stripped.upper().startswith("ACTION:"):
                rest = stripped[7:].strip()
                if ":" in rest:
                    action_type, _, issue = rest.partition(":")
                    action = (action_type.strip().upper(), issue.strip())
                else:
                    action = (rest.upper() if rest else "MAINTENANCE", "")
            else:
                kept.append(line)
        clean = "\n".join(kept).strip()
        clean = self._sanitize_guest_text(clean)
        return (clean, action)

    async def _call_small_model(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
    ) -> Tuple[str, Literal["non_answer", "handoff", "answer"], Optional[Tuple[str, str]]]:
        """Call small model via OpenRouter; on 404/unavailable try fallback models. Returns (response_text, outcome, optional_action)."""
        messages = self._build_small_model_messages(
            user_message, conversation_history, images, guest_id
        )
        models = _models_to_try(settings.llm_model_small, prefer_fast=True)
        last_http_error: Optional[httpx.HTTPStatusError] = None
        for model in models:
            try:
                async with httpx.AsyncClient(timeout=settings.llm_request_timeout_small) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=self._build_request_body(
                            model,
                            messages,
                            0.3,
                            max_tokens=settings.llm_max_tokens_small,
                        ),
                    )
                    response.raise_for_status()
                    data = response.json()
                    choice = data["choices"][0]
                    finish = choice.get("finish_reason") or ""
                    raw_content = choice.get("message", {}).get("content") or ""
                    content = self._extract_usable_content(raw_content, finish)
                    if finish == "length" and not content:
                        logger.warning(
                            "Small model %s returned length-truncated empty content; trying next.",
                            model,
                        )
                        continue
                    if finish == "length":
                        logger.warning(
                            "Small model %s hit max_tokens=%s; using extracted tail.",
                            model,
                            settings.llm_max_tokens_small,
                        )
                    first_line = content.split("\n")[0].strip().upper() if content else ""
                    if "NOT_RELEVANT" in first_line or content.upper().startswith("NOT_RELEVANT"):
                        if is_in_room_issue(user_message) or is_task_request(
                            user_message.lower(), faq_words(user_message.lower())
                        ):
                            clean_text, action = self._parse_action_from_content(
                                "ANSWER\nI'll make sure the right team helps you with that.\n"
                                f"ACTION: {classify_service(user_message, conversation_history).value}"
                            )
                            return (clean_text, "answer", action)
                        return (NON_ANSWER, "non_answer", None)
                    if "HANDOFF" in first_line or content.upper().startswith("HANDOFF"):
                        return ("", "handoff", None)
                clean_text, action = self._parse_action_from_content(content)
                return (clean_text, "answer", action)
            except httpx.HTTPStatusError as e:
                last_http_error = e
                body = (e.response.text or "")[:300]
                logger.warning(
                    "Small model %s failed: %s %s | %s; trying next.",
                    model,
                    e.response.status_code,
                    e.response.reason_phrase or "",
                    body,
                )
                continue
            except Exception as e:
                logger.exception("Small model error: %s", e)
                return ("I'm having trouble connecting right now. Please try again.", "answer", None)
        if last_http_error:
            body = (last_http_error.response.text or "")[:500]
            logger.error(
                "Small model all failed. Last: %s %s | %s",
                last_http_error.response.status_code,
                last_http_error.response.reason_phrase or "",
                body,
            )
        msg_lower = user_message.lower()
        words = faq_words(msg_lower)
        if is_task_request(msg_lower, words) or is_in_room_issue(user_message):
            classified = classify_service(user_message, conversation_history)
            clean, action = self._parse_action_from_content(
                "ANSWER\nI'll make sure the right team is notified to help you.\n"
                f"ACTION: {classified.value}"
            )
            return (clean, "answer", action)
        return ("I'm having trouble connecting right now. Please try again.", "answer", None)
    
    async def _call_large_model(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        *,
        use_task_model: bool = False,
        guest_id: Optional[str] = None,
    ) -> str:
        """Call large/thinking model via OpenRouter; on 404/unavailable try fallback models."""
        messages = self._build_messages(
            user_message,
            ConversationContext.BOT,
            conversation_history,
            images,
            guest_id,
        )
        primary = (
            (settings.llm_model_thinking or "").strip()
            if use_task_model
            else settings.llm_model_large
        )
        models = _models_to_try(primary or settings.llm_model_large, prefer_fast=not use_task_model)
        last_http_error: Optional[httpx.HTTPStatusError] = None
        for model in models:
            try:
                cap = (
                    settings.llm_max_tokens_large
                    if use_task_model and (settings.llm_model_thinking or "").strip()
                    else min(settings.llm_max_tokens_large, 512)
                )
                async with httpx.AsyncClient(timeout=settings.llm_request_timeout_large) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=self._build_request_body(
                            model,
                            messages,
                            settings.llm_temperature,
                            max_tokens=cap,
                        ),
                    )
                    response.raise_for_status()
                    data = response.json()
                    choice = data["choices"][0]
                    finish = choice.get("finish_reason") or ""
                    raw = choice.get("message", {}).get("content") or ""
                    content = self._extract_usable_content(raw, finish)
                    if finish == "length" and not content.strip():
                        logger.warning("Large model %s length-truncated; trying next.", model)
                        continue
                    return content or "I'm sorry, I couldn't generate a response."
            except httpx.HTTPStatusError as e:
                last_http_error = e
                body = (e.response.text or "")[:300]
                logger.warning(
                    "Large model %s failed: %s %s | %s; trying next.",
                    model,
                    e.response.status_code,
                    e.response.reason_phrase or "",
                    body,
                )
                continue
            except Exception as e:
                logger.exception("Large model error: %s", e)
                return "Something went wrong. Please try again or contact the front desk directly."
        if last_http_error:
            body = (last_http_error.response.text or "")[:500]
            logger.error(
                "Large model all failed. Last: %s %s | %s",
                last_http_error.response.status_code,
                last_http_error.response.reason_phrase or "",
                body,
            )
        return "Something went wrong. Please try again or contact the front desk directly."

    def _build_faq_segment(
        self,
        user_message: str,
        guest_id: Optional[str],
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> Optional[Dict[str, Any]]:
        message_lower = user_message.lower().strip()
        words = faq_words(message_lower)
        matched = filter_faqs_for_display(
            message_lower,
            collect_faq_matches(message_lower, words),
            conversation_history,
        )
        if not matched:
            return None
        items = [{"id": f.id, "title": f.title, "body": f.body} for f in matched]
        bundle_key = ",".join(i["id"] for i in items)
        intro = pick_faq_intro(guest_id, bundle_key)
        return {
            "kind": MessageKind.FAQ.value,
            "intro": intro,
            "content": intro,
            "faq_items": items,
            "trigger_content": user_message.strip(),
            "faq_resolved": None,
            "require_contact_confirmation": False,
        }

    def _get_simple_response(
        self, user_message: str, conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Optional[str]:
        """Short-circuit greetings, thanks, closings, and acks — not FAQ or LLM."""
        message_lower = user_message.lower().strip()
        words = faq_words(message_lower)
        if message_lower in {"ok", "okay", "i see", "got it", "understood", "alright"} and conversation_history:
            return ACKNOWLEDGMENT_RESPONSE
        if conversation_history and is_conversation_closing(message_lower, words):
            return CLOSING_AFTER_NO
        if re.fullmatch(r"(?:hi[\W_]*){2,}", message_lower):
            return HELLO_RESPONSE
        if words & {"help", "hi", "hello", "hey", "greetings"} and len(words) <= 3:
            return HELLO_RESPONSE
        if is_standalone_thanks(user_message):
            return THANKS_RESPONSE
        return None

    def _copy_models_to_try(self) -> List[str]:
        primary = (settings.llm_copy_model or "openrouter/free").strip()
        return _models_to_try(primary, prefer_fast=False)

    def _build_copy_writer_operational_context(
        self,
        intent: str,
        guest_id: Optional[str],
        classified: Optional[ClassifierResult],
        conversation_history: Optional[List[Dict[str, str]]],
        *,
        routing_json: str = "",
    ) -> str:
        lines = [
            "",
            "--- OPERATIONAL CONTEXT (internal, do not mention to guest) ---",
            f"Intent: {intent}",
        ]
        if routing_json:
            lines.append(f"Classifier routing: {routing_json}")
        if guest_id:
            guest = get_database().get_guest(guest_id)
            if guest:
                lines.append(f"Guest: {guest.name}, Room {guest.room_number}")
        logged_tasks = _build_logged_tasks_summary(guest_id, conversation_history)
        if logged_tasks:
            lines.append("Already confirmed in this conversation:")
            for task in logged_tasks:
                lines.append(f"  - {task['service']}: {task['summary']}")
            lines.append("Do not re-confirm or re-address these.")
        lines.append("Address ONLY the current message.")
        lines.append(
            "Answer using hotel knowledge (2–3 sentences). "
            "Do not mention staff routing or internal systems."
        )
        lines.append("---")
        return "\n".join(lines)

    def _build_copy_writer_system(
        self,
        intent: str,
        guest_id: Optional[str],
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
        *,
        classified: Optional[ClassifierResult] = None,
        routing_json: str = "",
    ) -> str:
        hotel_name = settings.hotel_name or "the hotel"
        base = (
            f"You are Mage, the hotel assistant for {hotel_name}. "
            "Write warm, brief, mobile-friendly replies (2–3 sentences max)."
        )
        knowledge = _load_hotel_knowledge()
        if knowledge:
            base += f"\n\nHotel knowledge:\n{knowledge}"
        base += (
            "\n\nIf specific details (hours, passwords, prices) are not in the hotel "
            "knowledge block, do not invent them. Say in one sentence that you don't "
            "have that detail and suggest dialing 0 for the front desk."
            "\n\nUse only the hotel knowledge block for factual claims. "
            "Ignore any draft classifier message or prior assistant replies that "
            "state hours, prices, or policies not present in hotel knowledge."
        )
        base += self._build_copy_writer_operational_context(
            intent,
            guest_id,
            classified,
            conversation_history,
            routing_json=routing_json,
        )
        base += (
            "\n\nOutput only the guest-facing reply text. "
            "No ANSWER line, no ACTION line, no JSON, no markdown headers."
        )
        return base

    def _routing_json_for_copy(self, classified: ClassifierResult) -> str:
        return format_classifier_routing_json(classified, for_copy_writer=True)

    async def _call_copy_writer(
        self,
        intent: str,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
        guest_id: Optional[str],
        *,
        images: Optional[List[str]] = None,
        classified: Optional[ClassifierResult] = None,
    ) -> str:
        """Prose-only guest reply for HOTEL_DOCS info; classifier JSON + gist."""
        routing_json = (
            self._routing_json_for_copy(classified)
            if classified
            else format_classifier_routing_json(
                ClassifierResult(confidence=0.9, raw="")
            )
        )
        gist = infer_summary_from_context(user_message, conversation_history)
        system = self._build_copy_writer_system(
            intent,
            guest_id,
            user_message,
            conversation_history,
            classified=classified,
            routing_json=routing_json,
        )
        messages: List[Dict[str, Any]] = [{"role": "system", "content": system}]
        use_full_history = settings.llm_copy_include_full_history
        if use_full_history:
            history = trim_history(conversation_history)
            if history:
                messages.extend(history)
            user_content = user_message
        else:
            user_content = build_copy_writer_user_content(
                routing_json=routing_json,
                user_message=user_message,
                conversation_gist=gist,
            )
        if images:
            content: List[Dict[str, Any]] = [{"type": "text", "text": user_content}]
            for img in images[:4]:
                content.append({"type": "image_url", "image_url": {"url": img}})
            messages.append({"role": "user", "content": content})
        else:
            messages.append({"role": "user", "content": user_content})

        models = self._copy_models_to_try()
        last_http_error: Optional[httpx.HTTPStatusError] = None
        for model in models:
            try:
                async with httpx.AsyncClient(timeout=settings.llm_request_timeout_large) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=self._build_request_body(
                            model,
                            messages,
                            settings.llm_temperature,
                            max_tokens=settings.llm_max_tokens_copy,
                        ),
                    )
                    response.raise_for_status()
                    data = response.json()
                    resolved_model = (data.get("model") or model) or ""
                    if is_disqualified_classifier_model(resolved_model):
                        logger.warning(
                            "Copy writer resolved to disqualified model %s; trying next.",
                            resolved_model,
                        )
                        continue
                    raw = (data["choices"][0].get("message", {}).get("content") or "").strip()
                    if raw:
                        return self._sanitize_guest_text(raw)
            except httpx.HTTPStatusError as e:
                last_http_error = e
                logger.warning("Copy writer %s failed: %s", model, e.response.status_code)
                continue
            except Exception as e:
                logger.exception("Copy writer error: %s", e)
                continue
        if last_http_error:
            logger.error("Copy writer all models failed.")
        return "I'm having trouble connecting right now. Please try again in a moment."

    def _classifier_passes_confidence(self, result: ClassifierResult) -> bool:
        """True when classifier confidence meets threshold (no keyword bypass)."""
        threshold = settings.llm_classifier_min_confidence
        confidence = result.confidence
        if result.salvaged:
            confidence = max(confidence, 0.5)
        return confidence >= threshold

    def _apply_classifier_confidence_gate(
        self,
        classified: ClassifierResult,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
    ) -> ClassifierResult:
        """On low confidence: safety-net D for in-room issues, else empty abilities."""
        if self._classifier_passes_confidence(classified):
            return classified
        if is_in_room_issue(user_message):
            logger.info(
                "Classifier low confidence (%.2f); in-room safety net → ability D",
                classified.confidence,
            )
            service = classify_service(user_message, conversation_history).value
            return ClassifierResult(
                abilities=["D"],
                tasks=[{
                    "service": service,
                    "title": classified.title or "In-room issue reported",
                }],
                confidence=max(classified.confidence, settings.llm_classifier_min_confidence),
                raw=classified.raw,
                salvaged=True,
                request_type="new",
                message=classified.message or "I've alerted our team about that right away.",
                info_source=classified.info_source,
            )
        return ClassifierResult(
            abilities=[],
            tasks=[],
            confidence=classified.confidence,
            raw=classified.raw,
            salvaged=True,
            message="",
            request_type="status_check",
            info_source=classified.info_source,
        )

    def _python_action_from_classifier(
        self,
        result: ClassifierResult,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
    ) -> Tuple[str, str]:
        """Merge classifier service hint with Python classify_service (single pass)."""
        hint = (result.service or "").upper() if result.service else None
        model_action = (hint, "") if hint else None
        return merge_classified_action(model_action, user_message, conversation_history)

    def _log_staff_task(
        self,
        guest_id: Optional[str],
        action_type_str: str,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
        issue_summary: str = "",
        *,
        staff_title: Optional[str] = None,
    ) -> bool:
        """Log one staff inbox row; returns whether logging succeeded."""
        if not guest_id or action_type_str not in STAFF_LOG_TYPES:
            return False
        substantive = resolve_substantive_user_message(user_message, conversation_history)
        if staff_title and staff_title.strip():
            summary = staff_title.strip()[:500]
        else:
            summary = build_staff_summary(
                ActionType(action_type_str),
                substantive,
                conversation_history,
                issue_summary,
            )
        return (
            _try_log_staff_action(
                guest_id,
                action_type_str,
                summary,
                substantive,
                conversation_history=conversation_history,
                user_message=user_message,
            )
            is not None
        )

    def _log_staff_tasks_from_classifier(
        self,
        classified: ClassifierResult,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
        guest_id: Optional[str],
    ) -> bool:
        """Create staff ticket(s) from classifier tasks. Returns True if any logged."""
        if not guest_id:
            return False
        if classified.request_type == "repetition":
            for task in classified.tasks:
                logger.info(
                    "Duplicate task detected: %s '%s'",
                    task.get("service"),
                    task.get("title"),
                )
            return False

        logged_any = False
        if classified.tasks:
            for task in classified.tasks:
                service = task.get("service")
                if not service or service not in STAFF_LOG_TYPES:
                    continue
                title = (task.get("title") or "").strip()
                if (
                    classified.request_type == "follow_up_escalation"
                    and title
                    and not title.lower().startswith("follow-up")
                ):
                    title = f"Follow-up: {title}"
                logged_any |= self._log_staff_task(
                    guest_id,
                    service,
                    user_message,
                    conversation_history,
                    staff_title=title or None,
                )
            return logged_any

        action_type_str, issue_summary = self._python_action_from_classifier(
            classified, user_message, conversation_history
        )
        return self._log_staff_task(
            guest_id,
            action_type_str,
            user_message,
            conversation_history,
            issue_summary,
            staff_title=classified.title,
        )

    async def _build_staff_task_segments_from_copy(
        self,
        user_message: str,
        copy_text: str,
        action_type_str: str,
        guest_id: Optional[str],
        conversation_history: Optional[List[Dict[str, str]]],
        *,
        staff_already_logged: bool,
        issue_summary: str = "",
    ) -> List[Dict[str, Any]]:
        """Wrap copy-writer prose for staff tasks without re-running classify_service."""
        text = self._sanitize_guest_text(copy_text)
        action_enum = ActionType(action_type_str)
        require_contact = action_type_str == "CONTACT_FRONT_DESK"
        logged_ok = staff_already_logged
        if not logged_ok:
            logged_ok = self._log_staff_task(
                guest_id,
                action_type_str,
                user_message,
                conversation_history,
                issue_summary,
            )
        segments = _wrap_staff_task_segments(action_enum, text, logged_ok)
        logged_action = True if logged_ok else None
        logged_action = _ensure_logged_for_promise(
            guest_id,
            user_message,
            conversation_history,
            segments,
            logged_action,
        )
        if logged_action and not _staff_confirm_already_in_segments(segments):
            segments = _wrap_staff_task_segments(action_enum, text, True)
        for seg in segments:
            seg.setdefault("kind", MessageKind.TEXT.value)
            seg["require_contact_confirmation"] = require_contact
        return segments

    def _classifier_guest_reply(
        self,
        classified: ClassifierResult,
        fallback: str,
    ) -> str:
        msg = (classified.message or "").strip()
        return self._sanitize_guest_text(msg) if msg else fallback

    def _text_segment(self, content: str, *, require_contact: bool = False) -> Dict[str, Any]:
        return {
            "content": content,
            "kind": MessageKind.TEXT.value,
            "require_contact_confirmation": require_contact,
        }

    async def _route_by_abilities(
        self,
        classified: ClassifierResult,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
        guest_id: Optional[str],
        images: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        """Route by classifier abilities only; stack segments independently."""
        history = trim_history(conversation_history)
        abilities = classified.abilities or []
        segments: List[Dict[str, Any]] = []
        latest_lower = (user_message or "").lower().strip()
        info_via_copy_writer = "E" in abilities or "F" in abilities

        if _is_pure_social_abilities(abilities):
            content = self._classifier_guest_reply(classified, "Hi there!")
            return [self._text_segment(content)]

        if not abilities:
            if latest_lower in _GREETING_SHORT_CIRCUIT:
                simple = self._get_simple_response(user_message, history)
                content = (
                    simple
                    or self._classifier_guest_reply(
                        classified, ACKNOWLEDGMENT_RESPONSE
                    )
                )
                return [self._text_segment(content)]
            if (classified.message or "").strip():
                return [
                    self._text_segment(
                        self._classifier_guest_reply(classified, NON_ANSWER)
                    )
                ]
            return [self._text_segment(NON_ANSWER)]

        if "D" in abilities:
            if classified.request_type == "repetition":
                for task in classified.tasks:
                    logger.info(
                        "Duplicate task suppressed: %s '%s'",
                        task.get("service"),
                        task.get("title"),
                    )
            else:
                for task in classified.tasks:
                    service = task.get("service")
                    if not service or service not in STAFF_LOG_TYPES:
                        continue
                    title = (task.get("title") or "").strip()
                    if service == "CONTACT_FRONT_DESK":
                        segments.extend(
                            _handle_contact_front_desk_segments(
                                classified,
                                user_message,
                                guest_id,
                                history,
                            )
                        )
                        continue
                    if classified.request_type == "follow_up_escalation" and guest_id:
                        _, guest_msg = escalate_or_create_task(
                            guest_id,
                            service,
                            title,
                            classified.request_type,
                            user_message,
                            history,
                        )
                        segments.append(self._text_segment(guest_msg))
                        continue
                    if guest_id:
                        _try_log_staff_action(
                            guest_id,
                            service,
                            title or build_staff_summary(
                                ActionType(service),
                                resolve_substantive_user_message(
                                    user_message, history
                                ),
                                history,
                            ),
                            user_message,
                            conversation_history=history,
                            user_message=user_message,
                            escalation_type=_escalation_type_for_request(
                                classified.request_type
                            ),
                            skip_pending_append=True,
                        )
                    guest_line = (classified.message or "").strip()
                    if guest_line and not info_via_copy_writer:
                        segments.append(self._text_segment(guest_line))
                    elif title and not info_via_copy_writer:
                        segments.append(
                            self._text_segment(
                                "I've passed that along to our team."
                            )
                        )
            if classified.message and not segments and not info_via_copy_writer:
                segments.append(
                    self._text_segment(self._classifier_guest_reply(classified, ""))
                )

        if "A" in abilities:
            location = self._extract_weather_location(user_message)
            weather = await self._fetch_weather(location)
            segments.append(
                self._text_segment(f"The weather in {location} is {weather}.")
            )

        if "B" in abilities:
            segments.append(self._text_segment(self._build_time_message()))

        if "C" in abilities:
            if guest_id:
                guest = get_database().get_guest(guest_id)
                if guest:
                    info = (
                        f"Your profile: {guest.name}, Room {guest.room_number}, "
                        f"Membership {guest.membership_tier or 'Standard'}."
                    )
                else:
                    info = "I couldn't find your guest profile details right now."
            else:
                info = "I can share your guest details once your profile is linked."
            segments.append(self._text_segment(info))

        if "E" in abilities or "F" in abilities:
            copy_text = await self._call_copy_writer(
                "INFO",
                user_message,
                history,
                guest_id,
                images=images,
                classified=classified,
            )
            segments.append(self._text_segment(copy_text))

        if not segments:
            segments.append(
                self._text_segment(
                    self._classifier_guest_reply(
                        classified,
                        "Let me know if there's anything else I can help with.",
                    )
                )
            )
        return segments

    async def _route_via_two_layer(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
        images: Optional[List[str]],
        guest_id: Optional[str],
    ) -> List[Dict[str, Any]]:
        history = trim_history(conversation_history)
        try:
            classified = await call_classifier(user_message, history, api_key=self.api_key)
        except ClassifierError as e:
            logger.error("Classifier failed: %s", e)
            return [
                {
                    "content": "I'm having trouble connecting right now. Please try again in a moment.",
                    "kind": MessageKind.TEXT.value,
                    "require_contact_confirmation": False,
                }
            ]

        classified = self._apply_classifier_confidence_gate(
            classified, user_message, history
        )
        return await self._route_by_abilities(
            classified,
            user_message,
            history,
            guest_id,
            images,
        )

    async def _build_small_model_segments(
        self,
        user_message: str,
        clean_text: str,
        action: Optional[Tuple[str, str]],
        guest_id: Optional[str],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        *,
        pre_logged_action: Optional[Any] = None,
    ) -> List[Dict[str, Any]]:
        """Build one or more guest-facing assistant messages from parsed model output."""
        segments: List[Dict[str, Any]] = []
        text = self._sanitize_guest_text(clean_text)
        if action is None:
            fallback = text or "I'm sorry, I didn't catch that. Could you rephrase that for me?"
            if self._contains_deferral_phrase(fallback):
                logger.info("Guest text had deferral phrasing but no staff action; single reply only.")
            return [{"content": fallback, "require_contact_confirmation": False}]

        action_type_str, issue_summary = merge_classified_action(
            action, user_message, conversation_history
        )
        action_type = action_type_str
        action_enum = ActionType(action_type_str)
        require_contact = action_type == "CONTACT_FRONT_DESK"

        follow_up: Optional[str] = None
        if action_type == "GET_WEATHER":
            follow_up = await self._build_weather_message(user_message)
            if self._contains_deferral_phrase(text) and text:
                segments.append({"content": text, "require_contact_confirmation": False})
            segments.append({"content": follow_up, "require_contact_confirmation": False})
            return segments

        if action_type == "GET_TIME":
            follow_up = self._build_time_message()
            if self._contains_deferral_phrase(text) and text:
                segments.append({"content": text, "require_contact_confirmation": False})
            segments.append({"content": follow_up, "require_contact_confirmation": False})
            return segments

        if action_type == "GET_GUEST_INFO":
            if guest_id:
                guest = get_database().get_guest(guest_id)
                if guest:
                    follow_up = (
                        f"Your profile shows: Name {guest.name}, Room {guest.room_number}, "
                        f"Membership {guest.membership_tier or 'Standard'}."
                    )
                else:
                    follow_up = "I couldn't find your guest profile details right now."
            else:
                follow_up = "I can share your guest details once your profile is linked in this chat."
            if self._contains_deferral_phrase(text) and text:
                segments.append({"content": text, "require_contact_confirmation": False})
            segments.append({"content": follow_up, "require_contact_confirmation": False})
            return segments

        logged_action = pre_logged_action
        if logged_action is None and guest_id and action_type in STAFF_LOG_TYPES:
            substantive = resolve_substantive_user_message(user_message, conversation_history)
            summary = build_staff_summary(action_enum, substantive, conversation_history, issue_summary)
            logged_action = _try_log_staff_action(
                guest_id,
                action_type,
                summary,
                substantive,
                conversation_history=conversation_history,
                user_message=user_message,
            )

        if action_type in STAFF_LOG_TYPES:
            segments = _wrap_staff_task_segments(action_enum, text, logged_action is not None)
            logged_action = _ensure_logged_for_promise(
                guest_id, user_message, conversation_history, segments, logged_action
            )
            if logged_action and not _staff_confirm_already_in_segments(segments):
                segments = _wrap_staff_task_segments(action_enum, text, True)
            for seg in segments:
                seg.setdefault("kind", MessageKind.TEXT.value)
                seg["require_contact_confirmation"] = require_contact
            return segments

        if not text:
            text = "I've logged your request. Our team will follow up shortly."

        segments.append({
            "content": text,
            "kind": MessageKind.TEXT.value,
            "require_contact_confirmation": require_contact,
        })
        if self._contains_deferral_phrase(text):
            issue_label = issue_summary.strip() or user_message.strip()[:120]
            confirmation = f"I've logged your {action_type.replace('_', ' ').lower()} request"
            if issue_label:
                confirmation += f": {issue_label}."
            else:
                confirmation += "."
            if confirmation.lower() != text.lower():
                segments.append({
                    "content": confirmation,
                    "kind": MessageKind.TEXT.value,
                    "require_contact_confirmation": require_contact,
                })
        return segments
    
    async def generate_faq_feedback(
        self,
        helpful: bool,
        trigger_content: str,
        conversation_history: Optional[List[Dict[str, str]]],
        guest_id: Optional[str],
        faq_titles: Optional[List[str]] = None,
        images: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        if helpful:
            return [{"content": FAQ_HELPFUL_ACK, "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}]
        llm_prompt = build_faq_llm_context(trigger_content, faq_titles)
        if not self.api_key:
            return [
                {"content": self._no_api_key_fallback_text(trigger_content), "kind": MessageKind.TEXT.value, "require_contact_confirmation": False},
            ]
        segments: List[Dict[str, Any]] = []
        if settings.llm_use_two_layer_routing:
            try:
                classified = await call_classifier(
                    llm_prompt, conversation_history, api_key=self.api_key
                )
            except ClassifierError:
                return [
                    {
                        "content": "I'm having trouble connecting right now. Please try again in a moment.",
                        "kind": MessageKind.TEXT.value,
                        "require_contact_confirmation": False,
                    }
                ]
            classified = self._apply_classifier_confidence_gate(
                classified, llm_prompt, conversation_history
            )
            more = await self._route_by_abilities(
                classified,
                trigger_content,
                conversation_history,
                guest_id,
                images,
            )
            segments.extend(more)
            return _finalize_segments(segments)

        small_text, outcome, action = await self._call_small_model(
            llm_prompt, conversation_history, images, guest_id
        )
        if outcome == "handoff":
            if guest_id:
                ht = classify_service(trigger_content, conversation_history)
                _try_log_staff_action(
                    guest_id,
                    ht.value,
                    build_staff_summary(ht, trigger_content, conversation_history),
                    trigger_content,
                    conversation_history=conversation_history,
                    user_message=trigger_content,
                )
            large_text = await self._call_large_model(
                llm_prompt,
                conversation_history,
                images,
                use_task_model=True,
                guest_id=guest_id,
            )
            segments.append(
                {"content": self._sanitize_guest_text(large_text), "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}
            )
            return _finalize_segments(segments)
        if outcome == "non_answer":
            segments.append({"content": small_text, "kind": MessageKind.TEXT.value, "require_contact_confirmation": False})
            return segments
        more = await self._build_small_model_segments(
            trigger_content, small_text, action, guest_id, conversation_history
        )
        segments.extend(more)
        return _finalize_segments(segments)

    async def _route_bot_message(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]],
        images: Optional[List[str]],
        guest_id: Optional[str],
        *,
        task_continuation: bool = False,
    ) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
        history = trim_history(conversation_history)
        simple = self._get_simple_response(user_message, history)
        if simple is not None:
            return (
                _finalize_segments(
                    [{"content": simple, "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}]
                ),
                False,
                None,
            )
        
        message_lower = user_message.lower().strip()
        words = faq_words(message_lower)
        task_like = is_task_request(message_lower, words) or bool(images) or is_in_room_issue(user_message)
        faq_matches = [] if (images or task_continuation) else collect_faq_matches(message_lower, words)
        faq_matches = filter_faqs_for_display(message_lower, faq_matches, history)

        if faq_matches and task_like and should_show_faq_with_task(message_lower, words, faq_matches):
            faq_seg = self._build_faq_segment(user_message, guest_id, history)
            if faq_seg:
                return (_finalize_segments([faq_seg]), True, user_message)

        if faq_matches and not task_like:
            faq_seg = self._build_faq_segment(user_message, guest_id, history)
            if faq_seg:
                return (_finalize_segments([faq_seg]), False, None)
        
        if not self.api_key:
            if guest_id and task_like:
                msg_lower = message_lower
                substantive = resolve_substantive_user_message(user_message, history)
                if any(
                    k in msg_lower
                    for k in ("shower", "broken", "leak", "maintenance", "not working", "repair", "plumbing")
                ):
                    _try_log_staff_action(
                        guest_id, "MAINTENANCE",
                        substantive[:200] or "Maintenance request", substantive,
                        conversation_history=history, user_message=user_message,
                    )
                elif any(k in msg_lower for k in ("room service", "food order", "hungry", "order food")):
                    _try_log_staff_action(
                        guest_id, "ROOM_SERVICE",
                        substantive[:200] or "Room service request", substantive,
                        conversation_history=history, user_message=user_message,
                    )
                elif any(k in msg_lower for k in ("housekeeping", "clean", "towels", "sheets")):
                    _try_log_staff_action(
                        guest_id, "HOUSEKEEPING",
                        substantive[:200] or "Housekeeping request", substantive,
                        conversation_history=history, user_message=user_message,
                    )
            return (
                _finalize_segments(
                    [{"content": self._no_api_key_fallback_text(user_message), "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}]
                ),
                False,
                None,
            )
        
        if settings.llm_use_two_layer_routing:
            segments = await self._route_via_two_layer(
                user_message, history, images, guest_id
            )
            return (_finalize_segments(segments), False, None)

        small_text, outcome, action = await self._call_small_model(user_message, history, images, guest_id)
        if outcome == "non_answer":
            if is_in_room_issue(user_message) or task_like:
                classified = classify_service(user_message, history)
                synthetic_action = (classified.value, "")
                segments = await self._build_small_model_segments(
                    user_message,
                    "I'll make sure the right team is notified to help you.",
                    synthetic_action,
                    guest_id,
                    history,
                )
                return (_finalize_segments(segments), False, None)
            return (
                _finalize_segments(
                    [{"content": small_text, "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}]
                ),
                False,
                None,
            )
        if outcome == "handoff":
            if guest_id:
                substantive = resolve_substantive_user_message(user_message, history)
                ht = classify_service(user_message, history)
                _try_log_staff_action(
                    guest_id,
                    ht.value,
                    build_staff_summary(ht, substantive, history),
                    substantive,
                    conversation_history=history,
                    user_message=user_message,
                )
            large_text = await self._call_large_model(
                user_message,
                history,
                images,
                use_task_model=True,
                guest_id=guest_id,
            )
            return (
                _finalize_segments(
                    [{"content": self._sanitize_guest_text(large_text), "kind": MessageKind.TEXT.value, "require_contact_confirmation": False}]
                ),
                False,
                None,
            )

        segments = await self._build_small_model_segments(user_message, small_text, action, guest_id, history)
        return (_finalize_segments(segments), False, None)

    async def generate_response(
        self,
        user_message: str,
        context: ConversationContext = ConversationContext.BOT,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if not await rate_limiter.wait_and_acquire():
            return [{"content": "I'm currently experiencing high demand. Please try again in a moment.", "require_contact_confirmation": False}]
        if context == ConversationContext.FRONT_DESK_AGENT:
            return [{"content": "Your message has been sent to the front desk. They will respond shortly.", "require_contact_confirmation": False}]
        segments, _, _ = await self._route_bot_message(user_message, conversation_history, images, guest_id)
        return segments

    async def route_message(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
        *,
        task_continuation: bool = False,
    ) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
        """Route message; returns (segments, continue_task, task_message)."""
        return await self._route_bot_message(
            user_message,
            conversation_history,
            images,
            guest_id,
            task_continuation=task_continuation,
        )
    
    async def generate_stream(
        self,
        user_message: str,
        context: ConversationContext = ConversationContext.BOT,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response: Python intent first, then small/large model."""
        
        if not await rate_limiter.wait_and_acquire():
            yield "I'm currently experiencing high demand. Please try again in a moment."
            return
        
        if context == ConversationContext.FRONT_DESK_AGENT:
            msg = "Your message has been sent to the front desk. They will respond shortly."
            for word in msg.split():
                yield word + " "
            return
        
        segments, _, _ = await self._route_bot_message(user_message, conversation_history, images, guest_id)
        parts: List[str] = []
        for seg in segments:
            if seg.get("kind") == MessageKind.FAQ.value:
                parts.append(seg.get("intro") or seg.get("content") or "")
                for item in seg.get("faq_items") or []:
                    if isinstance(item, dict):
                        parts.append(f"{item.get('title', '')}: {item.get('body', '')}")
            elif seg.get("content"):
                parts.append(str(seg["content"]))
        full = "\n\n".join(p for p in parts if p).strip() or "Let me know if you need anything else."
        for word in full.split():
            yield word + " "
            await asyncio.sleep(0.05)
    
    def _get_mock_response(self, user_message: str, context: ConversationContext) -> str:
        """Legacy: mock response when no API key."""
        simple = self._get_simple_response(user_message, None)
        if simple is not None:
            return simple
        return self._no_api_key_fallback_text(user_message)


# Global LLM service instance
llm_service = LLMService()
