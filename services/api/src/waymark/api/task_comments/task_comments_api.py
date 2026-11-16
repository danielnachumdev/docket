from typing import Annotated

from fastapi import APIRouter, Depends, status

from waymark.api.task_comments.task_comment_service import TaskCommentService
from waymark.auth import Principal, RequirePermission
from waymark.db import DbSession
from waymark.schemas import ArtifactCreate, ArtifactOut
from waymark.schemas.notifications import (
    MentionableUserOut,
    TaskCommentIn,
    TaskCommentOut,
)

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]
CanComment = Annotated[Principal, Depends(RequirePermission("tasks:comment"))]


class TaskCommentsApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tasks", tags=["task-comments"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/{task_id}/comments",
            self.list_comments,
            methods=["GET"],
            response_model=list[TaskCommentOut],
        )
        self.router.add_api_route(
            "/{task_id}/comments",
            self.create_comment,
            methods=["POST"],
            response_model=TaskCommentOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{task_id}/comments/{comment_id}",
            self.update_comment,
            methods=["PATCH"],
            response_model=TaskCommentOut,
        )
        self.router.add_api_route(
            "/{task_id}/comments/{comment_id}",
            self.delete_comment,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )
        self.router.add_api_route(
            "/{task_id}/comments/{comment_id}/artifacts",
            self.attach_comment_artifact,
            methods=["POST"],
            response_model=ArtifactOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{task_id}/mentionables",
            self.list_mentionables,
            methods=["GET"],
            response_model=list[MentionableUserOut],
        )

    def list_comments(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> list[TaskCommentOut]:
        return TaskCommentService(db).list_comments(principal, task_id)

    def create_comment(
        self,
        task_id: str,
        body: TaskCommentIn,
        db: DbSession,
        principal: CanComment,
    ) -> TaskCommentOut:
        return TaskCommentService(db).create(principal, task_id, body)

    def update_comment(
        self,
        task_id: str,
        comment_id: int,
        body: TaskCommentIn,
        db: DbSession,
        principal: CanComment,
    ) -> TaskCommentOut:
        return TaskCommentService(db).update(principal, task_id, comment_id, body)

    def delete_comment(
        self,
        task_id: str,
        comment_id: int,
        db: DbSession,
        principal: CanComment,
    ) -> None:
        TaskCommentService(db).delete(principal, task_id, comment_id)

    def attach_comment_artifact(
        self,
        task_id: str,
        comment_id: int,
        body: ArtifactCreate,
        db: DbSession,
        principal: CanComment,
    ) -> ArtifactOut:
        return TaskCommentService(db).attach_artifact(
            principal, task_id, comment_id, body
        )

    def list_mentionables(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> list[MentionableUserOut]:
        return TaskCommentService(db).list_mentionables(principal, task_id)


task_comments_api = TaskCommentsApi()
