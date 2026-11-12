"""Seed system RBAC (idempotent)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import Permission, Role, RolePermission

PERMISSIONS: list[tuple[str, str]] = [
    ("tasks:read", "List and view tasks, events, and artifacts"),
    ("tasks:write", "Create and update tasks and links"),
    ("tasks:claim", "Claim and release tasks as an agent"),
    ("tasks:admin", "Archive, hard-delete, and manage others' tasks"),
    ("artifacts:write", "Attach artifacts to tasks"),
    ("tokens:manage", "Create and revoke API tokens"),
    ("users:admin", "Manage users and memberships"),
]

ROLES: dict[str, tuple[str, list[str]]] = {
    "owner": (
        "Full access",
        [
            "tasks:read",
            "tasks:write",
            "tasks:claim",
            "tasks:admin",
            "artifacts:write",
            "tokens:manage",
            "users:admin",
        ],
    ),
    "editor": (
        "Read/write tasks and artifacts; claim work",
        ["tasks:read", "tasks:write", "tasks:claim", "artifacts:write"],
    ),
    "viewer": (
        "Read-only",
        ["tasks:read"],
    ),
    "agent_worker": (
        "Agent token role: work tasks without admin/token management",
        ["tasks:read", "tasks:write", "tasks:claim", "artifacts:write"],
    ),
}


def seed_rbac(session: Session) -> None:
    perm_by_code: dict[str, Permission] = {}
    for code, description in PERMISSIONS:
        existing = session.scalar(select(Permission).where(Permission.code == code))
        if existing is None:
            existing = Permission(code=code, description=description)
            session.add(existing)
            session.flush()
        perm_by_code[code] = existing

    for name, (description, codes) in ROLES.items():
        role = session.scalar(select(Role).where(Role.name == name))
        if role is None:
            role = Role(name=name, description=description, is_system=True)
            session.add(role)
            session.flush()

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

    session.commit()
