from fastapi import APIRouter, Response, status

from docket.auth import AuthenticatedPrincipal, OptionalPrincipal
from docket.api.auth.auth_service import AuthService
from docket.config import get_settings
from docket.db import DbSession
from docket.models import User
from docket.schemas import AuthStatusOut, BootstrapIn, LoginIn, UserOut
from docket.security import session_codec


class AuthApi:
    def __init__(self, service: AuthService | None = None) -> None:
        self._service = service or AuthService()
        self.router = APIRouter(prefix="/api/auth", tags=["auth"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/status",
            self.status,
            methods=["GET"],
            response_model=AuthStatusOut,
        )
        self.router.add_api_route(
            "/bootstrap",
            self.bootstrap,
            methods=["POST"],
            response_model=UserOut,
        )
        self.router.add_api_route(
            "/login",
            self.login,
            methods=["POST"],
            response_model=UserOut,
        )
        self.router.add_api_route(
            "/logout",
            self.logout,
            methods=["POST"],
            status_code=status.HTTP_204_NO_CONTENT,
        )
        self.router.add_api_route(
            "/me",
            self.me,
            methods=["GET"],
            response_model=UserOut,
        )

    def status(
        self, db: DbSession, principal: OptionalPrincipal
    ) -> AuthStatusOut:
        return self._service.status(db, principal)

    def bootstrap(
        self, body: BootstrapIn, db: DbSession, response: Response
    ) -> User:
        user = self._service.bootstrap(db, body)
        self._set_session_cookie(response, user.id)
        return user

    def login(self, body: LoginIn, db: DbSession, response: Response) -> User:
        user = self._service.login(db, body)
        self._set_session_cookie(response, user.id)
        return user

    def logout(self, response: Response) -> None:
        self._clear_session_cookie(response)

    def me(self, principal: AuthenticatedPrincipal) -> User:
        return principal.user

    def _set_session_cookie(self, response: Response, user_id: int) -> None:
        settings = get_settings()
        response.set_cookie(
            key=settings.session_cookie,
            value=session_codec.dump(user_id),
            httponly=True,
            secure=settings.session_cookie_secure,
            samesite="lax",
            max_age=settings.session_max_age_seconds,
            path="/",
        )

    def _clear_session_cookie(self, response: Response) -> None:
        settings = get_settings()
        response.delete_cookie(
            settings.session_cookie,
            path="/",
            secure=settings.session_cookie_secure,
            httponly=True,
            samesite="lax",
        )


auth_api = AuthApi()
