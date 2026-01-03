from datetime import datetime, timedelta
from typing import Dict, Optional, List
from app.models.schemas import GuestProfile, Ticket, TicketStatus, ConversationContext
import uuid


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
                phone="+1 555-0123"
            ),
            "guest-002": GuestProfile(
                id="guest-002",
                name="Sarah Williams",
                room_number="305",
                check_in=datetime.now() - timedelta(days=2),
                check_out=datetime.now() + timedelta(days=1),
                booking_id="BK-2026-0305",
                email="sarah.w@email.com",
                phone="+1 555-0456"
            )
        }
        
        self.tickets: Dict[str, Ticket] = {}
        
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
            "content": content
        })
        
        # Keep last 50 messages
        if len(self.conversations[guest_id]) > 50:
            self.conversations[guest_id] = self.conversations[guest_id][-50:]
    
    def clear_conversation(self, guest_id: str):
        """Clear conversation history for a guest."""
        self.conversations[guest_id] = []


# Global mock database instance
mock_db = MockDatabase()
