from typing import Annotated

from fastapi import APIRouter, Depends, status

from docket.api.task_watches.task_watch_service import TaskWatchService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.schemas.notifications import TaskWatchOut

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]


class TaskWatchesApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tasks", tags=["task-watches"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/{task_id}/watch",
            self.get_watch,
            methods=["GET"],
            response_model=TaskWatchOut,
        )
        self.router.add_api_route(
            "/{task_id}/watch",
            self.watch,
            methods=["PUT"],
            response_model=TaskWatchOut,
        )
        self.router.add_api_route(
            "/{task_id}/watch",
            self.unwatch,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def get_watch(
        self, task_id: int, db: DbSession, principal: CanRead
    ) -> TaskWatchOut:
        return TaskWatchService(db).get(principal, task_id)

    def watch(
        self, task_id: int, db: DbSession, principal: CanRead
    ) -> TaskWatchOut:
        return TaskWatchService(db).watch(principal, task_id)

    def unwatch(
        self, task_id: int, db: DbSession, principal: CanRead
    ) -> None:
        TaskWatchService(db).unwatch(principal, task_id)


task_watches_api = TaskWatchesApi()
