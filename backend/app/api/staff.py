from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from typing import List, Optional

from app.core.config import get_settings
from app.models.schemas import (
    GuestProfile,
    Message,
    MessageKind,
    MessageRole,
    StaffAction,
    StaffActionConversationResponse,
    StaffActionStatus,
    StaffMessageRequest,
    UpdateStaffActionRequest,
)
from app.services.conversation_helpers import is_internal_conversation_message
from app.services.database import get_database
from app.services.message_codec import parse_stored_message

router = APIRouter(prefix="/staff", tags=["staff"])


def verify_staff_key(x_staff_key: Optional[str] = Header(None, alias="X-Staff-Key")):
    settings = get_settings()
    if not x_staff_key or x_staff_key != settings.staff_access_key:
        raise HTTPException(status_code=401, detail="Invalid or missing staff key")
    return True


def _conversation_messages_for_guest(guest_id: str) -> List[Message]:
    db = get_database()
    raw = db.get_conversation(guest_id)
    messages: List[Message] = []
    idx = 0
    for row in raw:
        content = row.get("content", "")
        if is_internal_conversation_message(content):
            continue
        created = row.get("created_at")
        ts = datetime.utcnow()
        if created:
            try:
                ts = datetime.fromisoformat(created.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                pass
        role = row.get("role", "user")
        parsed = parse_stored_message(role, content, f"staff-hist-{idx}", ts)
        idx += 1
        messages.append(
            Message(
                id=parsed["id"],
                role=MessageRole(parsed["role"]),
                content=parsed["content"],
                timestamp=parsed["timestamp"],
                kind=MessageKind(parsed.get("kind", MessageKind.TEXT.value)),
                intro=parsed.get("intro"),
                faq_items=parsed.get("faq_items"),
                trigger_content=parsed.get("trigger_content"),
                faq_resolved=parsed.get("faq_resolved"),
            )
        )
    return messages


@router.get("/actions", response_model=List[StaffAction])
async def list_staff_actions(
    status: Optional[StaffActionStatus] = None,
    limit: int = 50,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    return db.list_staff_actions(limit=min(limit, 100), status=status)


@router.get("/actions/{action_id}", response_model=StaffAction)
async def get_staff_action(
    action_id: str,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    action = db.get_staff_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@router.get("/actions/{action_id}/conversation", response_model=StaffActionConversationResponse)
async def get_staff_action_conversation(
    action_id: str,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    action = db.get_staff_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    thread_id = action.guest_conversation_thread_id or action.guest_id
    guest = db.get_guest(action.guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    return StaffActionConversationResponse(
        action=action,
        guest=guest,
        messages=_conversation_messages_for_guest(thread_id),
    )


@router.post("/actions/{action_id}/message", response_model=Message)
async def post_staff_action_message(
    action_id: str,
    request: StaffMessageRequest,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    action = db.get_staff_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if not action.allow_staff_jump_in:
        raise HTTPException(status_code=403, detail="Staff jump-in disabled for this action")

    thread_id = action.guest_conversation_thread_id or action.guest_id
    if not db.get_guest(action.guest_id):
        raise HTTPException(status_code=404, detail="Guest not found")

    db.add_message_to_conversation(thread_id, MessageRole.STAFF.value, request.content.strip())
    if action.status == StaffActionStatus.PENDING:
        db.update_staff_action_status(action_id, StaffActionStatus.ACKNOWLEDGED)

    raw = db.get_conversation(thread_id)
    last_row = raw[-1] if raw else None
    if not last_row:
        raise HTTPException(status_code=500, detail="Failed to persist staff message")

    ts = datetime.utcnow()
    created = last_row.get("created_at")
    if created:
        try:
            ts = datetime.fromisoformat(created.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    parsed = parse_stored_message(
        last_row.get("role", MessageRole.STAFF.value),
        last_row.get("content", request.content),
        f"staff-msg-{action_id}",
        ts,
    )
    return Message(
        id=parsed["id"],
        role=MessageRole.STAFF,
        content=parsed["content"],
        timestamp=parsed["timestamp"],
        kind=MessageKind(parsed.get("kind", MessageKind.TEXT.value)),
    )


@router.patch("/actions/{action_id}", response_model=StaffAction)
async def update_staff_action(
    action_id: str,
    request: UpdateStaffActionRequest,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    action = db.update_staff_action_status(action_id, request.status)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action
