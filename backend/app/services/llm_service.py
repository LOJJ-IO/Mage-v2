import asyncio
import logging
import re
import time
from datetime import datetime
import httpx
from pathlib import Path
from typing import AsyncGenerator, Optional, List, Dict, Any, Literal, Tuple
from collections import deque
from urllib.parse import quote
from zoneinfo import ZoneInfo
from app.core.config import get_settings
from app.models.schemas import ConversationContext
from app.services.database import get_database

settings = get_settings()
logger = logging.getLogger(__name__)


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
# Appended to every Python generic answer (required)
SATISFACTION_SUFFIX = "\n\nDo you require any further assistance? (Yes / No)"
# When user replies No to the above: end the turn (no small model); conversation resumes on next prompt
CLOSING_AFTER_NO = "No problem. Feel free to ask if you need anything else."
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


def _models_to_try(primary: str) -> List[str]:
    """Build list of model IDs to try: primary first, then fallbacks (no duplicates)."""
    fallbacks = [m.strip() for m in (settings.llm_model_fallbacks or "").split(",") if m.strip()]
    seen = {primary}
    out = [primary]
    for m in fallbacks:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _get_small_model_system(hotel_context: str = "") -> str:
    """Build the small model system prompt with hotel name and optional hotel knowledge."""
    hotel_name = settings.hotel_name or "the hotel"
    base = f"""You are the hotel assistant for {hotel_name}. Only answer questions about the guest's stay, the hotel, or hotel services. For anything else, respond NOT_RELEVANT.

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
"""
    if hotel_context:
        base += f"\nHotel knowledge:\n{hotel_context}\n"
    base += "\nPut NOT_RELEVANT or HANDOFF on the first line by itself when applicable. For ANSWER, use exactly: line 1 ANSWER, line 2 reply, optional line 3 ACTION."
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
    ) -> Dict[str, Any]:
        """Build JSON body for chat/completions; add plugins for openrouter/auto when LLM_AUTO_ALLOWED_MODELS is set."""
        body: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": settings.llm_max_tokens,
            "temperature": temperature,
        }
        if model == "openrouter/auto" and (settings.llm_auto_allowed_models or "").strip():
            patterns = [p.strip() for p in settings.llm_auto_allowed_models.split(",") if p.strip()]
            if patterns:
                body["plugins"] = [{"id": "auto-router", "allowed_models": patterns}]
        return body
    
    def _build_messages(
        self,
        user_message: str,
        context: ConversationContext,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Build message array for the API."""
        messages = [
            {"role": "system", "content": SYSTEM_PROMPTS.get(context, SYSTEM_PROMPTS[ConversationContext.BOT])}
        ]
        
        # Add conversation history
        if conversation_history:
            messages.extend(conversation_history[-10:])  # Last 10 messages for context
        
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
    ) -> List[Dict[str, Any]]:
        """Build message array for the small model (relevance + answer/handoff)."""
        hotel_context = _load_hotel_knowledge()
        system_content = _get_small_model_system(hotel_context)
        messages = [{"role": "system", "content": system_content}]
        if conversation_history:
            messages.extend(conversation_history[-10:])
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
        messages = self._build_small_model_messages(user_message, conversation_history, images)
        models = _models_to_try(settings.llm_model_small)
        last_http_error: Optional[httpx.HTTPStatusError] = None
        for model in models:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=self._build_request_body(model, messages, 0.3),
                    )
                    response.raise_for_status()
                    data = response.json()
                    content = (data["choices"][0]["message"]["content"] or "").strip()
                    first_line = content.split("\n")[0].strip().upper() if content else ""
                    if "NOT_RELEVANT" in first_line or content.upper().startswith("NOT_RELEVANT"):
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
        return ("I'm having trouble connecting right now. Please try again.", "answer", None)
    
    async def _call_large_model(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
    ) -> str:
        """Call large model via OpenRouter for complex relevant questions; on 404/unavailable try fallback models."""
        messages = self._build_messages(
            user_message, ConversationContext.BOT, conversation_history, images
        )
        models = _models_to_try(settings.llm_model_large)
        last_http_error: Optional[httpx.HTTPStatusError] = None
        for model in models:
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=self._build_request_body(model, messages, settings.llm_temperature),
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data["choices"][0]["message"]["content"] or "I'm sorry, I couldn't generate a response."
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

    async def _build_small_model_segments(
        self,
        user_message: str,
        clean_text: str,
        action: Optional[Tuple[str, str]],
        guest_id: Optional[str],
    ) -> List[Dict[str, Any]]:
        """Build one or more guest-facing assistant messages from parsed model output."""
        segments: List[Dict[str, Any]] = []
        text = self._sanitize_guest_text(clean_text)
        if action is None:
            fallback = text or "I'm sorry, I didn't catch that. Could you rephrase that for me?"
            if self._contains_deferral_phrase(fallback):
                return [
                    {"content": fallback, "require_contact_confirmation": False},
                    {"content": "Thanks for waiting. Could you share a little more detail so I can help right away?", "require_contact_confirmation": False},
                ]
            return [{"content": fallback, "require_contact_confirmation": False}]

        action_type, issue_summary = action
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

        if guest_id and action_type not in ("CONTACT_FRONT_DESK",):
            issue = self._build_ticket_summary(action_type, issue_summary, user_message)
            try:
                get_database().create_ticket(guest_id, issue)
            except Exception as e:
                logger.exception("Ticket creation error: %s", e)

        if not text:
            text = "I've logged your request. Our team will follow up shortly."

        segments.append({"content": text, "require_contact_confirmation": require_contact})
        if self._contains_deferral_phrase(text):
            issue_label = issue_summary.strip() or user_message.strip()[:120]
            confirmation = f"I've logged your {action_type.replace('_', ' ').lower()} request"
            if issue_label:
                confirmation += f": {issue_label}."
            else:
                confirmation += "."
            if confirmation.lower() != text.lower():
                segments.append({"content": confirmation, "require_contact_confirmation": require_contact})
        return segments
    
    async def generate_response(
        self,
        user_message: str,
        context: ConversationContext = ConversationContext.BOT,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Generate one or more assistant messages for a user prompt."""
        
        if not await rate_limiter.wait_and_acquire():
            return [{"content": "I'm currently experiencing high demand. Please try again in a moment.", "require_contact_confirmation": False}]
        
        if context == ConversationContext.FRONT_DESK_AGENT:
            return [{"content": "Your message has been sent to the front desk. They will respond shortly.", "require_contact_confirmation": False}]
        
        # 1. Python intent
        generic = self._get_intent_response(user_message, conversation_history)
        if generic is not None:
            if generic == CLOSING_AFTER_NO:
                return [{"content": generic, "require_contact_confirmation": False}]
            if generic in (HELLO_RESPONSE, ACKNOWLEDGMENT_RESPONSE, THANKS_RESPONSE):
                return [{"content": generic, "require_contact_confirmation": False}]
            return [{"content": generic + SATISFACTION_SUFFIX, "require_contact_confirmation": False}]
        
        # 2. No API key: keyword intents only; otherwise rotating offline copy
        if not self.api_key:
            return [{"content": self._no_api_key_fallback_text(user_message), "require_contact_confirmation": False}]
        
        # 3. Small model
        small_text, outcome, action = await self._call_small_model(user_message, conversation_history, images, guest_id)
        if outcome == "non_answer":
            return [{"content": small_text, "require_contact_confirmation": False}]
        if outcome == "handoff":
            large_text = await self._call_large_model(user_message, conversation_history, images)
            return [{"content": self._sanitize_guest_text(large_text), "require_contact_confirmation": False}]

        return await self._build_small_model_segments(user_message, small_text, action, guest_id)
    
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
        
        generic = self._get_intent_response(user_message, conversation_history)
        if generic is not None:
            if generic in (CLOSING_AFTER_NO, HELLO_RESPONSE, ACKNOWLEDGMENT_RESPONSE, THANKS_RESPONSE):
                full = generic
            else:
                full = generic + SATISFACTION_SUFFIX
            for word in full.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return
        
        if not self.api_key:
            fallback = self._no_api_key_fallback_text(user_message)
            for word in fallback.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return
        
        small_text, outcome, action = await self._call_small_model(user_message, conversation_history, images, guest_id)
        if outcome == "answer" and action:
            action_type, issue_summary = action
            if action_type == "GET_WEATHER":
                small_text = await self._build_weather_message(user_message)
            elif action_type == "GET_TIME":
                small_text = self._build_time_message()
            elif action_type == "GET_GUEST_INFO":
                if guest_id:
                    guest = get_database().get_guest(guest_id)
                    if guest:
                        small_text = (
                            f"Your profile shows: Name {guest.name}, Room {guest.room_number}, "
                            f"Membership {guest.membership_tier or 'Standard'}."
                        )
                    else:
                        small_text = "I couldn't find your guest profile details right now."
                else:
                    small_text = "I can share your guest details once your profile is linked in this chat."
            elif guest_id and action_type != "CONTACT_FRONT_DESK":
                issue = self._build_ticket_summary(action_type, issue_summary, user_message)
                try:
                    get_database().create_ticket(guest_id, issue)
                except Exception as e:
                    logger.exception("Ticket creation error: %s", e)
        if outcome == "non_answer":
            for word in small_text.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return
        if outcome == "handoff":
            large_text = await self._call_large_model(user_message, conversation_history, images)
            for word in large_text.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return
        final_text = self._sanitize_guest_text(small_text) or "I'm sorry, I didn't catch that. Could you rephrase that for me?"
        for word in final_text.split():
            yield word + " "
            await asyncio.sleep(0.05)
    
    def _get_intent_response(
        self, user_message: str, conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Optional[str]:
        """Python intent layer: returns generic answer if a block matches, else None (pass to small model).
        Does not return non-answer; relevance is decided only by the small model.
        """
        message_lower = user_message.lower().strip()
        words = set(re.findall(r"\b\w+\b", message_lower))
        if message_lower in {"ok", "okay", "i see", "got it", "understood", "alright"} and conversation_history:
            return ACKNOWLEDGMENT_RESPONSE
        # Follow-up "No": last assistant asked satisfaction and user said no → end turn (closing message)
        if conversation_history:
            hist = conversation_history[-10:]
            for m in reversed(hist):
                if m.get("role") == "assistant":
                    content = (m.get("content") or "").strip()
                    asked_satisfaction = (
                        "Was that helpful?" in content
                        or "Do you require any further assistance?" in content
                        or content.endswith("(Yes / No)")
                    )
                    if asked_satisfaction:
                        if words & {"no", "nope", "n", "nah", "negative"}:
                            return CLOSING_AFTER_NO
                        if message_lower in ("no", "nope", "n", "not really", "not exactly", "nah"):
                            return CLOSING_AFTER_NO
                        if "not" in words and words & {"really", "exactly"}:
                            return CLOSING_AFTER_NO
                    break
        # Phrases first (substring is ok for these)
        if "room service" in message_lower or ("order" in words and "room" in words):
            return "For room service, please dial 0 on your room phone, or I can connect you with the front desk to place an order."
        if "check out" in message_lower or "checkout" in message_lower:
            return "Checkout is at 11 AM. Would you like a late checkout? I can check availability for you."
        if "wake up" in message_lower or "wakeup" in message_lower:
            return "You can request a wake-up call by dialing 0 from your room phone. The front desk will set it up for you."
        # Word-boundary intents
        if words & {"wifi", "internet", "password", "wi-fi", "wifi"}:
            return "The WiFi network is 'HotelGuest' and the password is on the card in your room. Let me know if you have any trouble connecting!"
        if words & {"breakfast", "restaurant", "food", "eat", "eating", "dining"}:
            return "Our restaurant is open from 6:30 AM to 10:30 PM. Breakfast is served until 10:30 AM in the main dining room on the ground floor."
        if words & {"leaving", "leave", "depart"}:
            return "Checkout is at 11 AM. Would you like a late checkout? I can check availability for you."
        if words & {"pool", "gym", "fitness", "spa", "swim"}:
            return "The pool and fitness center are on the 3rd floor, open 6 AM - 10 PM. Towels are provided at the entrance."
        if re.fullmatch(r"(?:hi[\W_]*){2,}", message_lower):
            return HELLO_RESPONSE
        if words & {"help", "hi", "hello", "hey", "greetings"}:
            return HELLO_RESPONSE
        if words & {"problem", "issue", "broken", "maintenance"} or ("not" in words and "working" in words):
            return "I'm sorry to hear that. Can you describe the issue? I'll make sure the right team is notified to help you."
        if words & {"parking", "park", "car", "valet"}:
            return "Self-parking is available in the garage on level B1. Valet is available at the main entrance. Would you like the current rates?"
        if words & {"laundry", "dry", "cleaning", "press"}:
            return "Laundry and dry-cleaning are available. Place items in the bag in your closet and call the front desk for pickup. Same-day service is available for most items."
        if words & {"bill", "invoice", "charge", "payment", "pay"}:
            return "For your bill or to dispute a charge, please visit the front desk or dial 0 from your room. They can print a copy or go through line items with you."
        if words & {"pet", "pets", "dog", "cat"}:
            return "Pets are welcome with a small daily fee. Please let the front desk know so they can note your reservation. Pet amenities are available on request."
        if words & {"lost", "left", "forgot", "missing"}:
            return "For lost items, please contact the front desk or housekeeping. They keep a lost-and-found log and will follow up if something is found."
        if words & {"towel", "towels", "pillow", "pillows", "blanket", "blankets"}:
            return "Extra towels, pillows, or blankets are available through housekeeping—dial 0 from your room, or ask and I can help route your request."
        if "housekeeping" in message_lower or (words & {"housekeeper"}):
            return "Housekeeping can refresh your room or bring supplies—dial 0 from your room phone, or tell me what you need."
        if words & {"elevator", "lift"}:
            return "Guest elevators are in the lobby and at hallway ends. For accessibility needs, ask the front desk."
        if words & {"shuttle", "airport"} or "taxi" in message_lower or words & {"uber", "lyft"}:
            return "For airport shuttles or taxis, the front desk can book or share schedules and rates—dial 0 or stop by the lobby."
        if "minibar" in message_lower or "mini-bar" in message_lower or "mini bar" in message_lower:
            return "Minibar items are billed separately. If something looks wrong on your bill, ask the front desk to review it."
        if any(
            p in message_lower
            for p in ("room safe", "in-room safe", "in room safe", "hotel safe", "safe box", "open the safe")
        ):
            return "Safe instructions are in your welcome guide. If you need help opening or resetting it, contact the front desk."
        if words & {"noise", "loud", "noisy"}:
            return "I'm sorry for the disturbance. I can note a noise concern or connect you with the front desk to help."
        if words & {"cold", "hot", "temperature", "thermostat", "heating", "cooling"} or "air conditioning" in message_lower or "a/c" in message_lower:
            return "Try the wall thermostat for room climate. If it's still uncomfortable, dial 0 and maintenance can assist."
        if words & {"bar", "lounge", "cocktail", "wine", "beer"}:
            return "Bar and lounge hours are posted in the lobby—the front desk can share specials or help with reservations."
        if words & {"coffee", "tea"} and not (words & {"breakfast", "restaurant", "dining"}):
            return "Coffee and tea are available at breakfast in the dining room; ask the front desk for in-room options if you prefer."
        if words & {"upgrade", "upgrades"}:
            return "Room upgrades depend on availability—ask the front desk and they can check options and rates."
        if "ironing" in message_lower or words & {"iron"}:
            return "An iron and ironing board are typically in the closet. If yours is missing, dial 0 and housekeeping can bring one."
        if "hair dryer" in message_lower or "hairdryer" in message_lower or "blow dryer" in message_lower:
            return "A hair dryer is usually in the bathroom drawer. If it's missing, ask housekeeping or dial 0."
        if words & {"concierge", "directions"} or "nearby" in message_lower:
            return "Our concierge can help with maps, directions, and local reservations—visit the front desk or dial 0."
        if "thank" in message_lower or words & {"thanks", "thx"}:
            return THANKS_RESPONSE
        if words & {"amenities", "amenity"}:
            return "Common amenities include Wi-Fi, fitness, pool, dining, parking, and housekeeping—what would you like details on?"
        # No match → small model (or offline fallback if no API key)
        return None
    
    def _get_mock_response(self, user_message: str, context: ConversationContext) -> str:
        """Legacy: mock response when no API key. Uses intent layer; if no match, single fallback."""
        generic = self._get_intent_response(user_message, None)
        if generic is not None:
            if generic in (CLOSING_AFTER_NO, HELLO_RESPONSE, ACKNOWLEDGMENT_RESPONSE, THANKS_RESPONSE):
                return generic
            return generic + SATISFACTION_SUFFIX
        return self._no_api_key_fallback_text(user_message)


# Global LLM service instance
llm_service = LLMService()
