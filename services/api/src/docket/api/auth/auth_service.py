from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.rbac import RbacGateway
from docket.models import Membership, Role, User
from docket.schemas import AuthStatusOut, BootstrapIn, LoginIn, UserOut
from docket.security import password_hasher, password_policy


class AuthService:
    def status(self, db: Session, principal: Principal | None) -> AuthStatusOut:
        count = db.scalar(select(func.count()).select_from(User)) or 0
        user = principal.user if principal else None
        permissions: list[str] = []
        if principal is not None:
            permissions = sorted(RbacGateway(db).permission_codes_for_user(principal.user_id))
        return AuthStatusOut(
            bootstrapped=count > 0,
            user=UserOut.model_validate(user) if user else None,
            permissions=permissions,
        )

    def bootstrap(self, db: Session, body: BootstrapIn) -> User:
        count = db.scalar(select(func.count()).select_from(User)) or 0
        if count > 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "Already bootstrapped")

        email = body.email.strip().lower()
        password_policy.validate(body.password, email=email)

        owner_role = db.scalar(select(Role).where(Role.name == "owner"))
        if owner_role is None:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "RBAC not seeded")

        user = User(
            email=email,
            display_name=body.display_name.strip(),
            password_hash=password_hasher.hash(body.password),
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
        return user

    def login(self, db: Session, body: LoginIn) -> User:
        email = body.email.strip().lower()
        user = db.scalar(select(User).where(User.email == email))
        if user is None or not user.password_hash:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
        if not password_hasher.verify(body.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
        return user
