from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from datetime import datetime
import uuid
import json

from app.models.schemas import (
    ChatMessageRequest,
    Message,
    MessageRole,
    ConversationContext,
)
from app.services.llm_service import llm_service
from app.services.database import get_database

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=Message)
async def send_message(request: ChatMessageRequest):
    """Send a message and get a response."""
    
    db = get_database()
    # Get conversation history if guest_id provided
    conversation_history = []
    if request.guest_id:
        conversation_history = db.get_conversation(request.guest_id)
        
        # Add user message to history
        db.add_message_to_conversation(
            request.guest_id,
            "user",
            request.content
        )
    
    require_contact = False
    # FRONT_DESK_AGENT: human-only chat, no LLM or intent pipeline
    if request.conversation_context == ConversationContext.FRONT_DESK_AGENT:
        response_content = "Your message has been sent to the front desk. They will respond shortly."
    else:
        response_content, require_contact = await llm_service.generate_response(
            user_message=request.content,
            context=request.conversation_context,
            conversation_history=conversation_history,
            images=request.images,
            guest_id=request.guest_id,
        )
    
    # Add assistant response to history
    if request.guest_id:
        db.add_message_to_conversation(
            request.guest_id,
            "assistant",
            response_content
        )
    
    return Message(
        id=f"msg-{uuid.uuid4().hex[:8]}",
        role=MessageRole.ASSISTANT,
        content=response_content,
        timestamp=datetime.utcnow(),
        require_contact_confirmation=require_contact
    )


@router.post("/stream")
async def stream_message(request: ChatMessageRequest):
    """Stream a message response."""
    
    db = get_database()
    # Get conversation history if guest_id provided
    conversation_history = []
    if request.guest_id:
        conversation_history = db.get_conversation(request.guest_id)
        
        # Add user message to history
        db.add_message_to_conversation(
            request.guest_id,
            "user",
            request.content
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
        
        # Add full response to history
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
