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
    ActionType,
)
from app.core.config import get_settings
from functools import lru_cache
import uuid
import logging

logger = logging.getLogger(__name__)


class DatabaseProtocol(Protocol):
    """Protocol defining the database interface."""
    
    # Guest operations
    def get_guest(self, guest_id: str) -> Optional[GuestProfile]:
        """Get guest by ID."""
        ...
    
    def get_guest_by_booking(self, booking_id: str) -> Optional[GuestProfile]:
        """Get guest by booking ID."""
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
    ) -> StaffAction:
        """Log a chatbot-flagged action for staff."""
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


class MockDatabase:
    """Mock database for development/testing."""
    
    def __init__(self):
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
                membership_tier="Platinum"
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
                membership_tier="Gold"
            )
        }
        
        self.tickets: Dict[str, Ticket] = {}
        self.staff_actions: Dict[str, StaffAction] = {}

        # Simulated agent availability
        self.human_agent_available = False
        self.ai_agent_available = True
        
        # Conversation histories per guest
        self.conversations: Dict[str, List[Dict[str, str]]] = {}
    
    # Guest operations
    def get_guest(self, guest_id: str) -> Optional[GuestProfile]:
        """Get guest by ID."""
        return self.guests.get(guest_id)
    
    def get_guest_by_booking(self, booking_id: str) -> Optional[GuestProfile]:
        """Get guest by booking ID."""
        for guest in self.guests.values():
            if guest.booking_id == booking_id:
                return guest
        return None
    
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
        )
        self.staff_actions[action_id] = action
        return action

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


class SupabaseDatabase:
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
    
    def get_guest_by_booking(self, booking_id: str) -> Optional[GuestProfile]:
        """Get guest by booking ID."""
        try:
            response = self.client.table("guests").select("*").eq("booking_id", booking_id).execute()
            if response.data and len(response.data) > 0:
                return GuestProfile(**response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error getting guest by booking {booking_id}: {e}")
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
                    {"role": msg.get("role"), "content": msg.get("content")}
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
            action = StaffAction(**response.data[0])
            new_summary = f"{action.summary.rstrip('.')}; {note}"[:500]
            updated = (
                self.client.table("staff_actions")
                .update({"summary": new_summary})
                .eq("id", action.id)
                .execute()
            )
            if updated.data:
                return StaffAction(**updated.data[0])
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
    ) -> StaffAction:
        try:
            guest = self.get_guest(guest_id)
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
            }
            response = self.client.table("staff_actions").insert(row).execute()
            if response.data:
                return StaffAction(**response.data[0])
            return StaffAction(**row)
        except Exception as e:
            logger.error(f"Error logging staff action: {e}")
            raise

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
            return [StaffAction(**row) for row in (response.data or [])]
        except Exception as e:
            logger.error(f"Error listing staff actions: {e}")
            return []

    def get_staff_action(self, action_id: str) -> Optional[StaffAction]:
        try:
            response = self.client.table("staff_actions").select("*").eq("id", action_id).execute()
            if response.data:
                return StaffAction(**response.data[0])
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
                return StaffAction(**response.data[0])
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
                return StaffAction(**response.data[0])
            return None
        except Exception as e:
            logger.error(f"Error updating staff action summary {action_id}: {e}")
            return None


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
