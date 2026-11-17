from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from waymark.models import Artifact, Membership, Notification, Task, TaskEvent, TaskLink
from waymark.schemas import (
    ArtifactOut,
    NotificationOut,
    TaskEventOut,
    TaskLinkOut,
    TaskOut,
)


class TaskResponseMapper:
    """Maps ORM rows to API schemas using public_id as the task SOT.

    `number` is viewer-scoped: owners see owner_task_number; sharees see
    membership.viewer_task_number when present.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._public_by_internal: dict[int, str] = {}
        self._shared_ids: set[int] = set()
        self._shared_checked: set[int] = set()
        self._viewer_numbers: dict[tuple[int, int], int] = {}
        self._viewer_numbers_checked: set[tuple[int, int]] = set()

    def remember(self, tasks: Iterable[Task]) -> None:
        for task in tasks:
            self._public_by_internal[task.id] = task.public_id

    def task_out(self, task: Task, *, viewer_user_id: int | None = None) -> TaskOut:
        self.remember([task])
        self.prefetch_shared([task.id])
        if viewer_user_id is not None:
            self.prefetch_viewer_numbers(viewer_user_id, [task.id])
        return TaskOut(
            id=task.public_id,
            number=self.number_for(task, viewer_user_id=viewer_user_id),
            owner_user_id=task.owner_user_id,
            parent_task_id=self.public_id(task.parent_task_id),
            external_id=task.external_id,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            rank=task.rank,
            source=task.source,
            due_at=task.due_at,
            due_horizon=task.due_horizon,
            claimed_by_token_id=task.claimed_by_token_id,
            claimed_by_token_name=task.claimed_by_token_name,
            claim_expires_at=task.claim_expires_at,
            last_error=task.last_error,
            status_reason=task.status_reason,
            require_artifact_on_done=bool(task.require_artifact_on_done),
            outcome_schema_json=task.outcome_schema_json,
            outcome_json=task.outcome_json,
            completed_at=task.completed_at,
            cancelled_at=task.cancelled_at,
            archived_at=task.archived_at,
            unread=self.unread_for(task, viewer_user_id=viewer_user_id),
            shared=task.id in self._shared_ids,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )

    def tasks_out(
        self, tasks: list[Task], *, viewer_user_id: int | None = None
    ) -> list[TaskOut]:
        self.remember(tasks)
        self.prefetch([t.parent_task_id for t in tasks if t.parent_task_id])
        self.prefetch_shared(t.id for t in tasks)
        if viewer_user_id is not None:
            self.prefetch_viewer_numbers(viewer_user_id, [t.id for t in tasks])
        return [
            self.task_out(task, viewer_user_id=viewer_user_id) for task in tasks
        ]

    def number_for(self, task: Task, *, viewer_user_id: int | None) -> int:
        if viewer_user_id is None or task.owner_user_id == viewer_user_id:
            return task.owner_task_number
        cached = self._viewer_numbers.get((viewer_user_id, task.id))
        if cached is not None:
            return cached
        return task.owner_task_number

    def unread_for(self, task: Task, *, viewer_user_id: int | None) -> bool:
        """Viewer-aware unread: shared bit minus session actor exclusion."""
        if not task.unread:
            return False
        except_id = task.unread_except_user_id
        if except_id is None or viewer_user_id is None:
            return True
        return except_id != viewer_user_id

    def prefetch_viewer_numbers(
        self, viewer_user_id: int, internal_ids: Iterable[int]
    ) -> None:
        missing = {
            i
            for i in internal_ids
            if (viewer_user_id, i) not in self._viewer_numbers_checked
        }
        if not missing:
            return
        rows = self._db.execute(
            select(Membership.scope_task_id, Membership.viewer_task_number).where(
                Membership.user_id == viewer_user_id,
                Membership.scope_type == "task",
                Membership.scope_task_id.in_(missing),
                Membership.viewer_task_number.is_not(None),
            )
        ).all()
        for scope_task_id, viewer_task_number in rows:
            if scope_task_id is None or viewer_task_number is None:
                continue
            self._viewer_numbers[(viewer_user_id, int(scope_task_id))] = int(
                viewer_task_number
            )
        self._viewer_numbers_checked.update(
            (viewer_user_id, task_id) for task_id in missing
        )

    def prefetch_shared(self, internal_ids: Iterable[int]) -> None:
        missing = {i for i in internal_ids if i not in self._shared_checked}
        if not missing:
            return
        rows = self._db.execute(
            select(Membership.scope_task_id)
            .where(
                Membership.scope_type == "task",
                Membership.scope_task_id.in_(missing),
            )
            .distinct()
        ).all()
        for (scope_task_id,) in rows:
            if scope_task_id is not None:
                self._shared_ids.add(int(scope_task_id))
        self._shared_checked.update(missing)

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

    def artifact_out(
        self,
        artifact: Artifact,
        *,
        can_modify: bool = False,
        task_title: str | None = None,
        task_number: int | None = None,
    ) -> ArtifactOut:
        return ArtifactOut(
            id=artifact.id,
            task_id=self.public_id(artifact.task_id) or "",
            kind=artifact.kind,
            title=artifact.title,
            content_text=artifact.content_text,
            storage_key=artifact.storage_key,
            content_type=artifact.content_type,
            byte_size=artifact.byte_size,
            created_by_user_id=artifact.created_by_user_id,
            created_at=artifact.created_at,
            can_modify=can_modify,
            task_title=task_title,
            task_number=task_number,
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
