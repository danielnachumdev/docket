from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import Membership, Permission, Role, RolePermission


class RbacGateway:
    """Raw RBAC queries against the database."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def permission_codes_for_role(self, role_id: int) -> set[str]:
        rows = self._db.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
        ).all()
        return set(rows)

    def permission_codes_for_user(self, user_id: int) -> set[str]:
        rows = self._db.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(Membership, Membership.role_id == Role.id)
            .where(Membership.user_id == user_id, Membership.scope_type == "global")
        ).all()
        return set(rows)
