from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from docket import __version__

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "docket"
    debug: bool = False
    database_url: str = f"sqlite:///{ROOT / 'data' / 'docket.db'}"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    # Used when hashing API tokens (pepper). Override in deploy.
    token_pepper: str = "dev-only-change-me"
    # Signed session cookie secret. Override in deploy.
    session_secret: str = "dev-only-session-secret"
    session_cookie: str = "docket_session"
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
    github_repo_name: str = "docket"
    version_check_cache_ttl_seconds: float = 900.0
    # Baked at image build (CD). Empty → package __version__ for local dev.
    docket_version: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def running_version(self) -> str:
        baked = self.docket_version.strip()
        return baked if baked else __version__


@lru_cache
def get_settings() -> Settings:
    return Settings()
