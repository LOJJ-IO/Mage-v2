from datetime import datetime, timedelta
from typing import Dict, Optional, List, Protocol
from pydantic import ValidationError
from app.models.schemas import (
    GuestProfile,
    Ticket,
    TicketStatus,
    ConversationContext,
    StaffAction,
    StaffActionStatus,
    StaffActionEscalationType,
    ActionType,
    Property,
)
from app.services.property_db_mock import PropertyStoreMixin
from app.services.property_db_supabase import PropertyStoreSupabase
from app.core.config import get_settings
from functools import lru_cache
import uuid
import logging
import hashlib
from collections import defaultdict

logger = logging.getLogger(__name__)


class DatabaseProtocol(Protocol):
    """Protocol defining the database interface."""
    
    # Guest operations
    def get_guest(self, guest_id: str) -> Optional[GuestProfile]:
        """Get guest by ID."""
        ...
    
    def get_guest_by_booking(self, booking_id: str, property_id: Optional[str] = None) -> Optional[GuestProfile]:
        """Get guest by booking ID."""
        ...

    def list_guests(self, property_id: Optional[str] = None) -> List[GuestProfile]:
        """List guests, optionally filtered by property."""
        ...

    def upsert_guest(self, guest: GuestProfile) -> GuestProfile:
        """Create or update guest (property-scoped)."""
        ...

    # Property operations
    def get_property(self, property_id: str) -> Optional[Property]:
        ...

    def upsert_property(self, prop: Property) -> Property:
        ...

    def set_property_published_snapshot(self, property_id: str, snapshot_id: str) -> None:
        ...

    def update_property_knowledge_mode(self, property_id: str, mode: str) -> None:
        ...

    # Auth tokens & sessions
    def create_auth_token(
        self,
        token_hash: str,
        property_id: str,
        booking_id: str,
        expires_at: datetime,
    ) -> None:
        ...

    def consume_auth_token(self, token_hash: str) -> Optional[dict]:
        ...

    def register_guest_session(self, guest_id: str, property_id: str) -> int:
        ...

    def is_guest_session_revoked(
        self, guest_id: str, property_id: str, session_version: int
    ) -> bool:
        ...

    def revoke_guest_sessions(self, guest_id: str, property_id: str) -> int:
        ...

    # Knowledge facts & snapshots
    def list_property_facts(self, property_id: str) -> List[dict]:
        ...

    def upsert_property_fact(
        self,
        property_id: str,
        slot_key: str,
        value: object,
        status: str = "filled",
        *,
        confidence: Optional[float] = None,
        source_url: Optional[str] = None,
        source_snippet: Optional[str] = None,
        extraction_method: Optional[str] = None,
        updated_by: Optional[str] = None,
    ) -> dict:
        ...

    def create_knowledge_snapshot(
        self,
        snapshot_id: str,
        property_id: str,
        schema_version: str,
        markdown: str,
        tree_json: list,
        faq_json: list,
        facts_json: dict,
        published_by: str,
    ) -> dict:
        ...

    def get_knowledge_snapshot(self, snapshot_id: str) -> Optional[dict]:
        ...

    # Crawl jobs
    def create_crawl_job(
        self,
        property_id: str,
        seed_url: str,
        *,
        seed_urls: list[str] | None = None,
    ) -> dict:
        ...

    def get_crawl_job(self, job_id: str) -> Optional[dict]:
        ...

    def update_crawl_job(self, job_id: str, **fields) -> None:
        ...

    def create_crawl_page(self, job_id: str, url: str) -> str:
        ...

    def update_crawl_page(self, page_id: str, **fields) -> None:
        ...

    def create_guest(self, guest: GuestProfile) -> GuestProfile:
        """Create a new guest."""
        ...
    
    # Ticket operations
    def get_ticket(self, ticket_id: str) -> Optional[Ticket]:
        """Get ticket by ID."""
        ...
    
    def get_tickets_by_guest(self, guest_id: str) -> List[Ticket]:
        """Get all tickets for a guest."""
        ...
    
    def create_ticket(self, guest_id: str, issue: str) -> Ticket:
        """Create a new ticket."""
        ...
    
    def update_ticket(
        self,
        ticket_id: str,
        status: Optional[TicketStatus] = None,
        issue: Optional[str] = None,
        assigned_to: Optional[str] = None,
        assigned_type: Optional[ConversationContext] = None
    ) -> Optional[Ticket]:
        """Update a ticket."""
        ...
    
    def cancel_ticket(self, ticket_id: str) -> bool:
        """Cancel a ticket."""
        ...
    
    # Agent availability
    def get_agent_availability(self) -> Dict[str, bool]:
        """Get current agent availability."""
        ...
    
    def set_human_agent_available(self, available: bool):
        """Set human agent availability."""
        ...
    
    # Conversation history
    def get_conversation(self, guest_id: str) -> List[Dict[str, str]]:
        """Get conversation history for a guest."""
        ...
    
    def add_message_to_conversation(
        self,
        guest_id: str,
        role: str,
        content: str
    ):
        """Add a message to conversation history."""
        ...
    
    def clear_conversation(self, guest_id: str):
        """Clear conversation history for a guest."""
        ...

    def list_staff_inbox_threads(self, limit: int = 100) -> List[Dict[str, object]]:
        """Guests with conversation history for staff inbox (newest activity first)."""
        ...

    # Staff action inbox
    def append_pending_staff_action(
        self,
        guest_id: str,
        action_type: ActionType,
        append_note: str,
    ) -> Optional[StaffAction]:
        """Append detail to the newest pending action of the same type for this guest."""
        ...

    def log_staff_action(
        self,
        guest_id: str,
        action_type: ActionType,
        summary: str,
        source_message: str,
        *,
        escalation_type: StaffActionEscalationType = StaffActionEscalationType.NORMAL,
        allow_staff_jump_in: bool = True,
        guest_conversation_thread_id: Optional[str] = None,
    ) -> StaffAction:
        """Log a chatbot-flagged action for staff."""
        ...

    def list_pending_actions_for_guest_service(
        self,
        guest_id: str,
        action_type: ActionType,
        max_age_minutes: int = 60,
    ) -> List[StaffAction]:
        """Pending actions for guest matching service type within time window."""
        ...

    def list_staff_actions(
        self,
        limit: int = 50,
        status: Optional[StaffActionStatus] = None,
    ) -> List[StaffAction]:
        """List staff actions, newest first."""
        ...

    def get_staff_action(self, action_id: str) -> Optional[StaffAction]:
        """Get a staff action by ID."""
        ...

    def update_staff_action_status(
        self,
        action_id: str,
        status: StaffActionStatus,
    ) -> Optional[StaffAction]:
        """Update staff action status."""
        ...

    def update_staff_action_summary(
        self,
        action_id: str,
        summary: str,
    ) -> Optional[StaffAction]:
        """Update staff action summary text."""
        ...

    def update_staff_action_escalation(
        self,
        action_id: str,
        escalation_type: StaffActionEscalationType,
        summary: Optional[str] = None,
    ) -> Optional[StaffAction]:
        """Mark action escalated and optionally update summary."""
        ...

    def list_unanswered_guest_questions(
        self,
        property_id: str,
        min_occurrences: int = 2,
        limit: int = 10,
    ) -> List[dict]:
        """Guest questions that triggered CONTACT_FRONT_DESK with no knowledge match."""
        ...


def _staff_action_from_row(row: dict) -> StaffAction:
    """Build StaffAction from DB/mock row with backward-compatible defaults."""
    data = dict(row)
    if "action_type" in data and isinstance(data["action_type"], str):
        data["action_type"] = ActionType(data["action_type"])
    if "status" in data and isinstance(data["status"], str):
        data["status"] = StaffActionStatus(data["status"])
    esc = data.get("escalation_type") or "normal"
    if isinstance(esc, str):
        data["escalation_type"] = StaffActionEscalationType(esc)
    if data.get("created_at") and isinstance(data["created_at"], str):
        data["created_at"] = datetime.fromisoformat(
            data["created_at"].replace("Z", "+00:00")
        )
    if not data.get("guest_conversation_thread_id"):
        data["guest_conversation_thread_id"] = data.get("guest_id")
    if "allow_staff_jump_in" not in data:
        data["allow_staff_jump_in"] = True
    return StaffAction(**{k: v for k, v in data.items() if k in StaffAction.model_fields})


def _aggregate_unanswered_guest_questions(
    actions: List[StaffAction],
    guest_property: dict[str, Optional[str]],
    property_id: str,
    *,
    min_occurrences: int = 2,
    limit: int = 10,
) -> List[dict]:
    """Group CONTACT_FRONT_DESK knowledge-gap escalations by guest question."""
    groups: dict[str, list[StaffAction]] = defaultdict(list)
    for action in actions:
        if action.action_type != ActionType.CONTACT_FRONT_DESK:
            continue
        if action.escalation_type != StaffActionEscalationType.CONTACT:
            continue
        guest_pid = guest_property.get(action.guest_id)
        if guest_pid and guest_pid != property_id:
            continue
        if not guest_pid:
            settings = get_settings()
            default_pid = settings.property_id or "grand-horizon"
            if property_id != default_pid:
                continue
        question = (action.source_message or "").strip()
        if not question:
            continue
        groups[question.lower()].append(action)

    gaps: List[dict] = []
    for normalized, items in groups.items():
        if len(items) < min_occurrences:
            continue
        question = items[0].source_message.strip()
        gap_id = hashlib.md5(normalized.encode()).hexdigest()[:12]
        gaps.append({"id": gap_id, "question": question, "count": len(items)})

    gaps.sort(key=lambda g: g["count"], reverse=True)
    return gaps[:limit]


class MockDatabase(PropertyStoreMixin):
    """Mock database for development/testing."""
    
    def __init__(self):
        settings = get_settings()
        pid = settings.property_id or "grand-horizon"
        # Initialize with mock data
        self.guests: Dict[str, GuestProfile] = {
            "guest-001": GuestProfile(
                id="guest-001",
                name="Alex Johnson",
                room_number="412",
                check_in=datetime.now() - timedelta(days=1),
                check_out=datetime.now() + timedelta(days=4),
                booking_id="BK-2026-0412",
                email="alex.johnson@email.com",
                phone="+1 555-0123",
                membership_tier="Platinum",
                property_id=pid,
            ),
            "guest-002": GuestProfile(
                id="guest-002",
                name="Sarah Williams",
                room_number="305",
                check_in=datetime.now() - timedelta(days=2),
                check_out=datetime.now() + timedelta(days=1),
                booking_id="BK-2026-0305",
                email="sarah.w@email.com",
                phone="+1 555-0456",
                membership_tier="Gold",
                property_id=pid,
            )
        }
        
        self.tickets: Dict[str, Ticket] = {}
        self.staff_actions: Dict[str, StaffAction] = {}

        # Simulated agent availability
        self.human_agent_available = False
        self.ai_agent_available = True
        
        # Conversation histories per guest
        self.conversations: Dict[str, List[Dict[str, str]]] = {}
        self._init_property_stores()
    
    # Guest operations
    def get_guest(self, guest_id: str) -> Optional[GuestProfile]:
        """Get guest by ID."""
        return self.guests.get(guest_id)
    
    def create_guest(self, guest: GuestProfile) -> GuestProfile:
        """Create a new guest."""
        self.guests[guest.id] = guest
        return guest
    
    # Ticket operations
    def get_ticket(self, ticket_id: str) -> Optional[Ticket]:
        """Get ticket by ID."""
        return self.tickets.get(ticket_id)
    
    def get_tickets_by_guest(self, guest_id: str) -> List[Ticket]:
        """Get all tickets for a guest."""
        return [t for t in self.tickets.values() if t.guest_id == guest_id]
    
    def create_ticket(self, guest_id: str, issue: str) -> Ticket:
        """Create a new ticket."""
        ticket_id = f"TKT-{uuid.uuid4().hex[:8].upper()}"
        ticket = Ticket(
            id=ticket_id,
            guest_id=guest_id,
            issue=issue,
            status=TicketStatus.PENDING,
            created_at=datetime.utcnow()
        )
        self.tickets[ticket_id] = ticket
        return ticket
    
    def update_ticket(
        self,
        ticket_id: str,
        status: Optional[TicketStatus] = None,
        issue: Optional[str] = None,
        assigned_to: Optional[str] = None,
        assigned_type: Optional[ConversationContext] = None
    ) -> Optional[Ticket]:
        """Update a ticket."""
        ticket = self.tickets.get(ticket_id)
        if not ticket:
            return None
        
        if status:
            ticket.status = status
            if status == TicketStatus.RESOLVED:
                ticket.resolved_at = datetime.utcnow()
        if issue:
            ticket.issue = issue
        if assigned_to:
            ticket.assigned_to = assigned_to
        if assigned_type:
            ticket.assigned_type = assigned_type
        
        return ticket
    
    def cancel_ticket(self, ticket_id: str) -> bool:
        """Cancel a ticket."""
        ticket = self.tickets.get(ticket_id)
        if ticket:
            ticket.status = TicketStatus.CANCELLED
            return True
        return False
    
    # Agent availability
    def get_agent_availability(self) -> Dict[str, bool]:
        """Get current agent availability."""
        return {
            "human_agent_available": self.human_agent_available,
            "ai_agent_available": self.ai_agent_available
        }
    
    def set_human_agent_available(self, available: bool):
        """Set human agent availability."""
        self.human_agent_available = available
    
    # Conversation history
    def get_conversation(self, guest_id: str) -> List[Dict[str, str]]:
        """Get conversation history for a guest."""
        return self.conversations.get(guest_id, [])
    
    def add_message_to_conversation(
        self,
        guest_id: str,
        role: str,
        content: str
    ):
        """Add a message to conversation history."""
        if guest_id not in self.conversations:
            self.conversations[guest_id] = []
        
        self.conversations[guest_id].append({
            "role": role,
            "content": content,
            "created_at": datetime.utcnow().isoformat(),
        })
        
        # Keep last 50 messages
        if len(self.conversations[guest_id]) > 50:
            self.conversations[guest_id] = self.conversations[guest_id][-50:]
    
    def clear_conversation(self, guest_id: str):
        """Clear conversation history for a guest."""
        self.conversations[guest_id] = []

    def list_staff_inbox_threads(self, limit: int = 100) -> List[Dict[str, object]]:
        """Guests with conversation history for staff inbox (newest activity first)."""
        from app.services.conversation_helpers import is_internal_conversation_message

        guest_ids = set(self.conversations.keys()) | {a.guest_id for a in self.staff_actions.values()}
        threads: List[Dict[str, object]] = []

        for guest_id in guest_ids:
            rows = self.conversations.get(guest_id, [])
            visible = [
                row
                for row in rows
                if not is_internal_conversation_message(row.get("content", ""))
            ]
            if not visible and guest_id not in {a.guest_id for a in self.staff_actions.values()}:
                continue

            last_row = visible[-1] if visible else None
            if last_row:
                created = last_row.get("created_at")
                try:
                    last_at = (
                        datetime.fromisoformat(str(created).replace("Z", "+00:00")).replace(tzinfo=None)
                        if created
                        else datetime.utcnow()
                    )
                except ValueError:
                    last_at = datetime.utcnow()
                preview = (last_row.get("content") or "")[:120]
            else:
                guest_actions = [a for a in self.staff_actions.values() if a.guest_id == guest_id]
                if not guest_actions:
                    continue
                guest_actions.sort(key=lambda a: a.created_at, reverse=True)
                last_at = guest_actions[0].created_at
                preview = guest_actions[0].summary

            guest = self.guests.get(guest_id)
            threads.append(
                {
                    "guest_id": guest_id,
                    "guest_name": guest.name if guest else None,
                    "room_number": guest.room_number if guest else None,
                    "last_message_preview": preview,
                    "last_message_at": last_at,
                    "message_count": len(visible),
                }
            )

        threads.sort(key=lambda row: row["last_message_at"], reverse=True)
        return threads[:limit]

    def append_pending_staff_action(
        self,
        guest_id: str,
        action_type: ActionType,
        append_note: str,
    ) -> Optional[StaffAction]:
        note = (append_note or "").strip()
        if not note:
            return None
        cutoff = datetime.utcnow() - timedelta(minutes=45)
        pending = [
            a
            for a in self.staff_actions.values()
            if a.guest_id == guest_id
            and a.action_type == action_type
            and a.status == StaffActionStatus.PENDING
            and a.created_at >= cutoff
        ]
        if not pending:
            return None
        pending.sort(key=lambda a: a.created_at, reverse=True)
        action = pending[0]
        action.summary = f"{action.summary.rstrip('.')}; {note}"[:500]
        return action

    def log_staff_action(
        self,
        guest_id: str,
        action_type: ActionType,
        summary: str,
        source_message: str,
        *,
        escalation_type: StaffActionEscalationType = StaffActionEscalationType.NORMAL,
        allow_staff_jump_in: bool = True,
        guest_conversation_thread_id: Optional[str] = None,
    ) -> StaffAction:
        action_id = f"ACT-{uuid.uuid4().hex[:8].upper()}"
        guest = self.get_guest(guest_id)
        action = StaffAction(
            id=action_id,
            guest_id=guest_id,
            action_type=action_type,
            summary=summary,
            source_message=source_message,
            status=StaffActionStatus.PENDING,
            created_at=datetime.utcnow(),
            guest_name=guest.name if guest else None,
            room_number=guest.room_number if guest else None,
            escalation_type=escalation_type,
            allow_staff_jump_in=allow_staff_jump_in,
            guest_conversation_thread_id=guest_conversation_thread_id or guest_id,
        )
        self.staff_actions[action_id] = action
        return action

    def list_pending_actions_for_guest_service(
        self,
        guest_id: str,
        action_type: ActionType,
        max_age_minutes: int = 60,
    ) -> List[StaffAction]:
        cutoff = datetime.utcnow() - timedelta(minutes=max_age_minutes)
        out = [
            a
            for a in self.staff_actions.values()
            if a.guest_id == guest_id
            and a.action_type == action_type
            and a.status == StaffActionStatus.PENDING
            and a.created_at >= cutoff
        ]
        out.sort(key=lambda a: a.created_at, reverse=True)
        return out

    def list_staff_actions(
        self,
        limit: int = 50,
        status: Optional[StaffActionStatus] = None,
    ) -> List[StaffAction]:
        actions = list(self.staff_actions.values())
        if status is not None:
            actions = [a for a in actions if a.status == status]
        actions.sort(key=lambda a: a.created_at, reverse=True)
        return actions[:limit]

    def get_staff_action(self, action_id: str) -> Optional[StaffAction]:
        return self.staff_actions.get(action_id)

    def update_staff_action_status(
        self,
        action_id: str,
        status: StaffActionStatus,
    ) -> Optional[StaffAction]:
        action = self.staff_actions.get(action_id)
        if not action:
            return None
        action.status = status
        return action

    def update_staff_action_summary(
        self,
        action_id: str,
        summary: str,
    ) -> Optional[StaffAction]:
        action = self.staff_actions.get(action_id)
        if not action:
            return None
        action.summary = (summary or "")[:500]
        return action

    def update_staff_action_escalation(
        self,
        action_id: str,
        escalation_type: StaffActionEscalationType,
        summary: Optional[str] = None,
    ) -> Optional[StaffAction]:
        action = self.staff_actions.get(action_id)
        if not action:
            return None
        action.escalation_type = escalation_type
        if summary is not None:
            action.summary = (summary or "")[:500]
        return action

    def list_unanswered_guest_questions(
        self,
        property_id: str,
        min_occurrences: int = 2,
        limit: int = 10,
    ) -> List[dict]:
        guest_property = {
            gid: (guest.property_id if guest else None)
            for gid, guest in self.guests.items()
        }
        actions = list(self.staff_actions.values())
        return _aggregate_unanswered_guest_questions(
            actions,
            guest_property,
            property_id,
            min_occurrences=min_occurrences,
            limit=limit,
        )


class SupabaseDatabase(PropertyStoreSupabase):
    """Supabase database implementation."""
    
    def __init__(self):
        """Initialize Supabase client."""
        settings = get_settings()
        
        if not settings.supabase_url or not settings.supabase_key:
            raise ValueError("Supabase URL and key must be configured")
        
        try:
            from supabase import create_client, Client
            self.client: Client = create_client(settings.supabase_url, settings.supabase_key)
            logger.info("Supabase client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            raise
    
    # Guest operations
    def get_guest(self, guest_id: str) -> Optional[GuestProfile]:
        """Get guest by ID."""
        try:
            response = self.client.table("guests").select("*").eq("id", guest_id).execute()
            if response.data and len(response.data) > 0:
                return GuestProfile(**response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error getting guest {guest_id}: {e}")
            return None
    
    def create_guest(self, guest: GuestProfile) -> GuestProfile:
        """Create a new guest."""
        try:
            guest_dict = guest.model_dump()
            response = self.client.table("guests").insert(guest_dict).execute()
            if response.data and len(response.data) > 0:
                return GuestProfile(**response.data[0])
            return guest
        except Exception as e:
            logger.error(f"Error creating guest: {e}")
            raise
    
    # Ticket operations
    def get_ticket(self, ticket_id: str) -> Optional[Ticket]:
        """Get ticket by ID."""
        try:
            response = self.client.table("tickets").select("*").eq("id", ticket_id).execute()
            if response.data and len(response.data) > 0:
                return Ticket(**response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error getting ticket {ticket_id}: {e}")
            return None
    
    def get_tickets_by_guest(self, guest_id: str) -> List[Ticket]:
        """Get all tickets for a guest."""
        try:
            response = self.client.table("tickets").select("*").eq("guest_id", guest_id).execute()
            if response.data:
                return [Ticket(**ticket) for ticket in response.data]
            return []
        except Exception as e:
            logger.error(f"Error getting tickets for guest {guest_id}: {e}")
            return []
    
    def create_ticket(self, guest_id: str, issue: str) -> Ticket:
        """Create a new ticket."""
        try:
            ticket_id = f"TKT-{uuid.uuid4().hex[:8].upper()}"
            ticket_dict = {
                "id": ticket_id,
                "guest_id": guest_id,
                "issue": issue,
                "status": TicketStatus.PENDING.value,
                "created_at": datetime.utcnow().isoformat()
            }
            response = self.client.table("tickets").insert(ticket_dict).execute()
            if response.data and len(response.data) > 0:
                return Ticket(**response.data[0])
            # Fallback to creating Ticket object if response doesn't work
            return Ticket(
                id=ticket_id,
                guest_id=guest_id,
                issue=issue,
                status=TicketStatus.PENDING,
                created_at=datetime.utcnow()
            )
        except Exception as e:
            logger.error(f"Error creating ticket: {e}")
            raise
    
    def update_ticket(
        self,
        ticket_id: str,
        status: Optional[TicketStatus] = None,
        issue: Optional[str] = None,
        assigned_to: Optional[str] = None,
        assigned_type: Optional[ConversationContext] = None
    ) -> Optional[Ticket]:
        """Update a ticket."""
        try:
            update_dict = {}
            if status:
                update_dict["status"] = status.value
                if status == TicketStatus.RESOLVED:
                    update_dict["resolved_at"] = datetime.utcnow().isoformat()
            if issue:
                update_dict["issue"] = issue
            if assigned_to:
                update_dict["assigned_to"] = assigned_to
            if assigned_type:
                update_dict["assigned_type"] = assigned_type.value
            
            if not update_dict:
                # No updates, just return existing ticket
                return self.get_ticket(ticket_id)
            
            response = self.client.table("tickets").update(update_dict).eq("id", ticket_id).execute()
            if response.data and len(response.data) > 0:
                return Ticket(**response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error updating ticket {ticket_id}: {e}")
            return None
    
    def cancel_ticket(self, ticket_id: str) -> bool:
        """Cancel a ticket."""
        try:
            update_dict = {"status": TicketStatus.CANCELLED.value}
            response = self.client.table("tickets").update(update_dict).eq("id", ticket_id).execute()
            return response.data is not None and len(response.data) > 0
        except Exception as e:
            logger.error(f"Error cancelling ticket {ticket_id}: {e}")
            return False
    
    # Agent availability
    def get_agent_availability(self) -> Dict[str, bool]:
        """Get current agent availability."""
        try:
            response = self.client.table("agent_availability").select("*").limit(1).execute()
            if response.data and len(response.data) > 0:
                data = response.data[0]
                return {
                    "human_agent_available": data.get("human_agent_available", False),
                    "ai_agent_available": data.get("ai_agent_available", True)
                }
            # Default values if no record exists
            return {
                "human_agent_available": False,
                "ai_agent_available": True
            }
        except Exception as e:
            logger.error(f"Error getting agent availability: {e}")
            # Return default values on error
            return {
                "human_agent_available": False,
                "ai_agent_available": True
            }
    
    def set_human_agent_available(self, available: bool):
        """Set human agent availability."""
        try:
            # Try to update existing record, or insert if doesn't exist
            response = self.client.table("agent_availability").select("*").limit(1).execute()
            if response.data and len(response.data) > 0:
                # Update existing record
                self.client.table("agent_availability").update({
                    "human_agent_available": available
                }).eq("id", response.data[0].get("id")).execute()
            else:
                # Insert new record
                self.client.table("agent_availability").insert({
                    "human_agent_available": available,
                    "ai_agent_available": True
                }).execute()
        except Exception as e:
            logger.error(f"Error setting human agent availability: {e}")
            raise
    
    # Conversation history
    def get_conversation(self, guest_id: str) -> List[Dict[str, str]]:
        """Get conversation history for a guest."""
        try:
            response = self.client.table("conversations").select("*").eq("guest_id", guest_id).order("created_at").limit(50).execute()
            if response.data:
                return [
                    {"role": msg.get("role"), "content": msg.get("content"), "created_at": msg.get("created_at")}
                    for msg in response.data
                ]
            return []
        except Exception as e:
            logger.error(f"Error getting conversation for guest {guest_id}: {e}")
            return []
    
    def add_message_to_conversation(
        self,
        guest_id: str,
        role: str,
        content: str
    ):
        """Add a message to conversation history."""
        try:
            message_dict = {
                "guest_id": guest_id,
                "role": role,
                "content": content,
                "created_at": datetime.utcnow().isoformat()
            }
            self.client.table("conversations").insert(message_dict).execute()
            
            # Note: Supabase doesn't automatically limit to 50 messages
            # You may want to add a cleanup job or trigger in Supabase
        except Exception as e:
            logger.error(f"Error adding message to conversation for guest {guest_id}: {e}")
            raise
    
    def clear_conversation(self, guest_id: str):
        """Clear conversation history for a guest."""
        try:
            self.client.table("conversations").delete().eq("guest_id", guest_id).execute()
        except Exception as e:
            logger.error(f"Error clearing conversation for guest {guest_id}: {e}")
            raise

    def list_staff_inbox_threads(self, limit: int = 100) -> List[Dict[str, object]]:
        """Guests with conversation history for staff inbox (newest activity first)."""
        from app.services.conversation_helpers import is_internal_conversation_message

        try:
            response = (
                self.client.table("conversations")
                .select("guest_id, role, content, created_at")
                .order("created_at", desc=True)
                .limit(2000)
                .execute()
            )
            rows = response.data or []
        except Exception as e:
            logger.error(f"Error listing inbox threads: {e}")
            rows = []

        grouped: Dict[str, List[dict]] = {}
        for row in rows:
            guest_id = row.get("guest_id")
            if not guest_id:
                continue
            content = row.get("content", "")
            if is_internal_conversation_message(content):
                continue
            grouped.setdefault(str(guest_id), []).append(row)

        try:
            action_rows = (
                self.client.table("staff_actions")
                .select("guest_id")
                .order("created_at", desc=True)
                .limit(500)
                .execute()
            )
            for row in action_rows.data or []:
                gid = row.get("guest_id")
                if gid:
                    grouped.setdefault(str(gid), [])
        except Exception as e:
            logger.error(f"Error listing staff actions for inbox: {e}")

        threads: List[Dict[str, object]] = []
        for guest_id, messages in grouped.items():
            messages_sorted = sorted(
                messages,
                key=lambda m: m.get("created_at") or "",
            )
            if messages_sorted:
                last_row = messages_sorted[-1]
                created = last_row.get("created_at")
                try:
                    last_at = (
                        datetime.fromisoformat(str(created).replace("Z", "+00:00")).replace(tzinfo=None)
                        if created
                        else datetime.utcnow()
                    )
                except ValueError:
                    last_at = datetime.utcnow()
                preview = (last_row.get("content") or "")[:120]
                count = len(messages_sorted)
            else:
                preview = ""
                last_at = datetime.utcnow()
                count = 0

            guest = self.get_guest(guest_id)
            threads.append(
                {
                    "guest_id": guest_id,
                    "guest_name": guest.name if guest else None,
                    "room_number": guest.room_number if guest else None,
                    "last_message_preview": preview,
                    "last_message_at": last_at,
                    "message_count": count,
                }
            )

        threads.sort(key=lambda row: row["last_message_at"], reverse=True)
        return threads[:limit]

    def append_pending_staff_action(
        self,
        guest_id: str,
        action_type: ActionType,
        append_note: str,
    ) -> Optional[StaffAction]:
        note = (append_note or "").strip()
        if not note:
            return None
        try:
            response = (
                self.client.table("staff_actions")
                .select("*")
                .eq("guest_id", guest_id)
                .eq("action_type", action_type.value)
                .eq("status", StaffActionStatus.PENDING.value)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if not response.data:
                return None
            action = _staff_action_from_row(response.data[0])
            new_summary = f"{action.summary.rstrip('.')}; {note}"[:500]
            updated = (
                self.client.table("staff_actions")
                .update({"summary": new_summary})
                .eq("id", action.id)
                .execute()
            )
            if updated.data:
                return _staff_action_from_row(updated.data[0])
            action.summary = new_summary
            return action
        except Exception as e:
            logger.error(f"Error appending staff action: {e}")
            return None

    def log_staff_action(
        self,
        guest_id: str,
        action_type: ActionType,
        summary: str,
        source_message: str,
        *,
        escalation_type: StaffActionEscalationType = StaffActionEscalationType.NORMAL,
        allow_staff_jump_in: bool = True,
        guest_conversation_thread_id: Optional[str] = None,
    ) -> StaffAction:
        try:
            guest = self.get_guest(guest_id)
            thread_id = guest_conversation_thread_id or guest_id
            row = {
                "id": f"ACT-{uuid.uuid4().hex[:8].upper()}",
                "guest_id": guest_id,
                "action_type": action_type.value,
                "summary": summary,
                "source_message": source_message,
                "status": StaffActionStatus.PENDING.value,
                "created_at": datetime.utcnow().isoformat(),
                "guest_name": guest.name if guest else None,
                "room_number": guest.room_number if guest else None,
                "escalation_type": escalation_type.value,
                "allow_staff_jump_in": allow_staff_jump_in,
                "guest_conversation_thread_id": thread_id,
            }
            response = self.client.table("staff_actions").insert(row).execute()
            if response.data:
                return _staff_action_from_row(response.data[0])
            return _staff_action_from_row(row)
        except Exception as e:
            logger.error(f"Error logging staff action: {e}")
            raise

    def list_pending_actions_for_guest_service(
        self,
        guest_id: str,
        action_type: ActionType,
        max_age_minutes: int = 60,
    ) -> List[StaffAction]:
        try:
            cutoff = (datetime.utcnow() - timedelta(minutes=max_age_minutes)).isoformat()
            response = (
                self.client.table("staff_actions")
                .select("*")
                .eq("guest_id", guest_id)
                .eq("action_type", action_type.value)
                .eq("status", StaffActionStatus.PENDING.value)
                .gte("created_at", cutoff)
                .order("created_at", desc=True)
                .execute()
            )
            return [_staff_action_from_row(row) for row in (response.data or [])]
        except Exception as e:
            logger.error(f"Error listing pending staff actions: {e}")
            return []

    def list_staff_actions(
        self,
        limit: int = 50,
        status: Optional[StaffActionStatus] = None,
    ) -> List[StaffAction]:
        try:
            query = self.client.table("staff_actions").select("*").order("created_at", desc=True).limit(limit)
            if status is not None:
                query = query.eq("status", status.value)
            response = query.execute()
            return [_staff_action_from_row(row) for row in (response.data or [])]
        except Exception as e:
            logger.error(f"Error listing staff actions: {e}")
            return []

    def get_staff_action(self, action_id: str) -> Optional[StaffAction]:
        try:
            response = self.client.table("staff_actions").select("*").eq("id", action_id).execute()
            if response.data:
                return _staff_action_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error getting staff action {action_id}: {e}")
            return None

    def update_staff_action_status(
        self,
        action_id: str,
        status: StaffActionStatus,
    ) -> Optional[StaffAction]:
        try:
            response = (
                self.client.table("staff_actions")
                .update({"status": status.value})
                .eq("id", action_id)
                .execute()
            )
            if response.data:
                return _staff_action_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error updating staff action {action_id}: {e}")
            return None

    def update_staff_action_summary(
        self,
        action_id: str,
        summary: str,
    ) -> Optional[StaffAction]:
        try:
            response = (
                self.client.table("staff_actions")
                .update({"summary": (summary or "")[:500]})
                .eq("id", action_id)
                .execute()
            )
            if response.data:
                return _staff_action_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error updating staff action summary {action_id}: {e}")
            return None

    def update_staff_action_escalation(
        self,
        action_id: str,
        escalation_type: StaffActionEscalationType,
        summary: Optional[str] = None,
    ) -> Optional[StaffAction]:
        try:
            patch: dict = {"escalation_type": escalation_type.value}
            if summary is not None:
                patch["summary"] = (summary or "")[:500]
            response = (
                self.client.table("staff_actions")
                .update(patch)
                .eq("id", action_id)
                .execute()
            )
            if response.data:
                return _staff_action_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error escalating staff action {action_id}: {e}")
            return None

    def list_unanswered_guest_questions(
        self,
        property_id: str,
        min_occurrences: int = 2,
        limit: int = 10,
    ) -> List[dict]:
        try:
            guests = self.list_guests(property_id)
            guest_property = {g.id: g.property_id for g in guests}
            guest_ids = list(guest_property.keys())
            if not guest_ids:
                settings = get_settings()
                if property_id != (settings.property_id or "grand-horizon"):
                    return []
                response = (
                    self.client.table("staff_actions")
                    .select("*")
                    .eq("action_type", ActionType.CONTACT_FRONT_DESK.value)
                    .eq("escalation_type", StaffActionEscalationType.CONTACT.value)
                    .order("created_at", desc=True)
                    .limit(500)
                    .execute()
                )
            else:
                response = (
                    self.client.table("staff_actions")
                    .select("*")
                    .in_("guest_id", guest_ids)
                    .eq("action_type", ActionType.CONTACT_FRONT_DESK.value)
                    .eq("escalation_type", StaffActionEscalationType.CONTACT.value)
                    .order("created_at", desc=True)
                    .limit(500)
                    .execute()
                )
            actions = [_staff_action_from_row(row) for row in (response.data or [])]
            return _aggregate_unanswered_guest_questions(
                actions,
                guest_property,
                property_id,
                min_occurrences=min_occurrences,
                limit=limit,
            )
        except Exception as e:
            logger.error(f"Error listing unanswered guest questions: {e}")
            return []


@lru_cache()
def get_database() -> DatabaseProtocol:
    """
    Get database instance based on configuration.
    Returns MockDatabase or SupabaseDatabase based on database_type setting.
    """
    try:
        settings = get_settings()
        database_type = settings.database_type.lower()
        
        if database_type == "supabase":
            try:
                logger.info("Initializing Supabase database")
                return SupabaseDatabase()
            except Exception as e:
                logger.warning(f"Failed to initialize Supabase database: {e}. Falling back to MockDatabase.")
                return MockDatabase()
        elif database_type == "mock":
            logger.info("Using MockDatabase")
            return MockDatabase()
        else:
            logger.warning(f"Unknown database_type '{database_type}'. Using MockDatabase.")
            return MockDatabase()
    except ValidationError as e:
        logger.warning(f"Settings validation failed: {e}. Falling back to MockDatabase.")
        return MockDatabase()
