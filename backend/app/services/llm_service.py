import asyncio
import time
import httpx
from typing import AsyncGenerator, Optional, List, Dict, Any
from collections import deque
from app.core.config import get_settings
from app.models.schemas import ConversationContext

settings = get_settings()


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


# System prompts for different contexts
SYSTEM_PROMPTS = {
    ConversationContext.BOT: """You are Mage, a friendly and helpful AI assistant for hotel guests. 
You help guests with questions about their stay, hotel amenities, local recommendations, and general inquiries.
Be warm, professional, and concise. If you cannot help with something, offer to connect them with the front desk.
Keep responses brief and mobile-friendly (2-3 sentences typically).""",

    ConversationContext.AI_AGENT: """You are an AI-powered front desk agent for the hotel.
You have more authority than the basic bot - you can help with:
- Room service requests
- Booking modifications
- Billing inquiries
- Maintenance requests
- Special accommodations

Be professional but warm. If something requires human verification or is beyond your capability, 
let the guest know you'll escalate to a human agent.
Keep responses concise and action-oriented.""",

    ConversationContext.FRONT_DESK_AGENT: """You are simulating a human front desk agent for testing purposes.
Respond as a professional, friendly hotel employee would.
Be helpful, empathetic, and solution-oriented.
Use natural language and occasional small talk appropriate for hospitality."""
}


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
    
    async def generate_response(
        self,
        user_message: str,
        context: ConversationContext = ConversationContext.BOT,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None
    ) -> str:
        """Generate a response from the LLM."""
        
        # Check rate limit
        if not await rate_limiter.wait_and_acquire():
            return "I'm currently experiencing high demand. Please try again in a moment."
        
        # If no API key, return mock response
        if not self.api_key:
            return self._get_mock_response(user_message, context)
        
        messages = self._build_messages(user_message, context, conversation_history, images)
        
        # Retry logic for rate limiting
        max_retries = 3
        retry_delay = 1.0
        
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json={
                            "model": self.model,
                            "messages": messages,
                            "max_tokens": settings.llm_max_tokens,
                            "temperature": settings.llm_temperature,
                        }
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data["choices"][0]["message"]["content"]
                    
            except httpx.HTTPStatusError as e:
                error_detail = ""
                try:
                    error_detail = e.response.json()
                except:
                    error_detail = e.response.text
                
                # Handle rate limiting (429) with retry
                if e.response.status_code == 429 and attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                    print(f"Rate limited (429). Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries})...")
                    await asyncio.sleep(wait_time)
                    continue
                
                print(f"HTTP error {e.response.status_code}: {error_detail}")
                print(f"Request URL: {self.base_url}/chat/completions")
                print(f"Model: {self.model}")
                
                if e.response.status_code == 429:
                    return "I'm currently experiencing high demand. Please wait a moment and try again."
                return f"I'm having trouble connecting right now (HTTP {e.response.status_code}). Please try again."
                
            except httpx.RequestError as e:
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"Request error. Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries})...")
                    await asyncio.sleep(wait_time)
                    continue
                print(f"Request error: {e}")
                return "I'm having trouble connecting to the AI service. Please check your connection and try again."
                
        # If we exhausted all retries
        return "I'm having trouble connecting right now. Please try again in a moment."
    
    async def generate_stream(
        self,
        user_message: str,
        context: ConversationContext = ConversationContext.BOT,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        images: Optional[List[str]] = None
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response from the LLM."""
        
        # Check rate limit
        if not await rate_limiter.wait_and_acquire():
            yield "I'm currently experiencing high demand. Please try again in a moment."
            return
        
        # If no API key, yield mock response
        if not self.api_key:
            mock = self._get_mock_response(user_message, context)
            for word in mock.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return
        
        messages = self._build_messages(user_message, context, conversation_history, images)
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json={
                        "model": self.model,
                        "messages": messages,
                        "max_tokens": settings.llm_max_tokens,
                        "temperature": settings.llm_temperature,
                        "stream": True,
                    }
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                import json
                                chunk = json.loads(data)
                                if chunk["choices"][0]["delta"].get("content"):
                                    yield chunk["choices"][0]["delta"]["content"]
                            except:
                                continue
                                
        except httpx.HTTPStatusError as e:
            error_detail = ""
            try:
                error_detail = e.response.json()
            except:
                error_detail = e.response.text
            print(f"HTTP error {e.response.status_code} in stream: {error_detail}")
            print(f"Request URL: {self.base_url}/chat/completions")
            print(f"Model: {self.model}")
            if e.response.status_code == 429:
                yield "I'm currently experiencing high demand. Please wait a moment and try again."
            else:
                yield f"I'm having trouble connecting right now (HTTP {e.response.status_code}). Please try again."
        except httpx.RequestError as e:
            print(f"Request error in stream: {e}")
            yield "I'm having trouble connecting to the AI service. Please check your connection and try again."
        except Exception as e:
            print(f"Error in stream: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            yield "Something went wrong. Please try again."
    
    def _get_mock_response(self, user_message: str, context: ConversationContext) -> str:
        """Get a mock response for development/testing."""
        message_lower = user_message.lower()
        
        if any(word in message_lower for word in ["wifi", "internet", "password"]):
            return "The WiFi network is 'HotelGuest' and the password is on the card in your room. Let me know if you have any trouble connecting!"
        
        elif any(word in message_lower for word in ["breakfast", "restaurant", "food", "eat"]):
            return "Our restaurant is open from 6:30 AM to 10:30 PM. Breakfast is served until 10:30 AM in the main dining room on the ground floor."
        
        elif any(word in message_lower for word in ["checkout", "check out", "leaving"]):
            return "Checkout is at 11 AM. Would you like a late checkout? I can check availability for you."
        
        elif any(word in message_lower for word in ["pool", "gym", "fitness", "spa"]):
            return "The pool and fitness center are on the 3rd floor, open 6 AM - 10 PM. Towels are provided at the entrance."
        
        elif any(word in message_lower for word in ["help", "hi", "hello", "hey"]):
            return "Hello! I'm Mage, your hotel assistant. I can help with room service, amenities, local recommendations, or any questions about your stay. What can I do for you?"
        
        elif any(word in message_lower for word in ["room service", "order"]):
            if context == ConversationContext.AI_AGENT:
                return "I'd be happy to help with room service! Our menu includes breakfast items, sandwiches, salads, and dinner entrees. What would you like to order?"
            return "For room service, please dial 0 on your room phone, or I can connect you with the front desk to place an order."
        
        elif any(word in message_lower for word in ["problem", "issue", "broken", "not working"]):
            return "I'm sorry to hear that. Can you describe the issue? I'll make sure the right team is notified to help you."
        
        else:
            responses = {
                ConversationContext.BOT: "I'm here to help! Could you tell me more about what you need? I can assist with hotel amenities, local recommendations, or connect you with our front desk.",
                ConversationContext.AI_AGENT: "I'd be happy to help with that. Could you provide more details so I can assist you better?",
                ConversationContext.FRONT_DESK_AGENT: "Thank you for reaching out! How can I assist you today?"
            }
            return responses.get(context, responses[ConversationContext.BOT])


# Global LLM service instance
llm_service = LLMService()
