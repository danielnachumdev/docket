from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from waymark.auth.principal import Principal
from waymark.config import Settings, get_settings
from waymark.rate_limit.ip_rate_limiter import IpRateLimiter
from waymark.rate_limit.rate_limit_decision import RateLimitDecision
from waymark.rate_limit.token_rate_limiter import TokenRateLimiter
from waymark.token_usage.client_ip import ClientIp

_EXEMPT_PATHS = frozenset({"/api/health"})
_PUBLIC_SHARE_PREFIX = "/api/public/shares/"


class RateLimitMiddleware:
    """Enforce per-API-token ceilings and public-share IP ceilings after Authn."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        settings: Settings | None = None,
        limiter: TokenRateLimiter | None = None,
        public_limiter: IpRateLimiter | None = None,
    ) -> None:
        self.app = app
        cfg = settings if settings is not None else get_settings()
        self._enabled = cfg.rate_limit_token_enabled
        self._limiter = limiter or TokenRateLimiter(
            max_requests=cfg.rate_limit_token_requests,
            window_seconds=cfg.rate_limit_token_window_seconds,
        )
        self._public_enabled = cfg.rate_limit_public_share_enabled
        self._public_limiter = public_limiter or IpRateLimiter(
            max_requests=cfg.rate_limit_public_share_requests,
            window_seconds=cfg.rate_limit_public_share_window_seconds,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path") or ""
        if path in _EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        if path.startswith(_PUBLIC_SHARE_PREFIX):
            await self._limit_public_share(scope, receive, send)
            return
        if not self._enabled:
            await self.app(scope, receive, send)
            return
        principal = self._principal_from_scope(scope)
        if principal is None or principal.token_id is None:
            await self.app(scope, receive, send)
            return
        decision = self._limiter.check(principal.token_id)
        if not decision.allowed:
            response = self._too_many_requests(decision, detail="Rate limit exceeded for API token")
            await response(scope, receive, send)
            return
        await self._call_with_headers(scope, receive, send, decision)

    async def _limit_public_share(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self._public_enabled:
            await self.app(scope, receive, send)
            return
        client_ip = ClientIp.from_scope(scope) or "unknown"
        decision = self._public_limiter.check(client_ip)
        if not decision.allowed:
            response = self._too_many_requests(decision, detail="Rate limit exceeded for public share")
            await response(scope, receive, send)
            return
        await self._call_with_headers(scope, receive, send, decision)

    async def _call_with_headers(self, scope, receive, send, decision):
        async def send_with_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(self._asgi_rate_limit_headers(decision))
                message = {**message, "headers": headers}
            await send(message)
        await self.app(scope, receive, send_with_headers)

    def _principal_from_scope(self, scope: Scope) -> Principal | None:
        state = scope.get("state")
        if state is None:
            return None
        value = state.get("principal") if isinstance(state, dict) else getattr(state, "principal", None)
        return value if isinstance(value, Principal) else None

    def _too_many_requests(self, decision: RateLimitDecision, *, detail: str) -> Response:
        return JSONResponse(
            status_code=429,
            content={"detail": detail, "retry_after": decision.retry_after_seconds},
            headers={
                "Retry-After": str(decision.retry_after_seconds),
                "X-RateLimit-Limit": str(decision.limit),
                "X-RateLimit-Remaining": str(decision.remaining),
            },
        )

    def _asgi_rate_limit_headers(self, decision: RateLimitDecision) -> list[tuple[bytes, bytes]]:
        return [
            (b"x-ratelimit-limit", str(decision.limit).encode()),
            (b"x-ratelimit-remaining", str(decision.remaining).encode()),
        ]
