from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.api.preferences.preferences_codec import PreferencesCodec
from docket.api.preferences.preferences_gateway import PreferencesGateway
from docket.schemas.preferences import UserPreferencesOut, UserPreferencesPatch


class PreferencesService:
    """Load and merge-patch per-user preferences."""

    def __init__(self, db: Session) -> None:
        self._gateway = PreferencesGateway(db)
        self._codec = PreferencesCodec()

    def get(self, user_id: int) -> UserPreferencesOut:
        user = self._require_user(user_id)
        return self._codec.decode(user.preferences_json)

    def patch(self, user_id: int, body: UserPreferencesPatch) -> UserPreferencesOut:
        user = self._require_user(user_id)
        current = self._codec.decode(user.preferences_json)
        patch = body.model_dump(exclude_unset=True)
        if not patch:
            return current
        merged = self._codec.merge(current, patch)
        user.preferences_json = self._codec.encode(merged)
        self._gateway.commit()
        self._gateway.refresh(user)
        return merged

    def _require_user(self, user_id: int):
        user = self._gateway.get_user(user_id)
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        return user
