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
    
    # OpenRouter settings for Gemini
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    
    # LLM settings
    llm_model: str = "google/gemini-2.0-flash-exp:free"
    llm_max_tokens: int = 2048
    llm_temperature: float = 0.7
    
    # Rate limiting
    rate_limit_requests: int = 60
    rate_limit_window: int = 60  # seconds
    
    # Whisper settings
    whisper_model_size: str = os.getenv("WHISPER_MODEL_SIZE", "small")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


_settings_instance: Settings | None = None

def get_settings() -> Settings:
    """Get settings instance (singleton pattern)."""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance
