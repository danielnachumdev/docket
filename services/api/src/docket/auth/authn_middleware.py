from starlette.types import ASGIApp, Receive, Scope, Send

from docket.auth.principal_resolver import principal_resolver


class AuthnMiddleware:
    """Authenticate the caller; never authorize.

    Sets ``request.state.principal`` to a Principal or None.
    Invalid credentials yield None (routes decide 401 via RequirePermission).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        scope.setdefault("state", {})
        scope["state"]["principal"] = principal_resolver.resolve_from_scope(scope)
        await self.app(scope, receive, send)
