from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.rbac import principal_has_permission
from docket.db import get_db


def get_optional_principal(request: Request) -> Principal | None:
    return getattr(request.state, "principal", None)


def require_user() -> Callable[..., Principal]:
    """Authn only: principal must exist (human session or agent token)."""

    def _dep(request: Request) -> Principal:
        principal = get_optional_principal(request)
        if principal is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        return principal

    return _dep


def require(permission: str) -> Callable[..., Principal]:
    """Authz: principal must exist and hold ``permission``."""

    def _dep(
        request: Request,
        db: Annotated[Session, Depends(get_db)],
    ) -> Principal:
        principal = get_optional_principal(request)
        if principal is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        if not principal_has_permission(db, principal, permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"Missing permission: {permission}"
            )
        return principal

    return _dep


OptionalPrincipal = Annotated[Principal | None, Depends(get_optional_principal)]
AuthenticatedPrincipal = Annotated[Principal, Depends(require_user())]
