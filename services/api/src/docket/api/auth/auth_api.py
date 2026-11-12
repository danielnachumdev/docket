from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select

from docket.auth import AuthenticatedPrincipal, OptionalPrincipal
from docket.config import get_settings
from docket.deps import DbSession
from docket.models import Membership, Role, User
from docket.schemas import AuthStatusOut, BootstrapIn, LoginIn, UserOut
from docket.security import dump_session, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, user_id: int) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie,
        value=dump_session(user_id),
        httponly=True,
        samesite="lax",
        max_age=settings.session_max_age_seconds,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.session_cookie, path="/")


@router.get("/status", response_model=AuthStatusOut)
def auth_status(db: DbSession, principal: OptionalPrincipal) -> AuthStatusOut:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    user = principal.user if principal else None
    return AuthStatusOut(
        bootstrapped=count > 0,
        user=UserOut.model_validate(user) if user else None,
    )


@router.post("/bootstrap", response_model=UserOut)
def bootstrap(body: BootstrapIn, db: DbSession, response: Response) -> User:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    if count > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already bootstrapped")

    owner_role = db.scalar(select(Role).where(Role.name == "owner"))
    if owner_role is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "RBAC not seeded")

    email = body.email.strip().lower()
    user = User(
        email=email,
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    db.add(
        Membership(
            user_id=user.id,
            role_id=owner_role.id,
            scope_type="global",
            scope_task_id=None,
        )
    )
    db.commit()
    db.refresh(user)
    _set_session_cookie(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, db: DbSession, response: Response) -> User:
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.password_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    _set_session_cookie(response, user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    _clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(principal: AuthenticatedPrincipal) -> User:
    return principal.user
