from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import Permission, Role, RolePermission

PERMISSIONS: list[tuple[str, str]] = [
    ("tasks:read", "List and view tasks, events, and artifacts"),
    ("tasks:comment", "Add and edit own comments on tasks"),
    ("tasks:write", "Create and update tasks and links"),
    ("tasks:claim", "Claim and release tasks as an agent"),
    ("tasks:admin", "Archive, hard-delete, and manage others' tasks"),
    ("artifacts:write", "Attach artifacts to tasks"),
    ("tokens:manage", "Create and revoke API tokens"),
    ("webhooks:manage", "Create and manage outbound webhooks"),
    ("users:admin", "Manage users and memberships"),
]

ROLES: dict[str, tuple[str, list[str]]] = {
    "owner": (
        "Full access",
        [
            "tasks:read",
            "tasks:comment",
            "tasks:write",
            "tasks:claim",
            "tasks:admin",
            "artifacts:write",
            "tokens:manage",
            "webhooks:manage",
            "users:admin",
        ],
    ),
    "member": (
        "Invited user: own workspace without user admin",
        [
            "tasks:read",
            "tasks:comment",
            "tasks:write",
            "tasks:claim",
            "artifacts:write",
            "tokens:manage",
            "webhooks:manage",
        ],
    ),
    "editor": (
        "Read/write tasks and artifacts; claim work",
        [
            "tasks:read",
            "tasks:comment",
            "tasks:write",
            "tasks:claim",
            "artifacts:write",
        ],
    ),
    "commentor": (
        "Read tasks and leave comments",
        ["tasks:read", "tasks:comment"],
    ),
    "viewer": (
        "Read-only",
        ["tasks:read"],
    ),
    "agent_worker": (
        "Agent token role: work tasks without admin/token management",
        [
            "tasks:read",
            "tasks:comment",
            "tasks:write",
            "tasks:claim",
            "artifacts:write",
        ],
    ),
}


class RbacSeeder:
    """Idempotent system RBAC seed."""

    def seed(self, session: Session) -> None:
        perm_by_code = self._ensure_permissions(session)
        self._ensure_roles(session, perm_by_code)
        session.commit()

    def _ensure_permissions(self, session: Session) -> dict[str, Permission]:
        perm_by_code: dict[str, Permission] = {}
        for code, description in PERMISSIONS:
            existing = session.scalar(select(Permission).where(Permission.code == code))
            if existing is None:
                existing = Permission(code=code, description=description)
                session.add(existing)
                session.flush()
            perm_by_code[code] = existing
        return perm_by_code

    def _ensure_roles(
        self, session: Session, perm_by_code: dict[str, Permission]
    ) -> None:
        for name, (description, codes) in ROLES.items():
            role = session.scalar(select(Role).where(Role.name == name))
            if role is None:
                role = Role(name=name, description=description, is_system=True)
                session.add(role)
                session.flush()
            self._ensure_role_permissions(session, role, codes, perm_by_code)

    def _ensure_role_permissions(
        self,
        session: Session,
        role: Role,
        codes: list[str],
        perm_by_code: dict[str, Permission],
    ) -> None:
        for code in codes:
            perm = perm_by_code[code]
            link = session.scalar(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == perm.id,
                )
            )
            if link is None:
                session.add(RolePermission(role_id=role.id, permission_id=perm.id))


rbac_seeder = RbacSeeder()
