from datetime import datetime
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, status

from docket.api.tasks.task_response_mapper import TaskResponseMapper
from docket.api.tasks.task_service import TaskService
from docket.auth import Principal, RequirePermission, TaskAccessService
from docket.db import DbSession
from docket.schemas import (
    TaskBulkUpdate,
    TaskClaimIn,
    TaskCommentIn,
    TaskCommentOut,
    TaskCreate,
    TaskDetailOut,
    TaskLinkCreate,
    TaskLinkOut,
    TaskOut,
    TaskStatusIn,
    TaskUpdate,
)
from docket.task_export import TaskExportService
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
            "/bulk",
            self.bulk_update_tasks,
            methods=["POST"],
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
            "/{task_id}/comments",
            self.add_comment,
            methods=["POST"],
            response_model=TaskCommentOut,
            status_code=status.HTTP_201_CREATED,
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
            "/{task_id}/read",
            self.mark_task_read,
            methods=["POST"],
            response_model=TaskOut,
        )
        self.router.add_api_route(
            "/{task_id}/unread",
            self.mark_task_unread,
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
            "/{task_id}/export",
            self.export_task,
            methods=["GET"],
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
        parent_task_id: str | None = Query(None),
        roots_only: bool = Query(False),
    ) -> list[TaskOut]:
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
    ) -> list[TaskOut]:
        return TaskService(db).list_inbox(
            principal,
            priority=priority,
            due_before=due_before,
            limit=limit,
        )

    def create_task(
        self,
        body: TaskCreate,
        db: DbSession,
        principal: CanWrite,
        response: Response,
    ) -> TaskOut:
        task, created = TaskService(db).create(principal, body)
        response.status_code = (
            status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )
        return task

    def get_task(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> TaskDetailOut:
        return TaskService(db).get_detail(principal, task_id)

    def update_task(
        self, task_id: str, body: TaskUpdate, db: DbSession, principal: CanWrite
    ) -> TaskOut:
        return TaskService(db).update(principal, task_id, body)

    def bulk_update_tasks(
        self, body: TaskBulkUpdate, db: DbSession, principal: CanWrite
    ) -> list[TaskOut]:
        return TaskService(db).bulk_update(principal, body)

    def set_status(
        self, task_id: str, body: TaskStatusIn, db: DbSession, principal: CanWrite
    ) -> TaskOut:
        return TaskService(db).set_status(principal, task_id, body)

    def add_comment(
        self,
        task_id: str,
        body: TaskCommentIn,
        db: DbSession,
        principal: CanWrite,
    ) -> TaskCommentOut:
        return TaskService(db).add_comment(principal, task_id, body)

    def claim_task(
        self,
        task_id: str,
        db: DbSession,
        principal: CanClaim,
        body: TaskClaimIn | None = None,
    ) -> TaskOut:
        return TaskService(db).claim(principal, task_id, body)

    def release_task(
        self, task_id: str, db: DbSession, principal: CanClaim
    ) -> TaskOut:
        return TaskService(db).release(principal, task_id)

    def heartbeat_task(
        self,
        task_id: str,
        db: DbSession,
        principal: CanClaim,
        body: TaskClaimIn | None = None,
    ) -> TaskOut:
        return TaskService(db).heartbeat(principal, task_id, body)

    def archive_task(
        self, task_id: str, db: DbSession, principal: CanWrite
    ) -> TaskOut:
        return TaskService(db).archive(principal, task_id)

    def unarchive_task(
        self, task_id: str, db: DbSession, principal: CanWrite
    ) -> TaskOut:
        return TaskService(db).unarchive(principal, task_id)

    def mark_task_read(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> TaskOut:
        return TaskService(db).mark_read(principal, task_id)

    def mark_task_unread(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> TaskOut:
        return TaskService(db).mark_unread(principal, task_id)

    def delete_task(
        self, task_id: str, db: DbSession, principal: CanAdmin
    ) -> None:
        TaskService(db).delete(principal, task_id)

    def export_task(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> Response:
        bundle = TaskExportService(db).export_task(principal, task_id)
        disposition = f"attachment; filename*=UTF-8''{quote(bundle.filename)}"
        return Response(
            content=bundle.data,
            media_type=bundle.content_type,
            headers={
                "Content-Disposition": disposition,
                "Cache-Control": "no-store",
            },
        )

    def list_links(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> list[TaskLinkOut]:
        task = TaskAccessService(db).get_task(principal, task_id, "tasks:read")
        mapper = TaskResponseMapper(db)
        mapper.remember([task])
        links = TaskLinkService(db).list_for_task(
            user_id=principal.user_id, task_id=task.id
        )
        return [mapper.link_out(link) for link in links]

    def create_link(
        self, task_id: str, body: TaskLinkCreate, db: DbSession, principal: CanWrite
    ) -> TaskLinkOut:
        access = TaskAccessService(db)
        from_task = access.get_task(principal, task_id, "tasks:write")
        to_task = access.get_task(principal, body.to_task_id, "tasks:write")
        link = TaskLinkService(db).create(
            principal=principal,
            from_task_id=from_task.id,
            to_task_id=to_task.id,
            kind=body.kind,
        )
        mapper = TaskResponseMapper(db)
        mapper.remember([from_task, to_task])
        return mapper.link_out(link)

    def delete_link(
        self, task_id: str, link_id: int, db: DbSession, principal: CanWrite
    ) -> None:
        task = TaskAccessService(db).get_task(principal, task_id, "tasks:write")
        TaskLinkService(db).delete(
            principal=principal, task_id=task.id, link_id=link_id
        )


tasks_api = TasksApi()
