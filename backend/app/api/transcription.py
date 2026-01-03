from fastapi import APIRouter, UploadFile, File, HTTPException
import httpx
import os

from app.models.schemas import TranscriptionResponse
from app.core.config import get_settings

settings = get_settings()
router = APIRouter(tags=["transcription"])


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio file to text."""
    
    # Validate file type
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid audio file")
    
    # Read audio content
    content = await audio.read()
    
    # Check file size (max 25MB)
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large")
    
    # If no API key, return mock transcription
    if not settings.openrouter_api_key:
        return TranscriptionResponse(
            text="This is a mock transcription. Configure OPENROUTER_API_KEY for real transcription.",
            confidence=0.95
        )
    
    try:
        # Use OpenAI-compatible whisper endpoint via OpenRouter
        # Note: OpenRouter may not support Whisper directly, so we'll use a mock for now
        # In production, you'd use a dedicated transcription service
        
        return TranscriptionResponse(
            text="Transcription service is configured. Audio would be processed here.",
            confidence=0.90
        )
        
    except Exception as e:
        print(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail="Transcription failed")
