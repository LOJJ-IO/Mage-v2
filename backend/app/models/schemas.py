from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional, List


class ConversationContext(str, Enum):
    """Conversation context types."""
    BOT = "BOT"
    FRONT_DESK_AGENT = "FRONT_DESK_AGENT"


class MessageRole(str, Enum):
    """Message roles."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class TicketStatus(str, Enum):
    """Ticket status types."""
    PENDING = "pending"
    ACTIVE = "active"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


# Request models
class ChatMessageRequest(BaseModel):
    """Request model for sending a chat message."""
    content: str = Field(..., min_length=1, max_length=4000)
    conversation_context: ConversationContext = ConversationContext.BOT
    images: Optional[List[str]] = None
    guest_id: Optional[str] = None


class CreateTicketRequest(BaseModel):
    """Request model for creating a ticket."""
    guest_id: str
    issue: str = Field(..., min_length=1, max_length=1000)


class UpdateTicketRequest(BaseModel):
    """Request model for updating a ticket."""
    status: Optional[TicketStatus] = None
    issue: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_type: Optional[ConversationContext] = None


# Response models
class Message(BaseModel):
    """Message response model."""
    id: str
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    images: Optional[List[str]] = None
    require_contact_confirmation: Optional[bool] = None


class ChatMessageResponse(BaseModel):
    """Chat response model with one or more assistant messages."""
    messages: List[Message]


class GuestProfile(BaseModel):
    """Guest profile model."""
    id: str
    name: str
    room_number: str
    check_in: datetime
    check_out: datetime
    booking_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    membership_tier: Optional[str] = None


class Ticket(BaseModel):
    """Ticket model."""
    id: str
    guest_id: str
    issue: str
    status: TicketStatus = TicketStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    assigned_to: Optional[str] = None
    assigned_type: Optional[ConversationContext] = None


class AgentAvailability(BaseModel):
    """Agent availability response."""
    human_agent_available: bool = False
    ai_agent_available: bool = True


class TranscriptionResponse(BaseModel):
    """Transcription response model."""
    text: str
    confidence: float = 1.0


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
