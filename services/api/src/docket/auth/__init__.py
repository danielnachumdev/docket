"""Authentication and authorization."""

from docket.auth.authn_middleware import AuthnMiddleware
from docket.auth.permission_deps import (
    AuthenticatedPrincipal,
    OptionalPrincipal,
    RequirePermission,
    RequireUser,
    require,
    require_user,
)
from docket.auth.principal import Principal
from docket.auth.principal_resolver import PrincipalResolver, principal_resolver
from docket.auth.rbac import RbacService
from docket.auth.task_access_service import TaskAccessService

__all__ = [
    "AuthnMiddleware",
    "AuthenticatedPrincipal",
    "OptionalPrincipal",
    "Principal",
    "PrincipalResolver",
    "RbacService",
    "RequirePermission",
    "RequireUser",
    "TaskAccessService",
    "principal_resolver",
    "require",
    "require_user",
]
