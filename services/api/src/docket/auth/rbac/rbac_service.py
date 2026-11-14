from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.rbac.rbac_gateway import RbacGateway
from docket.models import Role


class RbacService:
    """Permission checks for authenticated principals."""

    SHAREABLE_ROLE_NAMES = frozenset({"viewer", "commentor", "editor"})

    def __init__(self, db: Session) -> None:
        self._gateway = RbacGateway(db)

    def permissions_for_principal(self, principal: Principal) -> set[str]:
        user_perms = self._gateway.permission_codes_for_user(principal.user_id)
        if principal.token is None or principal.token.role_id is None:
            return user_perms
        token_perms = self._gateway.permission_codes_for_role(principal.token.role_id)
        return user_perms & token_perms

    def permissions_for_principal_on_task(
        self, principal: Principal, task_id: int
    ) -> set[str]:
        user_perms = self._gateway.permission_codes_for_task(
            principal.user_id, task_id
        )
        if principal.token is None or principal.token.role_id is None:
            return user_perms
        token_perms = self._gateway.permission_codes_for_role(principal.token.role_id)
        return user_perms & token_perms

    def principal_has_permission(self, principal: Principal, code: str) -> bool:
        return code in self.permissions_for_principal(principal)

    def principal_has_task_permission(
        self, principal: Principal, task_id: int, code: str
    ) -> bool:
        return code in self.permissions_for_principal_on_task(principal, task_id)

    def shareable_role_by_name(self, name: str) -> Role | None:
        if name not in self.SHAREABLE_ROLE_NAMES:
            return None
        return self._gateway.role_by_name(name)
