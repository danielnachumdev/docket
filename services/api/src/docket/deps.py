from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.config import get_settings
from docket.db import get_db
from docket.models import Membership, Permission, Role, RolePermission, User
from docket.security import load_session

DbSession = Annotated[Session, Depends(get_db)]


def _cookie_name() -> str:
    return get_settings().session_cookie


def get_current_user(
    db: DbSession,
    docket_session: Annotated[str | None, Cookie(alias="docket_session")] = None,
) -> User:
    if not docket_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user_id = load_session(docket_session)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def get_optional_user(
    db: DbSession,
    docket_session: Annotated[str | None, Cookie(alias="docket_session")] = None,
) -> User | None:
    if not docket_session:
        return None
    user_id = load_session(docket_session)
    if user_id is None:
        return None
    return db.get(User, user_id)


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def user_has_permission(db: Session, user: User, code: str) -> bool:
    stmt = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(Membership, Membership.role_id == Role.id)
        .where(
            Membership.user_id == user.id,
            Membership.scope_type == "global",
            Permission.code == code,
        )
        .limit(1)
    )
    return db.scalar(stmt) is not None


def require_permission(db: Session, user: User, code: str) -> None:
    if not user_has_permission(db, user, code):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {code}")
