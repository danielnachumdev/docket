from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging

from waymark.config import Settings, get_settings
from waymark.db import database
from waymark.models import ApiTokenRequestLog
from waymark.token_usage.token_request_log_gateway import TokenRequestLogGateway

_log = logging.getLogger(__name__)

_METHOD_MAX = 16
_PATH_MAX = 512
_UA_MAX = 256


@dataclass(frozen=True)
class TokenRequestSnapshot:
    token_id: int
    method: str
    path: str
    status_code: int
    client_ip: str | None
    user_agent: str | None


class TokenUsageRecorder:
    """Persist one request log row and prune retention caps."""

    def __init__(self, *, settings: Settings | None = None) -> None:
        self._settings = settings

    def record(self, snapshot: TokenRequestSnapshot) -> None:
        cfg = self._settings if self._settings is not None else get_settings()
        if not cfg.token_usage_log_enabled:
            return
        db = database.SessionLocal()
        try:
            gateway = TokenRequestLogGateway(db)
            gateway.add(
                ApiTokenRequestLog(
                    token_id=snapshot.token_id,
                    method=self._clip(snapshot.method, _METHOD_MAX) or "GET",
                    path=self._clip(snapshot.path, _PATH_MAX) or "/",
                    status_code=int(snapshot.status_code),
                    client_ip=snapshot.client_ip,
                    user_agent=self._clip(snapshot.user_agent, _UA_MAX),
                )
            )
            self._prune(gateway, cfg, snapshot.token_id)
            gateway.commit()
        except Exception:
            _log.exception("token usage log write failed")
            db.rollback()
        finally:
            db.close()

    def _prune(
        self, gateway: TokenRequestLogGateway, cfg: Settings, token_id: int
    ) -> None:
        days = max(1, cfg.token_usage_log_retention_days)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        gateway.delete_older_than(cutoff)
        gateway.delete_oldest_excess(
            token_id, keep=max(0, cfg.token_usage_log_max_rows_per_token)
        )

    @staticmethod
    def _clip(value: str | None, max_len: int) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        return cleaned[:max_len]
