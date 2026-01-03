from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from app.core.config import get_settings
from app.models.schemas import HealthResponse
from app.api import chat, tickets, guests, agents, transcription

settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="AI-powered hotel communication API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(tickets.router, prefix=settings.api_prefix)
app.include_router(guests.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(transcription.router, prefix=settings.api_prefix)


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
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow()
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
