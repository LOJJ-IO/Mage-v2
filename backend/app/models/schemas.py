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
    STAFF = "staff"


class MessageKind(str, Enum):
    """Assistant message presentation kind."""
    TEXT = "text"
    FAQ = "faq"


class TicketStatus(str, Enum):
    """Ticket status types."""
    PENDING = "pending"
    ACTIVE = "active"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


class ActionType(str, Enum):
    """Chatbot-flagged action types for staff inbox."""
    MAINTENANCE = "MAINTENANCE"
    ROOM_SERVICE = "ROOM_SERVICE"
    HOUSEKEEPING = "HOUSEKEEPING"
    CONTACT_FRONT_DESK = "CONTACT_FRONT_DESK"
    HANDOFF = "HANDOFF"


class StaffActionStatus(str, Enum):
    """Staff inbox item status."""
    PENDING = "pending"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class StaffActionEscalationType(str, Enum):
    """How a staff inbox item was created or updated."""
    NORMAL = "normal"
    ESCALATED = "escalated"
    STATUS_CHECK = "status_check"
    REPETITION = "repetition"
    CONTACT = "contact"


# Request models
class ChatMessageRequest(BaseModel):
    """Request model for sending a chat message."""
    content: str = Field(..., min_length=1, max_length=4000)
    conversation_context: ConversationContext = ConversationContext.BOT
    images: Optional[List[str]] = None
    guest_id: Optional[str] = None
    task_continuation: bool = False


class FaqFeedbackRequest(BaseModel):
    """Guest feedback on an FAQ panel."""
    guest_id: str
    helpful: bool
    trigger_content: str = Field(..., min_length=1, max_length=4000)
    faq_titles: Optional[List[str]] = None
    faq_message_id: Optional[str] = None


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


class UpdateStaffActionRequest(BaseModel):
    """Request model for updating a staff action."""
    status: StaffActionStatus


class StaffMessageRequest(BaseModel):
    """Staff reply injected into guest conversation."""
    content: str = Field(..., min_length=1, max_length=4000)


# Response models
class FaqItem(BaseModel):
    """Single FAQ accordion entry."""
    id: str
    title: str
    body: str


class Message(BaseModel):
    """Message response model."""
    id: str
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    images: Optional[List[str]] = None
    require_contact_confirmation: Optional[bool] = None
    kind: MessageKind = MessageKind.TEXT
    intro: Optional[str] = None
    faq_items: Optional[List[FaqItem]] = None
    trigger_content: Optional[str] = None
    faq_resolved: Optional[bool] = None


class ChatMessageResponse(BaseModel):
    """Chat response model with one or more assistant messages."""
    messages: List[Message]
    continue_task: bool = False
    task_message: Optional[str] = None


class ConversationHistoryResponse(BaseModel):
    """Stored conversation for a guest."""
    messages: List[Message]


class KnowledgeMode(str, Enum):
    """How a property loads guest-facing knowledge."""
    DEMO_FILE = "demo_file"
    PUBLISHED_SNAPSHOT = "published_snapshot"


class PropertyProfile(str, Enum):
    """Hotel service profile."""
    LIMITED_SERVICE = "limited_service"
    FULL_SERVICE = "full_service"


class Property(BaseModel):
    """Multi-tenant property hub."""
    id: str
    name: str
    slug: str
    timezone: str = "America/Edmonton"
    profile: PropertyProfile = PropertyProfile.FULL_SERVICE
    pms_type: str = "mock"
    knowledge_mode: KnowledgeMode = KnowledgeMode.DEMO_FILE
    published_snapshot_id: Optional[str] = None


class GuestAccountTier(str, Enum):
    """Metrics inclusion tier for dashboard / demo period."""
    DEV_INTERNAL = "dev_internal"
    PILOT_TESTER = "pilot_tester"


class TranscriptFlagCategory(str, Enum):
    """Demo walk-through bookmark categories for Event Log curation."""
    CLEAN_ROUTINE = "clean_routine"
    EDGE_CASE_GRACEFUL = "edge_case_graceful"
    GRACEFUL_ESCALATION = "graceful_escalation"
    MULTI_TURN_SUCCESS = "multi_turn_success"


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
    property_id: Optional[str] = None
    pms_booking_id: Optional[str] = None
    pms_guest_id: Optional[str] = None
    happiness_score: Optional[int] = None
    account_tier: GuestAccountTier = GuestAccountTier.PILOT_TESTER


class MagicLinkRequest(BaseModel):
    """Internal/webhook: send magic link for a booking."""
    property_id: str
    booking_id: str
    email: Optional[str] = None


class GuestEmailSignInRequest(BaseModel):
    """Guest sign-in by email lookup (dev/demo)."""
    email: str
    property_id: Optional[str] = None


class GuestRegisterRequest(BaseModel):
    """Self-serve guest registration — creates email verification."""
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    booking_id: Optional[str] = Field(None, max_length=100)
    room_number: Optional[str] = Field(None, max_length=20)
    check_in: datetime
    check_out: datetime
    property_id: Optional[str] = None


class GuestVerifyEmailRequest(BaseModel):
    """Consume an email-verification token."""
    token: str = Field(..., min_length=8)


class GuestSignInByBookingRequest(BaseModel):
    """Returning guest: name + booking_id → session cookie."""
    name: str = Field(..., min_length=1, max_length=200)
    booking_id: str = Field(..., min_length=1, max_length=100)
    property_id: Optional[str] = None


class PropertyFactPatch(BaseModel):
    """Staff edit of a single knowledge slot."""
    value: Optional[object] = None
    status: Optional[str] = None


class CrawlJobRequest(BaseModel):
    """Start a discover/extract crawl for a property."""
    seed_url: Optional[str] = None
    seed_urls: Optional[list[str]] = None
    property_id: Optional[str] = None


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


class StaffAction(BaseModel):
    """Staff inbox item logged from chatbot actions."""
    id: str
    guest_id: str
    action_type: ActionType
    summary: str
    source_message: str
    status: StaffActionStatus = StaffActionStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    guest_name: Optional[str] = None
    room_number: Optional[str] = None
    escalation_type: StaffActionEscalationType = StaffActionEscalationType.NORMAL
    allow_staff_jump_in: bool = True
    guest_conversation_thread_id: Optional[str] = None


class StaffActionConversationResponse(BaseModel):
    """Guest profile and conversation thread for a staff action."""
    action: StaffAction
    guest: GuestProfile
    messages: List[Message]


class StaffInboxThread(BaseModel):
    """Guest conversation visible in staff inbox (independent of task notifications)."""
    guest_id: str
    guest_name: Optional[str] = None
    room_number: Optional[str] = None
    last_message_preview: str = ""
    last_message_at: datetime = Field(default_factory=datetime.utcnow)
    message_count: int = 0
    linked_action_id: Optional[str] = None
    live_chat_pending: bool = False


class StaffGuestConversationResponse(BaseModel):
    """Guest profile and full conversation for staff inbox."""
    guest: GuestProfile
    messages: List[Message]
    linked_action_id: Optional[str] = None


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
    database_type: str = "mock"
    database_ok: bool = True
    database_error: Optional[str] = None


# --- Onboarding models ---

class StaffRole(str, Enum):
    MANAGER = "manager"
    FRONT_DESK = "front_desk"
    MAINTENANCE = "maintenance"
    HOUSEKEEPING = "housekeeping"
    ROOM_SERVICE = "room_service"


class StaffMemberStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class StaffMember(BaseModel):
    id: str
    property_id: str
    staff_code: str
    display_name: str
    email: Optional[str] = None
    requested_role: StaffRole
    approved_role: Optional[StaffRole] = None
    status: StaffMemberStatus = StaffMemberStatus.PENDING
    access_key_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None


class EmailVerification(BaseModel):
    id: str
    email: str
    property_id: str
    booking_id: str
    guest_data: dict = Field(default_factory=dict)
    token_hash: str
    expires_at: datetime
    verified_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
