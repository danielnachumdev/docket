from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from waymark.activity import TaskActivityService
from waymark.auth import Principal, RequirePermission
from waymark.db import DbSession
from waymark.schemas.activity import ActivityFeedOut

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]


class TaskActivityApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tasks", tags=["task-activity"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/{task_id}/activity",
            self.list_activity,
            methods=["GET"],
            response_model=ActivityFeedOut,
        )

    def list_activity(
        self,
        task_id: str,
        db: DbSession,
        principal: CanRead,
        order: Annotated[Literal["asc", "desc"], Query()] = "desc",
    ) -> ActivityFeedOut:
        return TaskActivityService(db).list_feed(principal, task_id, order=order)


task_activity_api = TaskActivityApi()
