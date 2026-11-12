from sqlalchemy import and_, or_, select
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
        """Union of permissions from every membership (global and task)."""
        rows = self._db.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(Membership, Membership.role_id == Role.id)
            .where(Membership.user_id == user_id)
        ).all()
        return set(rows)

    def permission_codes_for_task(self, user_id: int, task_id: int) -> set[str]:
        """Global memberships plus memberships scoped to ``task_id``."""
        rows = self._db.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(Membership, Membership.role_id == Role.id)
            .where(
                Membership.user_id == user_id,
                or_(
                    Membership.scope_type == "global",
                    and_(
                        Membership.scope_type == "task",
                        Membership.scope_task_id == task_id,
                    ),
                ),
            )
        ).all()
        return set(rows)

    def role_by_name(self, name: str) -> Role | None:
        return self._db.scalar(select(Role).where(Role.name == name))
