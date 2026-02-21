import asyncio
import logging
import re
import time
import httpx
from pathlib import Path
from typing import AsyncGenerator, Optional, List, Dict, Any, Literal, Tuple
from collections import deque
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
- If ANSWER: first line is ANSWER, then your brief helpful reply. If the guest needs a service (maintenance, room service, housekeeping, etc.), add a second line: ACTION: MAINTENANCE or ACTION: ROOM_SERVICE or ACTION: HOUSEKEEPING (optionally add a colon and short issue summary, e.g. ACTION: MAINTENANCE: AC not working).
"""
    if hotel_context:
        base += f"\nHotel knowledge:\n{hotel_context}\n"
    base += "\nPut NOT_RELEVANT or HANDOFF on the first line by itself when applicable. For ANSWER, put ANSWER on the first line, then your reply, then optionally an ACTION line."
    return base


class LLMService:
    """Service for interacting with LLM via OpenRouter."""
    
    def __init__(self):
        self.base_url = settings.openrouter_base_url
        self.api_key = settings.openrouter_api_key
        self.model = settings.llm_model
        
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
    
    def _parse_action_from_content(self, content: str) -> Tuple[str, Optional[Tuple[str, str]]]:
        """Strip ACTION: line and leading ANSWER line from content; return (clean_text, (action_type, issue_summary) or None)."""
        action: Optional[Tuple[str, str]] = None
        lines = content.split("\n")
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
        if clean.upper().startswith("ANSWER"):
            first_newline = clean.find("\n")
            if first_newline != -1:
                clean = clean[first_newline + 1 :].strip()
            else:
                clean = ""
        return (clean, action)

    async def _call_small_model(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
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
                    if not clean_text and action:
                        clean_text = "I've logged your request. Our team will follow up shortly."
                    return (clean_text or content, "answer", action)
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
    
    async def generate_response(
        self,
        user_message: str,
        context: ConversationContext = ConversationContext.BOT,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None,
        guest_id: Optional[str] = None,
    ) -> str:
        """Generate a response: Python intent first, then small model, then large if handoff."""
        
        if not await rate_limiter.wait_and_acquire():
            return "I'm currently experiencing high demand. Please try again in a moment."
        
        if context == ConversationContext.FRONT_DESK_AGENT:
            return "Your message has been sent to the front desk. They will respond shortly."
        
        # 1. Python intent (generic answer, closing-after-no, or None)
        generic = self._get_intent_response(user_message, conversation_history)
        if generic is not None:
            if generic == CLOSING_AFTER_NO:
                return generic
            return generic + SATISFACTION_SUFFIX
        
        # 2. No API key: fallback
        if not self.api_key:
            return "I'm here to help! Could you tell me more about what you need? I can assist with hotel amenities, local recommendations, or connect you with our front desk."
        
        # 3. Small model
        small_text, outcome, action = await self._call_small_model(user_message, conversation_history, images)
        if outcome == "non_answer":
            return small_text
        if outcome == "handoff":
            return await self._call_large_model(user_message, conversation_history, images)
        if outcome == "answer" and action and guest_id:
            action_type, issue_summary = action
            issue = issue_summary or f"{action_type} request: {user_message[:200]}"
            try:
                get_database().create_ticket(guest_id, issue)
            except Exception as e:
                logger.exception("Ticket creation error: %s", e)
        return small_text
    
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
            full = generic if generic == CLOSING_AFTER_NO else generic + SATISFACTION_SUFFIX
            for word in full.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return
        
        if not self.api_key:
            fallback = "I'm here to help! Could you tell me more about what you need? I can assist with hotel amenities, local recommendations, or connect you with our front desk."
            for word in fallback.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return
        
        small_text, outcome, action = await self._call_small_model(user_message, conversation_history, images)
        if outcome == "answer" and action and guest_id:
            action_type, issue_summary = action
            issue = issue_summary or f"{action_type} request: {user_message[:200]}"
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
        for word in small_text.split():
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
        if words & {"help", "hi", "hello", "hey", "greetings"}:
            return "Hello! I'm Mage, your hotel assistant. I can help with room service, amenities, local recommendations, or any questions about your stay. What can I do for you?"
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
        # No match → small model
        return None
    
    def _get_mock_response(self, user_message: str, context: ConversationContext) -> str:
        """Legacy: mock response when no API key. Uses intent layer; if no match, single fallback."""
        generic = self._get_intent_response(user_message, None)
        if generic is not None:
            if generic == CLOSING_AFTER_NO:
                return generic
            return generic + SATISFACTION_SUFFIX
        return "I'm here to help! Could you tell me more about what you need? I can assist with hotel amenities, local recommendations, or connect you with our front desk."


# Global LLM service instance
llm_service = LLMService()
