"""Authentication and authorization."""

from waymark.auth.authn_middleware import AuthnMiddleware
from waymark.auth.permission_deps import (
    AuthenticatedPrincipal,
    OptionalPrincipal,
    RequirePermission,
    RequireUser,
    require,
    require_user,
)
from waymark.auth.principal import Principal
from waymark.auth.principal_resolver import PrincipalResolver, principal_resolver
from waymark.auth.rbac import RbacService
from waymark.auth.task_access_service import TaskAccessService

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
