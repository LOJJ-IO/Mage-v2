from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import tempfile
import asyncio
from typing import Optional

import whisper

from app.models.schemas import TranscriptionResponse
from app.core.config import get_settings

settings = get_settings()
router = APIRouter(tags=["transcription"])

# Allowed audio extensions for temp file (Whisper/ffmpeg support these)
_ALLOWED_AUDIO_EXTENSIONS = {".webm", ".mp4", ".m4a", ".ogg", ".wav", ".mp3", ".flac"}
_DEFAULT_AUDIO_EXT = ".webm"

# Global Whisper model instance (loaded lazily on first use)
_whisper_model: Optional[whisper.Whisper] = None


def get_whisper_model() -> whisper.Whisper:
    """Get or load the Whisper model (cached globally)."""
    global _whisper_model
    if _whisper_model is None:
        model_size = settings.whisper_model_size
        _whisper_model = whisper.load_model(model_size)
    return _whisper_model


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio file to text using local Whisper model."""
    
    # Validate file type
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid audio file")
    
    # Read audio content
    content = await audio.read()
    
    # Check file size (max 25MB)
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large")
    
    try:
        # Normalize extension: only allow known audio types, default to .webm
        raw_ext = os.path.splitext(audio.filename or "")[1].lower()
        suffix = raw_ext if raw_ext in _ALLOWED_AUDIO_EXTENSIONS else _DEFAULT_AUDIO_EXT
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        try:
            # Load Whisper model (cached after first load)
            model = get_whisper_model()
            
            # Run transcription in thread pool to avoid blocking event loop
            def transcribe():
                result = model.transcribe(tmp_file_path)
                return result
            
            # Execute transcription asynchronously
            result = await asyncio.to_thread(transcribe)
            
            # Extract transcription text
            text = result.get("text", "").strip()
            
            # Calculate confidence from segments if available
            segments = result.get("segments", [])
            if segments:
                # Average the "no_speech_prob" across segments and convert to confidence
                no_speech_probs = [seg.get("no_speech_prob", 0.0) for seg in segments]
                avg_no_speech = sum(no_speech_probs) / len(no_speech_probs) if no_speech_probs else 0.0
                confidence = max(0.0, min(1.0, 1.0 - avg_no_speech))
            else:
                confidence = 0.9  # Default confidence if no segments
            
            return TranscriptionResponse(
                text=text,
                confidence=confidence
            )
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_file_path)
            except Exception:
                pass
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Transcription error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Transcription failed. The audio format may not be supported.",
        )
