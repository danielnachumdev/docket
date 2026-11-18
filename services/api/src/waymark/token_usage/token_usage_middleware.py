from starlette.types import ASGIApp, Receive, Scope, Send

from waymark.auth.principal import Principal
from waymark.config import Settings, get_settings
from waymark.token_usage.client_ip import ClientIp
from waymark.token_usage.token_usage_recorder import (
    TokenRequestSnapshot,
    TokenUsageRecorder,
)


class TokenUsageMiddleware:
    """After Authn: record successful Bearer-token requests (incl. 429)."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        settings: Settings | None = None,
        recorder: TokenUsageRecorder | None = None,
    ) -> None:
        self.app = app
        cfg = settings if settings is not None else get_settings()
        self._enabled = cfg.token_usage_log_enabled
        self._recorder = recorder or TokenUsageRecorder(settings=cfg)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self._enabled:
            await self.app(scope, receive, send)
            return
        principal = self._principal_from_scope(scope)
        if principal is None or principal.token_id is None:
            await self.app(scope, receive, send)
            return

        snapshot_base = self._snapshot_base(scope, principal.token_id)
        recorded = False

        async def send_and_record(message: dict) -> None:
            nonlocal recorded
            if message["type"] == "http.response.start" and not recorded:
                recorded = True
                self._recorder.record(
                    TokenRequestSnapshot(
                        token_id=snapshot_base.token_id,
                        method=snapshot_base.method,
                        path=snapshot_base.path,
                        status_code=int(message["status"]),
                        client_ip=snapshot_base.client_ip,
                        user_agent=snapshot_base.user_agent,
                    )
                )
            await send(message)

        await self.app(scope, receive, send_and_record)

    def _snapshot_base(self, scope: Scope, token_id: int) -> TokenRequestSnapshot:
        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1", errors="replace")
            for key, value in (scope.get("headers") or ())
        }
        return TokenRequestSnapshot(
            token_id=token_id,
            method=str(scope.get("method") or "GET"),
            path=str(scope.get("path") or "/"),
            status_code=0,
            client_ip=ClientIp.from_scope(scope),
            user_agent=headers.get("user-agent"),
        )

    def _principal_from_scope(self, scope: Scope) -> Principal | None:
        state = scope.get("state")
        if state is None:
            return None
        if isinstance(state, dict):
            value = state.get("principal")
        else:
            value = getattr(state, "principal", None)
        return value if isinstance(value, Principal) else None
