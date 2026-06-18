import os
from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


def _strip_url_scheme(host: str) -> str:
    return host.replace("https://", "").replace("http://", "").strip().rstrip("/")


def resolve_frontend_url(
    *,
    request_host: str | None = None,
    forwarded_host: str | None = None,
    forwarded_proto: str | None = None,
) -> str:
    """
    Public site URL for magic links.

    Priority: FRONTEND_URL env → request Host/X-Forwarded-Host (what the guest typed)
    → VERCEL_PROJECT_PRODUCTION_URL (stable prod alias) → VERCEL_URL (deployment id URL).
    """
    explicit = (os.getenv("FRONTEND_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")

    for host in (forwarded_host, request_host):
        cleaned = (host or "").split(",")[0].strip()
        if not cleaned or cleaned.startswith("127.0.0.1") or cleaned.startswith("localhost"):
            continue
        proto = (forwarded_proto or "https").split(",")[0].strip() or "https"
        return f"{proto}://{cleaned}"

    production = (os.getenv("VERCEL_PROJECT_PRODUCTION_URL") or "").strip()
    if production:
        return f"https://{_strip_url_scheme(production)}"

    # Last resort: unique per-deployment hostname (e.g. lojj-ecrbixun1-....vercel.app)
    vercel = (os.getenv("VERCEL_URL") or "").strip()
    if vercel:
        return f"https://{_strip_url_scheme(vercel)}"
    return "http://localhost:3000"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App settings
    app_name: str = "Mage API"
    debug: bool = os.getenv("DEBUG", "true").lower() not in ("0", "false", "no", "off")
    
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
    llm_model_thinking: str = os.getenv("LLM_MODEL_THINKING", "")
    # Optional: restrict Auto Router to these patterns (e.g. google/* for free Geminis). Comma-separated; empty = no restriction.
    llm_auto_allowed_models: str = os.getenv("LLM_AUTO_ALLOWED_MODELS", "")
    # Comma-separated list of model IDs to try when the primary model returns 404/unavailable
    llm_model_fallbacks: str = os.getenv(
        "LLM_MODEL_FALLBACKS",
        "google/gemini-2.0-flash-exp:free,google/gemini-flash-1.5:free,google/gemini-flash-1.5-8b:free,qwen/qwen-2.5-7b-instruct:free",
    )
    llm_max_tokens: int = int(os.getenv("LLM_MAX_TOKENS", "2048"))
    llm_max_tokens_small: int = int(os.getenv("LLM_MAX_TOKENS_SMALL", "384"))
    llm_max_tokens_large: int = int(os.getenv("LLM_MAX_TOKENS_LARGE", "768"))
    llm_temperature: float = 0.7
    llm_request_timeout_small: float = float(os.getenv("LLM_REQUEST_TIMEOUT_SMALL", "25"))
    llm_request_timeout_large: float = float(os.getenv("LLM_REQUEST_TIMEOUT_LARGE", "45"))
    # Two-layer routing: JSON classifier + prose copy writer
    llm_classifier_models: str = os.getenv(
        "LLM_CLASSIFIER_MODELS", "openrouter/free,openrouter/auto"
    )
    llm_model_classifier: str = os.getenv("LLM_MODEL_CLASSIFIER", "")
    classifier_prompt_path: str = os.getenv(
        "CLASSIFIER_PROMPT_PATH", "prompts/classifier.txt"
    )
    llm_classifier_prompt_cache: bool = os.getenv(
        "LLM_CLASSIFIER_PROMPT_CACHE", "false"
    ).lower() in ("1", "true", "yes")
    llm_copy_model: str = os.getenv("LLM_COPY_MODEL", "openrouter/free")
    llm_max_tokens_classifier: int = int(os.getenv("LLM_MAX_TOKENS_CLASSIFIER", "380"))
    llm_max_tokens_copy: int = int(os.getenv("LLM_MAX_TOKENS_COPY", "400"))
    llm_classifier_min_confidence: float = float(
        os.getenv("LLM_CLASSIFIER_MIN_CONFIDENCE", "0.39")
    )
    llm_classifier_history_turns: int = int(os.getenv("LLM_CLASSIFIER_HISTORY_TURNS", "2"))
    # Substrings; resolved classifier models matching these are skipped (retry next tier model).
    # LFM2.5: bad JSON/schema copy. GPT-5 Nano: 64-tok length. Nemotron Nano 9B V2: truncates tree JSON.
    llm_classifier_disqualified_models: str = os.getenv(
        "LLM_CLASSIFIER_DISQUALIFIED_MODELS",
        "lfm-2.5,lfm2.5,liquid/lfm,gpt-5-nano,openai/gpt-5-nano,"
        "nemotron-nano-9b-v2,nemotron-nano-9b,nemotron-nano,nvidia/nemotron",
    )
    llm_use_two_layer_routing: bool = os.getenv(
        "LLM_USE_TWO_LAYER_ROUTING", "true"
    ).lower() in ("1", "true", "yes")
    # Copy writer: use classifier JSON + gist instead of replaying full chat (faster for thinking models)
    llm_copy_include_full_history: bool = os.getenv(
        "LLM_COPY_INCLUDE_FULL_HISTORY", "false"
    ).lower() in ("1", "true", "yes")
    
    # Rate limiting
    rate_limit_requests: int = 60
    rate_limit_window: int = 60  # seconds
    
    # Transcription: auto | local | openai (auto = local if Whisper installed, else OpenAI on Vercel)
    transcription_provider: str = os.getenv("TRANSCRIPTION_PROVIDER", "auto")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_transcription_model: str = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
    # Local Whisper only (tiny | base | small | medium | large)
    whisper_model_size: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    
    # Hotel context for small model (Option 3: hotel-specific prompt + knowledge)
    hotel_name: str = os.getenv("HOTEL_NAME", "Mage Hotel")
    hotel_knowledge_path: str = os.getenv("HOTEL_KNOWLEDGE_PATH", "")
    default_weather_location: str = os.getenv("DEFAULT_WEATHER_LOCATION", "Edmonton")
    hotel_timezone: str = os.getenv("HOTEL_TIMEZONE", "America/Edmonton")
    hotel_front_desk_phone: str = os.getenv("HOTEL_FRONT_DESK_PHONE", "")

    # Google Places API key for hotel pre-enrichment (optional).
    google_places_api_key: str = os.getenv("GOOGLE_PLACES_API_KEY", "")

    # Crawl/browser fallback settings
    crawl_playwright_enabled: bool = os.getenv(
        "CRAWL_PLAYWRIGHT_ENABLED", "true"
    ).lower() in ("1", "true", "yes")
    crawl_playwright_timeout_ms: int = int(
        os.getenv("CRAWL_PLAYWRIGHT_TIMEOUT_MS", "20000")
    )
    crawl_playwright_wait_ms: int = int(os.getenv("CRAWL_PLAYWRIGHT_WAIT_MS", "1200"))

    # Firecrawl API — paid final fallback for blocked hotel/OTA pages (optional).
    firecrawl_api_key: str = os.getenv("FIRECRAWL_API_KEY", "")
    crawl_firecrawl_enabled: bool = os.getenv(
        "CRAWL_FIRECRAWL_ENABLED", "false"
    ).lower() in ("1", "true", "yes")
    # Pause between crawl/discover HTTP requests (seconds) to avoid rate limits.
    crawl_request_delay_sec: float = float(os.getenv("CRAWL_REQUEST_DELAY_SEC", "1.5"))
    # When false, discovery uses only pasted seed URL(s) + links found on the seed page.
    crawl_discover_sitemap: bool = os.getenv(
        "CRAWL_DISCOVER_SITEMAP", "false"
    ).lower() in ("1", "true", "yes")

    staff_access_key: str = os.getenv("STAFF_ACCESS_KEY", "mage-staff-dev")

    # Analytics dashboard
    metrics_tracking_enabled: bool = os.getenv(
        "METRICS_TRACKING_ENABLED", "false"
    ).lower() in ("1", "true", "yes")
    dashboard_access_key: str = os.getenv("DASHBOARD_ACCESS_KEY", "lojj-dash-dev")
    metrics_labor_cost_per_call: float = float(
        os.getenv("METRICS_LABOR_COST_PER_CALL", "8.00")
    )
    metrics_avg_call_minutes: float = float(
        os.getenv("METRICS_AVG_CALL_MINUTES", "5")
    )
    metrics_happiness_threshold: int = int(
        os.getenv("METRICS_HAPPINESS_THRESHOLD", "70")
    )

    # Multi-tenant / property scope (single-hotel pilots set PROPERTY_ID)
    property_id: str = os.getenv("PROPERTY_ID", "grand-horizon")

    # Guest auth
    auth_secret: str = os.getenv("AUTH_SECRET", "")
    auth_token_ttl_hours: int = int(os.getenv("AUTH_TOKEN_TTL_HOURS", "48"))
    session_ttl_hours: int = int(os.getenv("SESSION_TTL_HOURS", "168"))
    stay_grace_hours: int = int(os.getenv("STAY_GRACE_HOURS", "12"))
    frontend_url: str = resolve_frontend_url()
    email_provider: str = os.getenv("EMAIL_PROVIDER", "")
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    resend_from_email: str = os.getenv("RESEND_FROM_EMAIL", "noreply@lojj.io")
    allow_dev_guest_login: bool = os.getenv(
        "ALLOW_DEV_GUEST_LOGIN", os.getenv("DEBUG", "true")
    ).lower() in ("1", "true", "yes")
    webhook_secret: str = os.getenv("WEBHOOK_SECRET", "")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
