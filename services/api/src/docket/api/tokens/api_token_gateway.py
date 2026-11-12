from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import ApiToken, Role


class ApiTokenGateway:
    """Raw api_tokens / roles table access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, token_id: int) -> ApiToken | None:
        return self._db.get(ApiToken, token_id)

    def get_role(self, role_id: int) -> Role | None:
        return self._db.get(Role, role_id)

    def add(self, token: ApiToken) -> ApiToken:
        self._db.add(token)
        self._db.flush()
        return token

    def list_by_user_id(
        self, user_id: int, *, include_revoked: bool = False
    ) -> list[ApiToken]:
        stmt = select(ApiToken).where(ApiToken.user_id == user_id)
        if not include_revoked:
            stmt = stmt.where(ApiToken.revoked_at.is_(None))
        stmt = stmt.order_by(ApiToken.created_at.desc(), ApiToken.id.desc())
        return list(self._db.scalars(stmt).all())

    def list_roles(self) -> list[Role]:
        return list(self._db.scalars(select(Role).order_by(Role.name.asc())).all())

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, obj: object) -> None:
        self._db.refresh(obj)
