from sqlalchemy.orm import Session
from starlette.requests import Request

from docket.auth.principal import Principal
from docket.auth.strategies.principal_strategy import PrincipalStrategy
from docket.config import get_settings
from docket.models import User
from docket.security import session_codec


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
