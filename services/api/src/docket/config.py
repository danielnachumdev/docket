from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
