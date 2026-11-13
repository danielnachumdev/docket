from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from docket.api.tasks.task_service import TaskService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.models import Task, TaskLink
from docket.schemas import (
    TaskClaimIn,
    TaskCreate,
    TaskDetailOut,
    TaskLinkCreate,
    TaskLinkOut,
    TaskOut,
    TaskStatusIn,
    TaskUpdate,
)
from docket.task_links import TaskLinkService

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]
CanWrite = Annotated[Principal, Depends(RequirePermission("tasks:write"))]
CanClaim = Annotated[Principal, Depends(RequirePermission("tasks:claim"))]
CanAdmin = Annotated[Principal, Depends(RequirePermission("tasks:admin"))]


class TasksApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tasks", tags=["tasks"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "", self.list_tasks, methods=["GET"], response_model=list[TaskOut]
        )
        self.router.add_api_route(
            "",
            self.create_task,
            methods=["POST"],
            response_model=TaskOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/inbox",
            self.list_inbox,
            methods=["GET"],
            response_model=list[TaskOut],
        )
        self.router.add_api_route(
            "/{task_id}",
            self.get_task,
            methods=["GET"],
            response_model=TaskDetailOut,
        )
        self.router.add_api_route(
            "/{task_id}",
            self.update_task,
            methods=["PATCH"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}/status",
            self.set_status,
            methods=["POST"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}/claim",
            self.claim_task,
            methods=["POST"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}/release",
            self.release_task,
            methods=["POST"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}/heartbeat",
            self.heartbeat_task,
            methods=["POST"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}/archive",
            self.archive_task,
            methods=["POST"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}/unarchive",
            self.unarchive_task,
            methods=["POST"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}",
            self.delete_task,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )
        self.router.add_api_route(
            "/{task_id}/links",
            self.list_links,
            methods=["GET"],
            response_model=list[TaskLinkOut],
        )
        self.router.add_api_route(
            "/{task_id}/links",
            self.create_link,
            methods=["POST"],
            response_model=TaskLinkOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{task_id}/links/{link_id}",
            self.delete_link,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def list_tasks(
        self,
        db: DbSession,
        principal: CanRead,
        archived: bool = Query(False),
        parent_task_id: int | None = Query(None),
        roots_only: bool = Query(False),
    ) -> list[Task]:
        return TaskService(db).list_tasks(
            principal,
            archived=archived,
            parent_task_id=parent_task_id,
            roots_only=roots_only,
        )

    def list_inbox(
        self,
        db: DbSession,
        principal: CanClaim,
        priority: Annotated[int | None, Query(ge=1, le=4)] = None,
        due_before: Annotated[datetime | None, Query()] = None,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
    ) -> list[Task]:
        return TaskService(db).list_inbox(
            principal,
            priority=priority,
            due_before=due_before,
            limit=limit,
        )

    def create_task(
        self, body: TaskCreate, db: DbSession, principal: CanWrite
    ) -> Task:
        return TaskService(db).create(principal, body)

    def get_task(
        self, task_id: int, db: DbSession, principal: CanRead
    ) -> TaskDetailOut:
        return TaskService(db).get_detail(principal, task_id)

    def update_task(
        self, task_id: int, body: TaskUpdate, db: DbSession, principal: CanWrite
    ) -> Task:
        return TaskService(db).update(principal, task_id, body)

    def set_status(
        self, task_id: int, body: TaskStatusIn, db: DbSession, principal: CanWrite
    ) -> Task:
        return TaskService(db).set_status(principal, task_id, body)

    def claim_task(
        self,
        task_id: int,
        db: DbSession,
        principal: CanClaim,
        body: TaskClaimIn | None = None,
    ) -> Task:
        return TaskService(db).claim(principal, task_id, body)

    def release_task(
        self, task_id: int, db: DbSession, principal: CanClaim
    ) -> Task:
        return TaskService(db).release(principal, task_id)

    def heartbeat_task(
        self,
        task_id: int,
        db: DbSession,
        principal: CanClaim,
        body: TaskClaimIn | None = None,
    ) -> Task:
        return TaskService(db).heartbeat(principal, task_id, body)

    def archive_task(
        self, task_id: int, db: DbSession, principal: CanWrite
    ) -> Task:
        return TaskService(db).archive(principal, task_id)

    def unarchive_task(
        self, task_id: int, db: DbSession, principal: CanWrite
    ) -> Task:
        return TaskService(db).unarchive(principal, task_id)

    def delete_task(
        self, task_id: int, db: DbSession, principal: CanAdmin
    ) -> None:
        TaskService(db).delete(principal, task_id)

    def list_links(
        self, task_id: int, db: DbSession, principal: CanRead
    ) -> list[TaskLink]:
        return TaskLinkService(db).list_for_task(
            user_id=principal.user_id, task_id=task_id
        )

    def create_link(
        self, task_id: int, body: TaskLinkCreate, db: DbSession, principal: CanWrite
    ) -> TaskLink:
        return TaskLinkService(db).create(
            principal=principal,
            from_task_id=task_id,
            to_task_id=body.to_task_id,
            kind=body.kind,
        )

    def delete_link(
        self, task_id: int, link_id: int, db: DbSession, principal: CanWrite
    ) -> None:
        TaskLinkService(db).delete(
            principal=principal, task_id=task_id, link_id=link_id
        )


tasks_api = TasksApi()
