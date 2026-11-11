"""ZenLyft Ascension runtime configuration — 100% cloud-first with ₹0 spending guard."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AscensionSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="cloud-free", alias="ASCENSION_ENV")
    service_name: str = "zenlyft-ascension"
    host: str = "0.0.0.0"
    port: int = Field(default=7860, alias="PORT")

    # Database: Supabase PostgreSQL URI in cloud, SQLite URL only for CI/offline unit tests
    database_url: str = Field(default="", alias="ASCENSION_DATABASE_URL")
    supabase_url: str = Field(default="", alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    # Strict ₹0 cost control — never silently invoke paid tiers
    allow_paid_fallback: bool = Field(default=False, alias="ALLOW_PAID_FALLBACK")
    default_provider: str = Field(default="groq", alias="ASCENSION_DEFAULT_PROVIDER")
    task_token_budget_default: int = Field(default=12000, alias="ASCENSION_TASK_TOKEN_BUDGET")
    monthly_budget_usd: float = Field(default=0.0, alias="ASCENSION_MONTHLY_BUDGET_USD")

    # Provider API credentials (environment variables only — never hardcoded)
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    deepseek_api_key: str = Field(default="", alias="DEEPSEEK_API_KEY")
    kimi_api_key: str = Field(default="", alias="KIMI_API_KEY")
    glm_api_key: str = Field(default="", alias="GLM_API_KEY")
    ollama_base_url: str = Field(default="", alias="OLLAMA_BASE_URL")
    geni_model_endpoint: str = Field(default="", alias="GENI_MODEL_ENDPOINT")
    geni_api_key: str = Field(default="", alias="GENI_API_KEY")

    # Execution & Concurrency Limits (59 logical roles, bounded active slots)
    max_concurrent_agents: int = Field(default=5, alias="ASCENSION_MAX_CONCURRENT_AGENTS")
    max_delegation_depth: int = Field(default=3, alias="ASCENSION_MAX_DELEGATION_DEPTH")
    max_task_iterations: int = Field(default=10, alias="ASCENSION_MAX_TASK_ITERATIONS")
    task_timeout_seconds: int = Field(default=90, alias="ASCENSION_TASK_TIMEOUT_SECONDS")

    # External Automation & Security
    ascension_api_secret: str = Field(default="", alias="ASCENSION_API_SECRET")
    n8n_webhook_secret: str = Field(default="", alias="N8N_WEBHOOK_SECRET")
    n8n_outbound_webhook_url: str = Field(default="", alias="N8N_OUTBOUND_WEBHOOK_URL")
    orchester_url: str = Field(default="", alias="ORCHESTER_URL")
    orchester_api_key: str = Field(default="", alias="ORCHESTER_API_KEY")
    paperclip_api_url: str = Field(default="", alias="PAPERCLIP_API_URL")
    paperclip_api_key: str = Field(default="", alias="PAPERCLIP_API_KEY")
    paperclip_company_id: str = Field(default="", alias="PAPERCLIP_COMPANY_ID")
    paperclip_webhook_secret: str = Field(default="", alias="PAPERCLIP_WEBHOOK_SECRET")
    ascension_public_url: str = Field(default="", alias="ASCENSION_PUBLIC_URL")
    allow_private_http: bool = Field(default=False, alias="ALLOW_PRIVATE_HTTP")


@lru_cache(maxsize=1)
def get_settings() -> AscensionSettings:
    """Return cached runtime settings."""
    return AscensionSettings()
