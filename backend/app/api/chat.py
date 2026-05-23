from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from datetime import datetime
import uuid
import json

from app.models.schemas import (
    ChatMessageRequest,
    ChatMessageResponse,
    ConversationHistoryResponse,
    FaqFeedbackRequest,
    Message,
    MessageRole,
    MessageKind,
    ConversationContext,
    FaqItem,
)
from app.services.llm_service import llm_service
from app.services.database import get_database
from app.services.message_codec import encode_faq_payload, parse_stored_message
from app.services.conversation_helpers import is_internal_conversation_message
from app.core.config import get_settings

router = APIRouter(prefix="/chat", tags=["chat"])
settings = get_settings()


def _segment_to_message(segment: dict, msg_id: str) -> Message:
    kind_raw = segment.get("kind", MessageKind.TEXT.value)
    kind = MessageKind(kind_raw) if kind_raw in {k.value for k in MessageKind} else MessageKind.TEXT
    faq_items = None
    if kind == MessageKind.FAQ:
        faq_items = [
            FaqItem(**item) if isinstance(item, dict) else item
            for item in (segment.get("faq_items") or [])
        ]
    return Message(
        id=msg_id,
        role=MessageRole.ASSISTANT,
        content=segment.get("content") or segment.get("intro") or "",
        timestamp=datetime.utcnow(),
        require_contact_confirmation=bool(segment.get("require_contact_confirmation", False)),
        kind=kind,
        intro=segment.get("intro"),
        faq_items=faq_items,
        trigger_content=segment.get("trigger_content"),
        faq_resolved=segment.get("faq_resolved"),
    )


def _content_for_storage(segment: dict) -> str:
    if segment.get("kind") == MessageKind.FAQ.value:
        items = segment.get("faq_items") or []
        return encode_faq_payload(
            intro=segment.get("intro") or "",
            faq_items=items,
            trigger_content=segment.get("trigger_content") or "",
            faq_resolved=segment.get("faq_resolved"),
        )
    return (segment.get("content") or "").strip()


def _persist_assistant_segments(guest_id: str, segments: list) -> list[Message]:
    db = get_database()
    response_messages: list[Message] = []
    for segment in segments:
        content = _content_for_storage(segment)
        if not content and segment.get("kind") != MessageKind.FAQ.value:
            continue
        db.add_message_to_conversation(guest_id, "assistant", content)
        response_messages.append(_segment_to_message(segment, f"msg-{uuid.uuid4().hex[:8]}"))
    return response_messages


@router.get("/public-config")
async def get_public_config():
    """Guest-visible configuration (no auth)."""
    return {
        "front_desk_phone": (settings.hotel_front_desk_phone or "").strip(),
    }


@router.get("/history/{guest_id}", response_model=ConversationHistoryResponse)
async def get_conversation_history(guest_id: str):
    """Return stored conversation for a guest (excludes internal ops messages)."""
    db = get_database()
    guest = db.get_guest(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    raw = db.get_conversation(guest_id)
    messages: list[Message] = []
    idx = 0
    for row in raw:
        role = row.get("role", "user")
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
        parsed = parse_stored_message(role, content, f"msg-hist-{idx}", ts)
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
    return ConversationHistoryResponse(messages=messages)


@router.post("/faq-feedback", response_model=ChatMessageResponse)
async def faq_feedback(request: FaqFeedbackRequest):
    """Guest feedback on an FAQ panel (helpful → ack; not helpful → LLM). No guest-visible user row."""
    db = get_database()
    if not db.get_guest(request.guest_id):
        raise HTTPException(status_code=404, detail="Guest not found")

    history = db.get_conversation(request.guest_id)
    assistant_segments = await llm_service.generate_faq_feedback(
        helpful=request.helpful,
        trigger_content=request.trigger_content,
        conversation_history=history,
        guest_id=request.guest_id,
        faq_titles=request.faq_titles,
    )

    response_messages = _persist_assistant_segments(request.guest_id, assistant_segments)
    return ChatMessageResponse(messages=response_messages)


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(request: ChatMessageRequest):
    """Send a message and get a response."""
    
    db = get_database()
    conversation_history = []
    if request.guest_id:
        conversation_history = [
            m for m in db.get_conversation(request.guest_id)
            if not is_internal_conversation_message(m.get("content", ""))
        ]
        
        if not request.task_continuation:
            db.add_message_to_conversation(
                request.guest_id,
                "user",
                request.content,
            )
    
    continue_task = False
    task_message = None

    if request.conversation_context == ConversationContext.FRONT_DESK_AGENT:
        assistant_segments = [
            {
                "content": "Your message has been sent to the front desk. They will respond shortly.",
                "require_contact_confirmation": False,
            }
        ]
    else:
        assistant_segments, continue_task, task_message = await llm_service.route_message(
            user_message=request.content,
            conversation_history=conversation_history,
            images=request.images,
            guest_id=request.guest_id,
            task_continuation=request.task_continuation,
        )

    response_messages: list[Message] = []
    if request.guest_id:
        response_messages = _persist_assistant_segments(request.guest_id, assistant_segments)
    else:
        for segment in assistant_segments:
            response_messages.append(_segment_to_message(segment, f"msg-{uuid.uuid4().hex[:8]}"))

    return ChatMessageResponse(
        messages=response_messages,
        continue_task=continue_task,
        task_message=task_message,
    )


@router.post("/stream")
async def stream_message(request: ChatMessageRequest):
    """Stream a message response."""
    
    db = get_database()
    conversation_history = []
    if request.guest_id:
        conversation_history = db.get_conversation(request.guest_id)
        
        if not request.task_continuation:
            db.add_message_to_conversation(
                request.guest_id,
                "user",
                request.content,
            )
    
    async def generate():
        full_response = ""
        if request.conversation_context == ConversationContext.FRONT_DESK_AGENT:
            full_response = "Your message has been sent to the front desk. They will respond shortly."
            yield f"data: {json.dumps({'content': full_response})}\n\n"
        else:
            async for chunk in llm_service.generate_stream(
                user_message=request.content,
                context=request.conversation_context,
                conversation_history=conversation_history,
                images=request.images,
                guest_id=request.guest_id,
            ):
                full_response += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"
        
        if request.guest_id:
            db.add_message_to_conversation(
                request.guest_id,
                "assistant",
                full_response
            )
        
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
