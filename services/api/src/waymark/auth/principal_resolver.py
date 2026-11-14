from starlette.requests import Request
from starlette.types import Scope

from waymark.auth.principal import Principal
from waymark.auth.strategies import (
    BearerTokenStrategy,
    PrincipalStrategy,
    SessionCookieStrategy,
)
from waymark.db.database import database


class PrincipalResolver:
    """Try principal strategies in order until one resolves."""

    def __init__(self, strategies: list[PrincipalStrategy] | None = None) -> None:
        self._strategies = strategies or [
            BearerTokenStrategy(),
            SessionCookieStrategy(),
        ]

    def resolve_from_scope(self, scope: Scope) -> Principal | None:
        request = Request(scope)
        db = database.SessionLocal()
        try:
            for strategy in self._strategies:
                principal = strategy.resolve(request, db)
                if principal is not None:
                    return principal
            return None
        finally:
            db.close()


principal_resolver = PrincipalResolver()
