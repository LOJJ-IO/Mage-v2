import os
from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App settings
    app_name: str = "Mage API"
    debug: bool = True
    
    # API settings
    api_prefix: str = "/api"
    
    # CORS settings
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Database settings
    database_type: str = os.getenv("DATABASE_TYPE", "mock")
    
    @field_validator("database_type")
    @classmethod
    def validate_database_type(cls, v: str) -> str:
        """Validate database_type is either 'mock' or 'supabase'."""
        valid_types = {"mock", "supabase"}
        if v.lower() not in valid_types:
            raise ValueError(f"database_type must be one of {valid_types}, got '{v}'")
        return v.lower()
    
    # Supabase settings
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_KEY", "")
    
    # OpenRouter settings (any compatible model; see https://openrouter.ai/docs#models)
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    
    # LLM settings (BOT context only). Use openrouter/auto to let OpenRouter pick the model (see https://openrouter.ai/docs/guides/routing/routers/auto-router).
    llm_model: str = os.getenv("LLM_MODEL", "openrouter/auto")
    llm_model_small: str = os.getenv("LLM_MODEL_SMALL", "openrouter/auto")
    llm_model_large: str = os.getenv("LLM_MODEL_LARGE", "openrouter/auto")
    # Optional: restrict Auto Router to these patterns (e.g. google/* for free Geminis). Comma-separated; empty = no restriction.
    llm_auto_allowed_models: str = os.getenv("LLM_AUTO_ALLOWED_MODELS", "")
    # Comma-separated list of model IDs to try when the primary model returns 404/unavailable
    llm_model_fallbacks: str = os.getenv(
        "LLM_MODEL_FALLBACKS",
        "google/gemini-2.0-flash-exp:free,google/gemini-flash-1.5:free,google/gemini-flash-1.5-8b:free,qwen/qwen-2.5-7b-instruct:free",
    )
    llm_max_tokens: int = 2048
    llm_temperature: float = 0.7
    
    # Rate limiting
    rate_limit_requests: int = 60
    rate_limit_window: int = 60  # seconds
    
    # Whisper settings (tiny | base | small | medium | large; tiny = smallest/fastest download)
    whisper_model_size: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    
    # Hotel context for small model (Option 3: hotel-specific prompt + knowledge)
    hotel_name: str = os.getenv("HOTEL_NAME", "Mage Hotel")
    hotel_knowledge_path: str = os.getenv("HOTEL_KNOWLEDGE_PATH", "")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
