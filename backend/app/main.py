import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from app.core.config import get_settings
from app.models.schemas import HealthResponse
from app.services.database import get_database
from app.api import chat, tickets, guests, agents, transcription, staff, auth, staff_knowledge, webhooks
from app.services import transcription_service

settings = get_settings()
logger = logging.getLogger(__name__)

# Playwright requires subprocess-capable event loops on Windows.
# Force Proactor policy to avoid NotImplementedError from Selector loops.
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

# Ensure app loggers (e.g. llm_service, database) show in the terminal
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload local Whisper when configured; OpenAI API needs no warmup."""
    provider = transcription_service.resolve_provider()
    if provider == "local":
        logger.info("Loading Whisper model (%s)...", settings.whisper_model_size)
        try:
            await asyncio.to_thread(transcription_service.preload_whisper_model)
            logger.info("Whisper model loaded.")
        except Exception as e:
            logger.warning(
                "Whisper model failed to load on startup: %s. Will retry on first /transcribe request.",
                e,
            )
    else:
        logger.info("Transcription provider: %s", provider)
    if not (settings.openrouter_api_key or "").strip():
        logger.warning(
            "OPENROUTER_API_KEY is not set. Chat uses keyword rules and offline fallbacks only; "
            "set a key from https://openrouter.ai/ for full AI responses."
        )
    yield


# Create FastAPI app
app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    description="AI-powered hotel communication API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS (explicit origins + in debug, regex for LAN / IPv6 localhost)
_cors: dict = {
    "allow_origins": settings.cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.debug:
    _cors["allow_origin_regex"] = (
        r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|"
        r"https?://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?|"
        r"https?://10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?"
    )
app.add_middleware(CORSMiddleware, **_cors)

# Include routers
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(tickets.router, prefix=settings.api_prefix)
app.include_router(guests.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(transcription.router, prefix=settings.api_prefix)
app.include_router(staff.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(staff_knowledge.router, prefix=settings.api_prefix)
app.include_router(webhooks.router, prefix=settings.api_prefix)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get(f"{settings.api_prefix}/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    db_type = settings.database_type
    db_ok = True
    db_error: str | None = None

    if db_type == "supabase":
        try:
            db = get_database()
            client = getattr(db, "client", None)
            if client is None:
                db_ok = False
                db_error = "Supabase client not initialized"
            else:
                client.table("conversations").select("guest_id").limit(1).execute()
        except Exception as exc:
            db_ok = False
            db_error = str(exc)[:300]
            logger.warning("Health check database probe failed: %s", exc)

    status = "healthy" if db_ok else "degraded"
    return HealthResponse(
        status=status,
        timestamp=datetime.utcnow(),
        database_type=db_type,
        database_ok=db_ok,
        database_error=db_error,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
