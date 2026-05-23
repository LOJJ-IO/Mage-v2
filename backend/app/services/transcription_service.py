"""Speech-to-text: local Whisper (dev) or OpenAI API (serverless / Vercel)."""

from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
from typing import Optional

from fastapi import HTTPException

from app.core.config import get_settings
from app.models.schemas import TranscriptionResponse

settings = get_settings()

_ALLOWED_AUDIO_EXTENSIONS = {".webm", ".mp4", ".m4a", ".ogg", ".wav", ".mp3", ".flac"}
_DEFAULT_AUDIO_EXT = ".webm"

_whisper_model = None


def resolve_provider() -> str:
    """Return effective provider: local | openai."""
    configured = (settings.transcription_provider or "auto").strip().lower()
    if configured in ("local", "whisper"):
        return "local"
    if configured == "openai":
        return "openai"

    # auto: prefer API on Vercel; local when Whisper stack is installed
    if os.getenv("VERCEL"):
        return "openai"
    try:
        import whisper  # noqa: F401

        return "local"
    except ImportError:
        return "openai"


def convert_to_wav_16k(input_path: str, output_path: str) -> None:
    """Convert audio to 16 kHz mono WAV for local Whisper."""
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-fflags",
            "+genpts+igndts",
            "-i",
            input_path,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "wav",
            output_path,
        ],
        capture_output=True,
        timeout=60,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or b"").decode("utf-8", errors="replace")
        err_tail = stderr[-600:] if len(stderr) > 600 else stderr
        raise RuntimeError(f"ffmpeg conversion failed: {err_tail.strip()}")


def preload_whisper_model() -> None:
    """Load local Whisper model (no-op when using OpenAI provider)."""
    if resolve_provider() != "local":
        return
    get_whisper_model()


def get_whisper_model():
    """Get or load the local Whisper model."""
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
        except ImportError as e:
            raise RuntimeError(
                "Local Whisper is not installed. "
                "Run: pip install -r requirements-local.txt"
            ) from e
        _whisper_model = whisper.load_model(settings.whisper_model_size)
    return _whisper_model


def _confidence_from_whisper_result(result: dict) -> float:
    segments = result.get("segments", [])
    if segments:
        no_speech_probs = [seg.get("no_speech_prob", 0.0) for seg in segments]
        avg_no_speech = sum(no_speech_probs) / len(no_speech_probs)
        return max(0.0, min(1.0, 1.0 - avg_no_speech))
    return 0.9


async def _transcribe_local_wav(wav_path: str) -> TranscriptionResponse:
    model = get_whisper_model()

    def _run():
        return model.transcribe(wav_path)

    result = await asyncio.to_thread(_run)
    text = result.get("text", "").strip()
    return TranscriptionResponse(
        text=text,
        confidence=_confidence_from_whisper_result(result),
    )


async def _transcribe_openai_file(audio_path: str) -> TranscriptionResponse:
    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Speech transcription is not configured. "
                "Set OPENAI_API_KEY on the server (Vercel) or install local Whisper "
                "(pip install -r requirements-local.txt) for development."
            ),
        )

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    with open(audio_path, "rb") as audio_file:
        result = await client.audio.transcriptions.create(
            model=settings.openai_transcription_model,
            file=audio_file,
        )
    text = (result.text or "").strip()
    return TranscriptionResponse(text=text, confidence=0.9)


async def transcribe_upload(
    content: bytes,
    filename: Optional[str],
) -> TranscriptionResponse:
    """Transcribe uploaded audio bytes."""
    if len(content) < 1024:
        raise HTTPException(status_code=400, detail="Recording too short or empty.")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large")

    raw_ext = os.path.splitext(filename or "")[1].lower()
    suffix = raw_ext if raw_ext in _ALLOWED_AUDIO_EXTENSIONS else _DEFAULT_AUDIO_EXT
    provider = resolve_provider()

    tmp_input: Optional[str] = None
    tmp_wav: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(content)
            tmp_input = f.name

        if provider == "openai":
            return await _transcribe_openai_file(tmp_input)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            tmp_wav = f.name
        await asyncio.to_thread(convert_to_wav_16k, tmp_input, tmp_wav)
        if os.path.getsize(tmp_wav) < 1000:
            raise HTTPException(
                status_code=400,
                detail="No audio could be extracted from the recording.",
            )
        return await _transcribe_local_wav(tmp_wav)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Transcription error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Transcription failed. The audio format may not be supported.",
        ) from e
    finally:
        for path in (tmp_input, tmp_wav):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass
