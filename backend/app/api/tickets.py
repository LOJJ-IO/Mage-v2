from fastapi import APIRouter, HTTPException
from typing import List

from app.models.schemas import (
    CreateTicketRequest,
    UpdateTicketRequest,
    Ticket,
    TicketStatus,
)
from app.services.database import get_database

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.post("", response_model=Ticket)
async def create_ticket(request: CreateTicketRequest):
    """Create a new support ticket."""
    
    db = get_database()
    # Verify guest exists
    guest = db.get_guest(request.guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    
    ticket = db.create_ticket(request.guest_id, request.issue)
    return ticket


@router.get("/{ticket_id}", response_model=Ticket)
async def get_ticket(ticket_id: str):
    """Get a ticket by ID."""
    
    db = get_database()
    ticket = db.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return ticket


@router.get("/guest/{guest_id}", response_model=List[Ticket])
async def get_guest_tickets(guest_id: str):
    """Get all tickets for a guest."""
    
    db = get_database()
    return db.get_tickets_by_guest(guest_id)


@router.patch("/{ticket_id}", response_model=Ticket)
async def update_ticket(ticket_id: str, request: UpdateTicketRequest):
    """Update a ticket."""
    
    db = get_database()
    ticket = db.update_ticket(
        ticket_id,
        status=request.status,
        issue=request.issue,
        assigned_to=request.assigned_to,
        assigned_type=request.assigned_type
    )
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return ticket


@router.post("/{ticket_id}/resolve", response_model=Ticket)
async def resolve_ticket(ticket_id: str):
    """Resolve a ticket."""
    
    db = get_database()
    ticket = db.update_ticket(ticket_id, status=TicketStatus.RESOLVED)
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return ticket


@router.post("/{ticket_id}/cancel")
async def cancel_ticket(ticket_id: str):
    """Cancel a ticket."""
    
    db = get_database()
    success = db.cancel_ticket(ticket_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return {"cancelled": True}
