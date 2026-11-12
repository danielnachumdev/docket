from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.models import Membership, Permission, Role, RolePermission


def _permission_codes_for_role(db: Session, role_id: int) -> set[str]:
    rows = db.scalars(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role_id)
    ).all()
    return set(rows)


def permission_codes_for_user(db: Session, user_id: int) -> set[str]:
    rows = db.scalars(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(Membership, Membership.role_id == Role.id)
        .where(Membership.user_id == user_id, Membership.scope_type == "global")
    ).all()
    return set(rows)


def principal_permissions(db: Session, principal: Principal) -> set[str]:
    user_perms = permission_codes_for_user(db, principal.user_id)
    if principal.token is None or principal.token.role_id is None:
        return user_perms
    token_perms = _permission_codes_for_role(db, principal.token.role_id)
    return user_perms & token_perms


def principal_has_permission(db: Session, principal: Principal, code: str) -> bool:
    return code in principal_permissions(db, principal)
