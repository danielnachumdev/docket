from typing import Annotated

from fastapi import APIRouter, Depends, status

from docket.api.saved_views.saved_view_service import SavedViewService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.models import SavedView
from docket.schemas import SavedViewCreate, SavedViewOut, SavedViewUpdate

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]
CanWrite = Annotated[Principal, Depends(RequirePermission("tasks:write"))]


class SavedViewsApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/saved-views", tags=["saved-views"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "",
            self.list_views,
            methods=["GET"],
            response_model=list[SavedViewOut],
        )
        self.router.add_api_route(
            "",
            self.create_view,
            methods=["POST"],
            response_model=SavedViewOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{view_id}",
            self.update_view,
            methods=["PATCH"],
            response_model=SavedViewOut,
        )
        self.router.add_api_route(
            "/{view_id}",
            self.delete_view,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def list_views(self, db: DbSession, principal: CanRead) -> list[SavedView]:
        return SavedViewService(db).list_for_user(principal.user_id)

    def create_view(
        self, body: SavedViewCreate, db: DbSession, principal: CanWrite
    ) -> SavedView:
        return SavedViewService(db).create(principal.user_id, body)

    def update_view(
        self,
        view_id: int,
        body: SavedViewUpdate,
        db: DbSession,
        principal: CanWrite,
    ) -> SavedView:
        return SavedViewService(db).update(principal.user_id, view_id, body)

    def delete_view(
        self, view_id: int, db: DbSession, principal: CanWrite
    ) -> None:
        SavedViewService(db).delete(principal.user_id, view_id)


saved_views_api = SavedViewsApi()
