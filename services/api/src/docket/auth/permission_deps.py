from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.rbac.rbac_service import RbacService
from docket.db.database import database


class OptionalPrincipalDep:
    def __call__(self, request: Request) -> Principal | None:
        return getattr(request.state, "principal", None)


class RequireUser:
    """Authn only: principal must exist (human session or agent token)."""

    def __call__(self, request: Request) -> Principal:
        principal = getattr(request.state, "principal", None)
        if principal is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        return principal


class RequirePermission:
    """Authz: principal must exist and hold the named permission."""

    def __init__(self, permission: str) -> None:
        self._permission = permission

    def __call__(
        self,
        request: Request,
        db: Annotated[Session, Depends(database.get_db)],
    ) -> Principal:
        principal = getattr(request.state, "principal", None)
        if principal is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        if not RbacService(db).principal_has_permission(principal, self._permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Missing permission: {self._permission}",
            )
        return principal


require = RequirePermission
require_user = RequireUser

OptionalPrincipal = Annotated[Principal | None, Depends(OptionalPrincipalDep())]
AuthenticatedPrincipal = Annotated[Principal, Depends(RequireUser())]
