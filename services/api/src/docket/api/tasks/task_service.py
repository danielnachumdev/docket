from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.api.tasks.task_gateway import TaskGateway
from docket.events import task_event_recorder
from docket.models import Artifact, Task
from docket.schemas import (
    ArtifactCreate,
    ArtifactOut,
    TaskCreate,
    TaskDetailOut,
    TaskEventOut,
    TaskOut,
    TaskStatusIn,
    TaskUpdate,
)


class TaskService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._gateway = TaskGateway(db)

    def list_tasks(
        self,
        principal: Principal,
        *,
        archived: bool,
        parent_task_id: int | None,
        roots_only: bool,
    ) -> list[Task]:
        return self._gateway.list_for_owner(
            principal.user_id,
            archived=archived,
            parent_task_id=parent_task_id,
            roots_only=roots_only,
        )

    def create(self, principal: Principal, body: TaskCreate) -> Task:
        if body.parent_task_id is not None:
            parent = self._owned_task(principal.user_id, body.parent_task_id)
            if parent.archived_at is not None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent is archived")

        task = Task(
            owner_user_id=principal.user_id,
            parent_task_id=body.parent_task_id,
            title=body.title.strip(),
            body=body.body,
            priority=body.priority,
            due_at=body.due_at,
            source="api" if principal.token else "ui",
            created_by_user_id=principal.user_id,
            created_by_token_id=principal.token_id,
        )
        self._gateway.add(task)
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="created",
            actor=principal,
            payload={"title": task.title, "priority": task.priority},
        )
        self._gateway.commit()
        self._gateway.refresh(task)
        return task

    def get_detail(self, principal: Principal, task_id: int) -> TaskDetailOut:
        task = self._owned_task(principal.user_id, task_id)
        return TaskDetailOut(
            task=TaskOut.model_validate(task),
            events=[
                TaskEventOut.model_validate(e)
                for e in self._gateway.list_events(task.id)
            ],
            artifacts=[
                ArtifactOut.model_validate(a)
                for a in self._gateway.list_artifacts(task.id)
            ],
            children=[
                TaskOut.model_validate(c) for c in self._gateway.list_children(task.id)
            ],
        )

    def update(self, principal: Principal, task_id: int, body: TaskUpdate) -> Task:
        task = self._owned_task(principal.user_id, task_id)
        changes = self._apply_update(task, principal.user_id, body)
        if changes:
            task_event_recorder.record(
                self._db,
                task_id=task.id,
                event_type="updated",
                actor=principal,
                payload=changes,
            )
        self._gateway.commit()
        self._gateway.refresh(task)
        return task

    def set_status(
        self, principal: Principal, task_id: int, body: TaskStatusIn
    ) -> Task:
        task = self._owned_task(principal.user_id, task_id)
        old = task.status
        task.status = body.status
        self._apply_status_timestamps(task, body.status)
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="status_changed",
            actor=principal,
            payload={"from": old, "to": body.status},
        )
        self._gateway.commit()
        self._gateway.refresh(task)
        return task

    def archive(self, principal: Principal, task_id: int) -> Task:
        task = self._owned_task(principal.user_id, task_id)
        if task.archived_at is None:
            task.archived_at = self._utcnow()
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="archived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return task

    def unarchive(self, principal: Principal, task_id: int) -> Task:
        task = self._owned_task(principal.user_id, task_id)
        if task.archived_at is not None:
            task.archived_at = None
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="unarchived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return task

    def delete(self, principal: Principal, task_id: int) -> None:
        task = self._owned_task(principal.user_id, task_id)
        self._gateway.delete(task)
        self._gateway.commit()

    def add_artifact(
        self, principal: Principal, task_id: int, body: ArtifactCreate
    ) -> Artifact:
        task = self._owned_task(principal.user_id, task_id)
        artifact = Artifact(
            task_id=task.id,
            kind=body.kind,
            title=body.title.strip(),
            content_text=body.content_text,
            created_by_user_id=principal.user_id,
            created_by_token_id=principal.token_id,
        )
        self._gateway.add_artifact(artifact)
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="artifact_added",
            actor=principal,
            payload={
                "artifact_id": artifact.id,
                "kind": artifact.kind,
                "title": artifact.title,
            },
        )
        self._gateway.commit()
        self._gateway.refresh(artifact)
        return artifact

    def _owned_task(self, user_id: int, task_id: int) -> Task:
        task = self._gateway.get(task_id)
        if task is None or task.owner_user_id != user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        return task

    def _apply_update(
        self, task: Task, user_id: int, body: TaskUpdate
    ) -> dict:
        changes: dict = {}
        if body.title is not None:
            task.title = body.title.strip()
            changes["title"] = task.title
        if body.body is not None:
            task.body = body.body
            changes["body"] = True
        if body.priority is not None:
            task.priority = body.priority
            changes["priority"] = task.priority
        if body.rank is not None:
            task.rank = body.rank
            changes["rank"] = task.rank
        self._apply_parent_change(task, user_id, body, changes)
        self._apply_due_change(task, body, changes)
        return changes

    def _apply_parent_change(
        self, task: Task, user_id: int, body: TaskUpdate, changes: dict
    ) -> None:
        if body.clear_parent:
            task.parent_task_id = None
            changes["parent_task_id"] = None
        elif body.parent_task_id is not None:
            if body.parent_task_id == task.id:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "Cannot parent to self"
                )
            self._owned_task(user_id, body.parent_task_id)
            task.parent_task_id = body.parent_task_id
            changes["parent_task_id"] = task.parent_task_id

    def _apply_due_change(
        self, task: Task, body: TaskUpdate, changes: dict
    ) -> None:
        if body.clear_due_at:
            task.due_at = None
            changes["due_at"] = None
        elif body.due_at is not None:
            task.due_at = body.due_at
            changes["due_at"] = task.due_at.isoformat() if task.due_at else None

    def _apply_status_timestamps(self, task: Task, new_status: str) -> None:
        if new_status == "done":
            task.completed_at = self._utcnow()
            task.cancelled_at = None
        elif new_status == "cancelled":
            task.cancelled_at = self._utcnow()
            task.completed_at = None
        else:
            task.completed_at = None
            task.cancelled_at = None

    def _utcnow(self) -> datetime:
        return datetime.now(timezone.utc)
