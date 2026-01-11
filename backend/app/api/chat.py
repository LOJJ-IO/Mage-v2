from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from datetime import datetime
import uuid
import json

from app.models.schemas import (
    ChatMessageRequest,
    Message,
    MessageRole,
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
    
    # Generate response from LLM
    response_content = await llm_service.generate_response(
        user_message=request.content,
        context=request.conversation_context,
        conversation_history=conversation_history,
        images=request.images
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
        timestamp=datetime.utcnow()
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
        async for chunk in llm_service.generate_stream(
            user_message=request.content,
            context=request.conversation_context,
            conversation_history=conversation_history,
            images=request.images
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
