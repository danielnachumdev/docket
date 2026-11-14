from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from docket.auth.principal import Principal
from docket.config import Settings, get_settings
from docket.rate_limit.rate_limit_decision import RateLimitDecision
from docket.rate_limit.token_rate_limiter import TokenRateLimiter

_EXEMPT_PATHS = frozenset({"/api/health"})


class RateLimitMiddleware:
    """Enforce per-API-token request ceilings after AuthnMiddleware.

    Session/cookie humans are excluded from this limiter; only Bearer-token
    principals (``principal.token_id`` set) are counted. Pathological floods
    for everyone are left to the nginx IP safety net.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        settings: Settings | None = None,
        limiter: TokenRateLimiter | None = None,
    ) -> None:
        self.app = app
        cfg = settings if settings is not None else get_settings()
        self._enabled = cfg.rate_limit_token_enabled
        self._limiter = limiter or TokenRateLimiter(
            max_requests=cfg.rate_limit_token_requests,
            window_seconds=cfg.rate_limit_token_window_seconds,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self._enabled:
            await self.app(scope, receive, send)
            return
        if scope.get("path") in _EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        principal = self._principal_from_scope(scope)
        if principal is None or principal.token_id is None:
            await self.app(scope, receive, send)
            return
        decision = self._limiter.check(principal.token_id)
        if not decision.allowed:
            response = self._too_many_requests(decision)
            await response(scope, receive, send)
            return
        await self._call_with_headers(scope, receive, send, decision)

    async def _call_with_headers(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        decision: RateLimitDecision,
    ) -> None:
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
        if isinstance(state, dict):
            value = state.get("principal")
        else:
            value = getattr(state, "principal", None)
        return value if isinstance(value, Principal) else None

    def _too_many_requests(self, decision: RateLimitDecision) -> Response:
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit exceeded for API token",
                "retry_after": decision.retry_after_seconds,
            },
            headers={
                "Retry-After": str(decision.retry_after_seconds),
                "X-RateLimit-Limit": str(decision.limit),
                "X-RateLimit-Remaining": str(decision.remaining),
            },
        )

    def _asgi_rate_limit_headers(
        self, decision: RateLimitDecision
    ) -> list[tuple[bytes, bytes]]:
        return [
            (b"x-ratelimit-limit", str(decision.limit).encode()),
            (b"x-ratelimit-remaining", str(decision.remaining).encode()),
        ]
