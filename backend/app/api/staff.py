from datetime import datetime
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.core.config import get_settings
from app.models.schemas import (
    ActionType,
    GuestProfile,
    Message,
    MessageKind,
    MessageRole,
    StaffAction,
    StaffActionConversationResponse,
    StaffActionEscalationType,
    StaffActionStatus,
    StaffGuestConversationResponse,
    StaffInboxThread,
    StaffMessageRequest,
    UpdateStaffActionRequest,
)
from app.services.conversation_helpers import is_internal_conversation_message
from app.services.database import get_database
from app.services.message_codec import parse_stored_message

router = APIRouter(prefix="/staff", tags=["staff"])


class StaffCalendarFetchRequest(BaseModel):
    url: str


def _normalize_calendar_url(url: str) -> str:
    trimmed = url.strip()
    if trimmed.lower().startswith("webcal://"):
        return "https://" + trimmed[9:]
    if trimmed.lower().startswith("webcals://"):
        return "https://" + trimmed[10:]
    return trimmed


def _validate_calendar_feed_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail="Calendar URL must use http or https (or webcal://).",
        )
    lower = url.lower()
    if "processinvitation" in lower or "outlook.live.com/mail/process" in lower:
        raise HTTPException(
            status_code=400,
            detail=(
                "Outlook invitation links are not calendar feeds. "
                "Export an .ics file or use a subscription URL ending in .ics."
            ),
        )
    if "calendar.google.com/calendar/u/" in lower and "cid=" in lower:
        raise HTTPException(
            status_code=400,
            detail=(
                "Use the secret iCal link (ends with basic.ics), "
                "not the browser calendar page."
            ),
        )


def _is_direct_guest_chat_action(action: StaffAction) -> bool:
    if not action.allow_staff_jump_in:
        return False
    if action.action_type == ActionType.CONTACT_FRONT_DESK:
        return True
    if action.escalation_type == StaffActionEscalationType.CONTACT:
        return True
    return False


def _pick_linked_action_id(actions: List[StaffAction]) -> Optional[str]:
    if not actions:
        return None
    open_actions = [
        a
        for a in actions
        if a.status in (StaffActionStatus.PENDING, StaffActionStatus.ACKNOWLEDGED)
    ]
    pool = open_actions or actions
    pool.sort(key=lambda a: a.created_at, reverse=True)
    return pool[0].id


def _enrich_inbox_threads(raw_threads: List[dict], actions: List[StaffAction]) -> List[StaffInboxThread]:
    by_guest: dict[str, List[StaffAction]] = {}
    for action in actions:
        by_guest.setdefault(action.guest_id, []).append(action)

    enriched: List[StaffInboxThread] = []
    seen_guests = set()
    for row in raw_threads:
        guest_id = str(row["guest_id"])
        seen_guests.add(guest_id)
        guest_actions = by_guest.get(guest_id, [])
        guest_actions.sort(key=lambda a: a.created_at, reverse=True)
        latest = guest_actions[0] if guest_actions else None
        enriched.append(
            StaffInboxThread(
                guest_id=guest_id,
                guest_name=row.get("guest_name") or (latest.guest_name if latest else None),
                room_number=row.get("room_number") or (latest.room_number if latest else None),
                last_message_preview=str(row.get("last_message_preview") or ""),
                last_message_at=row["last_message_at"],
                message_count=int(row.get("message_count") or 0),
                linked_action_id=_pick_linked_action_id(guest_actions),
                live_chat_pending=any(
                    a.status == StaffActionStatus.PENDING and _is_direct_guest_chat_action(a)
                    for a in guest_actions
                ),
            )
        )

    for guest_id, guest_actions in by_guest.items():
        if guest_id in seen_guests:
            continue
        guest_actions.sort(key=lambda a: a.created_at, reverse=True)
        latest = guest_actions[0]
        enriched.append(
            StaffInboxThread(
                guest_id=guest_id,
                guest_name=latest.guest_name,
                room_number=latest.room_number,
                last_message_preview=latest.summary,
                last_message_at=latest.created_at,
                message_count=0,
                linked_action_id=_pick_linked_action_id(guest_actions),
                live_chat_pending=any(
                    a.status == StaffActionStatus.PENDING and _is_direct_guest_chat_action(a)
                    for a in guest_actions
                ),
            )
        )

    enriched.sort(key=lambda t: t.last_message_at, reverse=True)
    return enriched


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


@router.get("/inbox/threads", response_model=List[StaffInboxThread])
async def list_staff_inbox_threads(
    limit: int = 100,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    raw = db.list_staff_inbox_threads(limit=min(limit, 200))
    actions = db.list_staff_actions(limit=500)
    return _enrich_inbox_threads(raw, actions)


class GuestHappinessScore(BaseModel):
    guest_id: str
    score: Optional[int] = None


class GuestReviewSummary(BaseModel):
    guest_id: str
    score: Optional[int] = None
    name: str
    room_number: str
    check_out: datetime


@router.get("/guests/happiness-scores", response_model=List[GuestHappinessScore])
async def list_guest_happiness_scores(_: bool = Depends(verify_staff_key)):
    """Pre-computed VADER happiness scores for all guests. Cheap single-table read."""
    db = get_database()
    return [
        GuestHappinessScore(guest_id=g.id, score=g.happiness_score)
        for g in db.list_guests()
    ]


@router.get("/guests/review-summary", response_model=List[GuestReviewSummary])
async def list_guest_review_summary(_: bool = Depends(verify_staff_key)):
    """Guest profile + VADER score for guests who have sent at least one chat message."""
    db = get_database()
    return [
        GuestReviewSummary(
            guest_id=g.id,
            score=g.happiness_score,
            name=g.name,
            room_number=g.room_number,
            check_out=g.check_out,
        )
        for g in db.list_guests()
        if g.happiness_score is not None
    ]


@router.get("/guests/{guest_id}/conversation", response_model=StaffGuestConversationResponse)
async def get_staff_guest_conversation(
    guest_id: str,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    guest = db.get_guest(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")

    actions = [
        a for a in db.list_staff_actions(limit=500) if a.guest_id == guest_id
    ]
    thread_id = guest_id
    if actions:
        latest = sorted(actions, key=lambda a: a.created_at, reverse=True)[0]
        thread_id = latest.guest_conversation_thread_id or guest_id

    return StaffGuestConversationResponse(
        guest=guest,
        messages=_conversation_messages_for_guest(thread_id),
        linked_action_id=_pick_linked_action_id(actions),
    )


@router.post("/guests/{guest_id}/message", response_model=Message)
async def post_staff_guest_message(
    guest_id: str,
    request: StaffMessageRequest,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    guest = db.get_guest(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")

    actions = [
        a for a in db.list_staff_actions(limit=500) if a.guest_id == guest_id
    ]
    actions.sort(key=lambda a: a.created_at, reverse=True)
    linked = actions[0] if actions else None
    thread_id = guest_id
    if linked:
        thread_id = linked.guest_conversation_thread_id or guest_id
        if not linked.allow_staff_jump_in:
            raise HTTPException(
                status_code=403,
                detail="Staff jump-in disabled for this guest's active task.",
            )
    # No linked task: staff may still reply into the guest conversation thread.

    db.add_message_to_conversation(thread_id, MessageRole.STAFF.value, request.content.strip())
    if linked and linked.status == StaffActionStatus.PENDING:
        db.update_staff_action_status(linked.id, StaffActionStatus.ACKNOWLEDGED)

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
        MessageRole.STAFF.value,
        request.content.strip(),
        f"staff-msg-{guest_id}",
        ts,
    )
    return Message(
        id=parsed["id"],
        role=MessageRole.STAFF,
        content=parsed["content"],
        timestamp=parsed["timestamp"],
        kind=MessageKind(parsed.get("kind", MessageKind.TEXT.value)),
    )


@router.get("/actions", response_model=List[StaffAction])
async def list_staff_actions(
    status: Optional[StaffActionStatus] = None,
    limit: int = 200,
    _: bool = Depends(verify_staff_key),
):
    db = get_database()
    return db.list_staff_actions(limit=min(limit, 500), status=status)


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


@router.post("/calendar/fetch")
async def fetch_staff_calendar_feed(
    request: StaffCalendarFetchRequest,
    _: bool = Depends(verify_staff_key),
):
    """Proxy calendar feed downloads server-side (avoids browser CORS on secret iCal URLs)."""
    url = _normalize_calendar_url(request.url)
    _validate_calendar_feed_url(url)

    headers = {"User-Agent": "Mage-Staff-Calendar/1.0"}
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach calendar URL: {exc}",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Calendar server returned HTTP {response.status_code}.",
        )

    content = response.text or ""
    if not content.strip():
        raise HTTPException(status_code=502, detail="Calendar feed was empty.")

    sample = content[:800].lower()
    if "<!doctype html" in sample or "<html" in sample:
        raise HTTPException(
            status_code=400,
            detail=(
                "URL returned a web page, not a calendar file. "
                "Use a direct .ics link or import the file."
            ),
        )

    return {
        "content": content,
        "content_type": response.headers.get("content-type", ""),
    }
