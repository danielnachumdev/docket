from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from waymark import __version__

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "waymark"
    debug: bool = False
    database_url: str = f"sqlite:///{ROOT / 'data' / 'waymark.db'}"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    # Used when hashing API tokens (pepper). Override in deploy.
    token_pepper: str = "dev-only-change-me"
    # Signed session cookie secret. Override in deploy.
    session_secret: str = "dev-only-session-secret"
    session_cookie: str = "waymark_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    # Set True behind HTTPS (production / TLS edge). Leave False for local HTTP.
    session_cookie_secure: bool = False
    # Artifact blob storage: local (default) or gcs.
    artifact_storage: str = "local"
    artifact_local_root: str = str(ROOT / "data" / "artifacts")
    # Max decoded file payload for content_base64 create/replace.
    artifact_max_bytes: int = 10 * 1024 * 1024
    gcs_bucket: str = ""
    gcs_prefix: str = "artifacts"
    # Public GitHub repo used for "update available" checks.
    github_repo_owner: str = "danielnachumdev"
    github_repo_name: str = "waymark"
    version_check_cache_ttl_seconds: float = 900.0
    # Baked at image build (CD). Empty → package __version__ for local dev.
    waymark_version: str = ""
    # Per-API-token rate limit (Bearer agents only; session users exempt).
    # In-memory sliding window — single-process; multi-worker multiplies capacity.
    rate_limit_token_enabled: bool = True
    rate_limit_token_requests: int = 120
    rate_limit_token_window_seconds: int = 60
    rate_limit_public_share_enabled: bool = True
    rate_limit_public_share_requests: int = 60
    rate_limit_public_share_window_seconds: int = 60
    # Durable per-token request log (Bearer only). Path/method/status/IP/UA;
    # never stores Authorization or raw token values. Pruned on write.
    token_usage_log_enabled: bool = True
    token_usage_log_retention_days: int = 14
    token_usage_log_max_rows_per_token: int = 5000
    # SQLAlchemy QueuePool (SQLite file DBs use QueuePool in SQLAlchemy 2.1+).
    # Size for concurrent request peak; keep below Cloud SQL / PgBouncer caps when
    # using Postgres. Short pool_timeout fails fast (HTTP 503) instead of a long hang.
    db_pool_size: int = 15
    db_pool_max_overflow: int = 30
    db_pool_timeout_seconds: float = 5.0
    db_pool_recycle_seconds: int = 1800

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def running_version(self) -> str:
        baked = self.waymark_version.strip()
        return baked if baked else __version__


@lru_cache
def get_settings() -> Settings:
    return Settings()
