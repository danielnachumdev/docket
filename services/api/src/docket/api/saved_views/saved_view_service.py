from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from docket.api.saved_views.saved_view_gateway import SavedViewGateway
from docket.models import SavedView
from docket.schemas.saved_views import (
    ALLOWED_FILTER_KEYS,
    SavedViewCreate,
    SavedViewUpdate,
)


class SavedViewService:
    """CRUD for per-user saved task-list views."""

    def __init__(self, db: Session) -> None:
        self._gateway = SavedViewGateway(db)

    def list_for_user(self, user_id: int) -> list[SavedView]:
        return self._gateway.list_by_user_id(user_id)

    def create(self, user_id: int, body: SavedViewCreate) -> SavedView:
        name = body.name.strip()
        self._require_name(name)
        filter_key = self._validated_filter_key(body.filter_key)
        view = SavedView(
            user_id=user_id,
            name=name,
            filter_key=filter_key,
            query=body.query.strip(),
            position=body.position,
        )
        try:
            self._gateway.add(view)
            self._gateway.commit()
        except IntegrityError as exc:
            self._raise_name_conflict(exc)
        self._gateway.refresh(view)
        return view

    def update(self, user_id: int, view_id: int, body: SavedViewUpdate) -> SavedView:
        view = self._owned(user_id, view_id)
        if body.name is not None:
            name = body.name.strip()
            self._require_name(name)
            view.name = name
        if body.filter_key is not None:
            view.filter_key = self._validated_filter_key(body.filter_key)
        if body.query is not None:
            view.query = body.query.strip()
        if body.position is not None:
            view.position = body.position
        try:
            self._gateway.commit()
        except IntegrityError as exc:
            self._raise_name_conflict(exc)
        self._gateway.refresh(view)
        return view

    def delete(self, user_id: int, view_id: int) -> None:
        view = self._owned(user_id, view_id)
        self._gateway.delete(view)
        self._gateway.commit()

    def _owned(self, user_id: int, view_id: int) -> SavedView:
        view = self._gateway.get(view_id)
        if view is None or view.user_id != user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Saved view not found")
        return view

    def _raise_name_conflict(self, exc: IntegrityError) -> None:
        self._gateway.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A saved view with that name already exists"
        ) from exc

    @staticmethod
    def _require_name(name: str) -> None:
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")

    @staticmethod
    def _validated_filter_key(filter_key: str) -> str:
        key = filter_key.strip()
        if key not in ALLOWED_FILTER_KEYS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown filter_key")
        return key
