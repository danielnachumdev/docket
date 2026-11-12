from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.rbac.rbac_gateway import RbacGateway


class RbacService:
    """Permission checks for authenticated principals."""

    def __init__(self, db: Session) -> None:
        self._gateway = RbacGateway(db)

    def permissions_for_principal(self, principal: Principal) -> set[str]:
        user_perms = self._gateway.permission_codes_for_user(principal.user_id)
        if principal.token is None or principal.token.role_id is None:
            return user_perms
        token_perms = self._gateway.permission_codes_for_role(principal.token.role_id)
        return user_perms & token_perms

    def principal_has_permission(self, principal: Principal, code: str) -> bool:
        return code in self.permissions_for_principal(principal)
