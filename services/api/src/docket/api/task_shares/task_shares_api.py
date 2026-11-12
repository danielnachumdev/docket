from typing import Annotated

from fastapi import APIRouter, Depends, status

from docket.auth import Principal, RequirePermission
from docket.api.task_shares.task_share_service import TaskShareService
from docket.db import DbSession
from docket.schemas import TaskShareCreate, TaskShareOut

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]
CanWrite = Annotated[Principal, Depends(RequirePermission("tasks:write"))]


class TaskSharesApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tasks", tags=["task-shares"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/{task_id}/shares",
            self.list_shares,
            methods=["GET"],
            response_model=list[TaskShareOut],
        )
        self.router.add_api_route(
            "/{task_id}/shares",
            self.create_share,
            methods=["POST"],
            response_model=TaskShareOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{task_id}/shares/{membership_id}",
            self.delete_share,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def list_shares(
        self, task_id: int, db: DbSession, principal: CanRead
    ) -> list[TaskShareOut]:
        return TaskShareService(db).list_shares(principal, task_id)

    def create_share(
        self,
        task_id: int,
        body: TaskShareCreate,
        db: DbSession,
        principal: CanWrite,
    ) -> TaskShareOut:
        return TaskShareService(db).create_share(principal, task_id, body)

    def delete_share(
        self,
        task_id: int,
        membership_id: int,
        db: DbSession,
        principal: CanWrite,
    ) -> None:
        TaskShareService(db).delete_share(principal, task_id, membership_id)


task_shares_api = TaskSharesApi()
