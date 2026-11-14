from fastapi import APIRouter

from docket.api.preferences.preferences_service import PreferencesService
from docket.auth import AuthenticatedPrincipal
from docket.db import DbSession
from docket.schemas.preferences import UserPreferencesOut, UserPreferencesPatch


class PreferencesApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/me/preferences", tags=["preferences"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "",
            self.get_preferences,
            methods=["GET"],
            response_model=UserPreferencesOut,
        )
        self.router.add_api_route(
            "",
            self.patch_preferences,
            methods=["PATCH"],
            response_model=UserPreferencesOut,
        )

    def get_preferences(
        self, db: DbSession, principal: AuthenticatedPrincipal
    ) -> UserPreferencesOut:
        return PreferencesService(db).get(principal.user_id)

    def patch_preferences(
        self,
        body: UserPreferencesPatch,
        db: DbSession,
        principal: AuthenticatedPrincipal,
    ) -> UserPreferencesOut:
        return PreferencesService(db).patch(principal.user_id, body)


preferences_api = PreferencesApi()
