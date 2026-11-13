from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import Artifact, Notification, Task, TaskEvent, TaskLink
from docket.schemas import (
    ArtifactOut,
    NotificationOut,
    TaskEventOut,
    TaskLinkOut,
    TaskOut,
)
from docket.schemas.notifications import TaskCommentOut


class TaskResponseMapper:
    """Maps ORM rows to API schemas using public_id as the task SOT."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._public_by_internal: dict[int, str] = {}

    def remember(self, tasks: Iterable[Task]) -> None:
        for task in tasks:
            self._public_by_internal[task.id] = task.public_id

    def task_out(self, task: Task) -> TaskOut:
        self.remember([task])
        return TaskOut(
            id=task.public_id,
            number=task.owner_task_number,
            owner_user_id=task.owner_user_id,
            parent_task_id=self.public_id(task.parent_task_id),
            external_id=task.external_id,
            title=task.title,
            body=task.body,
            status=task.status,
            priority=task.priority,
            rank=task.rank,
            source=task.source,
            due_at=task.due_at,
            claimed_by_token_id=task.claimed_by_token_id,
            claimed_by_token_name=task.claimed_by_token_name,
            claim_expires_at=task.claim_expires_at,
            last_error=task.last_error,
            require_artifact_on_done=bool(task.require_artifact_on_done),
            outcome_schema_json=task.outcome_schema_json,
            outcome_json=task.outcome_json,
            completed_at=task.completed_at,
            cancelled_at=task.cancelled_at,
            archived_at=task.archived_at,
            unread=bool(task.unread),
            created_at=task.created_at,
            updated_at=task.updated_at,
        )

    def tasks_out(self, tasks: list[Task]) -> list[TaskOut]:
        self.remember(tasks)
        self.prefetch([t.parent_task_id for t in tasks if t.parent_task_id])
        return [self.task_out(task) for task in tasks]

    def event_out(self, event: TaskEvent) -> TaskEventOut:
        return TaskEventOut(
            id=event.id,
            task_id=self.public_id(event.task_id) or "",
            type=event.type,
            actor_user_id=event.actor_user_id,
            actor_token_id=event.actor_token_id,
            actor_token_name=event.actor_token_name,
            actor_role_name=event.actor_role_name,
            payload_json=event.payload_json,
            created_at=event.created_at,
        )

    def artifact_out(self, artifact: Artifact) -> ArtifactOut:
        return ArtifactOut(
            id=artifact.id,
            task_id=self.public_id(artifact.task_id) or "",
            kind=artifact.kind,
            title=artifact.title,
            content_text=artifact.content_text,
            storage_key=artifact.storage_key,
            content_type=artifact.content_type,
            created_by_user_id=artifact.created_by_user_id,
            created_at=artifact.created_at,
        )

    def link_out(self, link: TaskLink) -> TaskLinkOut:
        self.prefetch([link.from_task_id, link.to_task_id])
        return TaskLinkOut(
            id=link.id,
            from_task_id=self.public_id(link.from_task_id) or "",
            to_task_id=self.public_id(link.to_task_id) or "",
            kind=link.kind,
            created_by_user_id=link.created_by_user_id,
            created_by_token_id=link.created_by_token_id,
            created_at=link.created_at,
        )

    def notification_out(self, row: Notification) -> NotificationOut:
        return NotificationOut(
            id=row.id,
            user_id=row.user_id,
            task_id=self.public_id(row.task_id),
            kind=row.kind,
            title=row.title,
            body=row.body,
            payload_json=row.payload_json,
            actor_user_id=row.actor_user_id,
            read_at=row.read_at,
            created_at=row.created_at,
        )

    def comment_out(
        self, *, event_id: int, task: Task, body: str, mentioned_user_ids: list[int]
    ) -> TaskCommentOut:
        self.remember([task])
        return TaskCommentOut(
            event_id=event_id,
            task_id=task.public_id,
            body=body,
            mentioned_user_ids=mentioned_user_ids,
        )

    def public_id(self, internal_id: int | None) -> str | None:
        if internal_id is None:
            return None
        cached = self._public_by_internal.get(internal_id)
        if cached is not None:
            return cached
        self.prefetch([internal_id])
        return self._public_by_internal.get(internal_id)

    def prefetch(self, internal_ids: Iterable[int | None]) -> None:
        missing = {
            i for i in internal_ids if i is not None and i not in self._public_by_internal
        }
        if not missing:
            return
        rows = self._db.execute(
            select(Task.id, Task.public_id).where(Task.id.in_(missing))
        ).all()
        for internal_id, public_id in rows:
            self._public_by_internal[int(internal_id)] = str(public_id)
