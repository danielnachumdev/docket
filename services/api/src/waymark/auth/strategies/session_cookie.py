from sqlalchemy.orm import Session
from starlette.requests import Request

from waymark.auth.principal import Principal
from waymark.auth.strategies.principal_strategy import PrincipalStrategy
from waymark.config import get_settings
from waymark.models import User
from waymark.security import session_codec


class SessionCookieStrategy(PrincipalStrategy):
    def resolve(self, request: Request, db: Session) -> Principal | None:
        settings = get_settings()
        cookie = request.cookies.get(settings.session_cookie)
        if not cookie:
            return None
        user_id = session_codec.load(cookie)
        if user_id is None:
            return None
        user = db.get(User, user_id)
        if user is None:
            return None
        db.expunge(user)
        return Principal(user=user)
