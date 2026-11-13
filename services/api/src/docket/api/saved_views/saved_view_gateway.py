from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import SavedView


class SavedViewGateway:
    """Raw saved_views table access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, view_id: int) -> SavedView | None:
        return self._db.get(SavedView, view_id)

    def add(self, view: SavedView) -> SavedView:
        self._db.add(view)
        self._db.flush()
        return view

    def delete(self, view: SavedView) -> None:
        self._db.delete(view)

    def list_by_user_id(self, user_id: int) -> list[SavedView]:
        stmt = (
            select(SavedView)
            .where(SavedView.user_id == user_id)
            .order_by(SavedView.position.asc(), SavedView.id.asc())
        )
        return list(self._db.scalars(stmt).all())

    def get_by_user_and_name(self, user_id: int, name: str) -> SavedView | None:
        stmt = select(SavedView).where(
            SavedView.user_id == user_id, SavedView.name == name
        )
        return self._db.scalars(stmt).first()

    def commit(self) -> None:
        self._db.commit()

    def rollback(self) -> None:
        self._db.rollback()

    def refresh(self, obj: object) -> None:
        self._db.refresh(obj)
