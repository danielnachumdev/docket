from sqlalchemy.orm import Session

from docket.models import User


class PreferencesGateway:
    """Raw users.preferences_json access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_user(self, user_id: int) -> User | None:
        return self._db.get(User, user_id)

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, user: User) -> None:
        self._db.refresh(user)
