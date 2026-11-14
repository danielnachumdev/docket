from fastapi import APIRouter

from waymark.api.preferences.preferences_service import PreferencesService
from waymark.auth import AuthenticatedPrincipal
from waymark.db import DbSession
from waymark.schemas.preferences import UserPreferencesOut, UserPreferencesPatch


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
