from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from docket import db as db_mod
from docket.auth.principal import Principal
from docket.config import get_settings
from docket.models import ApiToken, User
from docket.security import hash_api_token, load_session


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def resolve_principal_from_scope(scope: Scope) -> Principal | None:
    """Resolve session cookie or Bearer API token into a Principal."""
    request = Request(scope)
    settings = get_settings()
    # Use db_mod.SessionLocal (not a cached import) so tests can rebind the engine.
    db = db_mod.SessionLocal()
    try:
        auth = request.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            raw = auth[7:].strip()
            if not raw:
                return None
            token = db.scalar(
                select(ApiToken).where(
                    ApiToken.token_hash == hash_api_token(raw),
                    ApiToken.revoked_at.is_(None),
                )
            )
            if token is None:
                return None
            user = db.get(User, token.user_id)
            if user is None:
                return None
            token.last_used_at = _utcnow()
            db.commit()
            db.refresh(token)
            db.refresh(user)
            db.expunge(token)
            db.expunge(user)
            return Principal(user=user, token=token)

        cookie = request.cookies.get(settings.session_cookie)
        if not cookie:
            return None
        user_id = load_session(cookie)
        if user_id is None:
            return None
        user = db.get(User, user_id)
        if user is None:
            return None
        db.expunge(user)
        return Principal(user=user)
    finally:
        db.close()


class AuthnMiddleware:
    """Authenticate the caller; never authorize.

    Sets ``request.state.principal`` to a Principal or None.
    Invalid credentials yield None (routes decide 401 via require()).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        scope.setdefault("state", {})
        scope["state"]["principal"] = resolve_principal_from_scope(scope)
        await self.app(scope, receive, send)
