from fastapi import APIRouter, UploadFile, File, HTTPException

from app.models.schemas import TranscriptionResponse
from app.services import transcription_service

router = APIRouter(tags=["transcription"])


def get_whisper_model():
    """Backward-compatible hook for main.py lifespan."""
    return transcription_service.get_whisper_model()


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio file to text (local Whisper or OpenAI API)."""
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid audio file")

    content = await audio.read()
    return await transcription_service.transcribe_upload(content, audio.filename)
