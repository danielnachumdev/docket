from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.requests import Request

from docket.auth.principal import Principal
from docket.auth.strategies.principal_strategy import PrincipalStrategy
from docket.models import ApiToken, User
from docket.security import api_token_hasher


class BearerTokenStrategy(PrincipalStrategy):
    def resolve(self, request: Request, db: Session) -> Principal | None:
        auth = request.headers.get("Authorization")
        if not auth or not auth.lower().startswith("bearer "):
            return None
        raw = auth[7:].strip()
        if not raw:
            return None
        token = db.scalar(
            select(ApiToken).where(
                ApiToken.token_hash == api_token_hasher.hash(raw),
                ApiToken.revoked_at.is_(None),
            )
        )
        if token is None:
            return None
        user = db.get(User, token.user_id)
        if user is None:
            return None
        token.last_used_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(token)
        db.refresh(user)
        db.expunge(token)
        db.expunge(user)
        return Principal(user=user, token=token)
