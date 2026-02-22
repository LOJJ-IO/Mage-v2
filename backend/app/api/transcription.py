from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import tempfile
import asyncio
import subprocess
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


def convert_to_wav_16k(input_path: str, output_path: str) -> None:
    """Convert audio file to 16kHz mono WAV using ffmpeg for reliable Whisper input."""
    # -fflags +genpts+igndts can help with browser WebM that has timestamp/container quirks
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-fflags", "+genpts+igndts",
            "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            "-f", "wav",
            output_path,
        ],
        capture_output=True,
        timeout=60,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or b"").decode("utf-8", errors="replace")
        # Actual error is usually at the end of stderr (after version/config dump)
        err_tail = stderr[-600:] if len(stderr) > 600 else stderr
        raise RuntimeError(f"ffmpeg conversion failed: {err_tail.strip()}")


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio file to text using local Whisper model."""
    
    # Validate file type
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid audio file")
    
    # Read audio content
    content = await audio.read()
    
    if len(content) < 1024:
        raise HTTPException(status_code=400, detail="Recording too short or empty.")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large")
    
    tmp_input = None
    tmp_wav = None
    try:
        # Normalize extension: only allow known audio types, default to .webm
        raw_ext = os.path.splitext(audio.filename or "")[1].lower()
        suffix = raw_ext if raw_ext in _ALLOWED_AUDIO_EXTENSIONS else _DEFAULT_AUDIO_EXT
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(content)
            tmp_input = f.name
        
        # Convert to 16kHz mono WAV so Whisper/ffmpeg can read browser WebM reliably
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            tmp_wav = f.name
        await asyncio.to_thread(convert_to_wav_16k, tmp_input, tmp_wav)
        # WAV header is 44 bytes; ensure we got real audio
        wav_size = os.path.getsize(tmp_wav)
        if wav_size < 1000:
            raise HTTPException(
                status_code=400,
                detail="No audio could be extracted from the recording.",
            )
        
        # Load Whisper model (cached after first load)
        model = get_whisper_model()
        
        def transcribe():
            return model.transcribe(tmp_wav)
        
        result = await asyncio.to_thread(transcribe)
        
        text = result.get("text", "").strip()
        segments = result.get("segments", [])
        if segments:
            no_speech_probs = [seg.get("no_speech_prob", 0.0) for seg in segments]
            avg_no_speech = sum(no_speech_probs) / len(no_speech_probs) if no_speech_probs else 0.0
            confidence = max(0.0, min(1.0, 1.0 - avg_no_speech))
        else:
            confidence = 0.9
        
        return TranscriptionResponse(text=text, confidence=confidence)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Transcription error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Transcription failed. The audio format may not be supported.",
        )
    finally:
        for path in (tmp_input, tmp_wav):
            if path:
                try:
                    os.unlink(path)
                except Exception:
                    pass
