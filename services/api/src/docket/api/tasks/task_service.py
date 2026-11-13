from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.api.tasks.task_gateway import TaskGateway
from docket.artifacts import ArtifactGateway
from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService
from docket.events import task_event_recorder
from docket.models import Task
from docket.schemas import (
    ArtifactOut,
    TaskClaimIn,
    TaskCreate,
    TaskDetailOut,
    TaskEventOut,
    TaskLinkOut,
    TaskOut,
    TaskStatusIn,
    TaskUpdate,
)
from docket.task_claims import TaskClaimService
from docket.task_links import TaskLinkService


class TaskService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._gateway = TaskGateway(db)
        self._artifacts = ArtifactGateway(db)
        self._claims = TaskClaimService(db)
        self._access = TaskAccessService(db)

    def list_tasks(
        self,
        principal: Principal,
        *,
        archived: bool,
        parent_task_id: int | None,
        roots_only: bool,
    ) -> list[Task]:
        return self._gateway.list_visible(
            self._access.accessible_task_ids_select(principal.user_id),
            archived=archived,
            parent_task_id=parent_task_id,
            roots_only=roots_only,
        )

    def list_inbox(
        self,
        principal: Principal,
        *,
        priority: int | None,
        due_before: datetime | None,
        limit: int,
    ) -> list[Task]:
        return self._gateway.list_claimable(
            self._access.accessible_task_ids_select(principal.user_id),
            now=self._utcnow(),
            priority=priority,
            due_before=due_before,
            limit=limit,
        )

    def create(self, principal: Principal, body: TaskCreate) -> Task:
        if body.parent_task_id is not None:
            parent = self._access.get_task(
                principal, body.parent_task_id, "tasks:write"
            )
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
        task = self._access.get_task(principal, task_id, "tasks:read")
        links = TaskLinkService(self._db).list_for_task(
            user_id=principal.user_id, task_id=task.id
        )
        return TaskDetailOut(
            task=TaskOut.model_validate(task),
            events=[
                TaskEventOut.model_validate(e)
                for e in self._gateway.list_events(task.id)
            ],
            artifacts=[
                ArtifactOut.model_validate(a)
                for a in self._artifacts.list_for_task(task.id)
            ],
            children=[
                TaskOut.model_validate(c) for c in self._gateway.list_children(task.id)
            ],
            links=[TaskLinkOut.model_validate(link) for link in links],
        )

    def update(self, principal: Principal, task_id: int, body: TaskUpdate) -> Task:
        task = self._access.get_task(principal, task_id, "tasks:write")
        changes = self._apply_update(task, principal, body)
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
        task = self._access.get_task(principal, task_id, "tasks:write")
        old = task.status
        task.status = body.status
        self._apply_status_timestamps(task, body.status)
        self._apply_status_last_error(task, old=old, body=body)
        payload: dict = {"from": old, "to": body.status}
        if task.last_error is not None and body.status == "failed":
            payload["last_error"] = task.last_error
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="status_changed",
            actor=principal,
            payload=payload,
        )
        self._gateway.commit()
        self._gateway.refresh(task)
        return task

    def claim(
        self,
        principal: Principal,
        task_id: int,
        body: TaskClaimIn | None = None,
    ) -> Task:
        task = self._access.get_task(principal, task_id, "tasks:claim")
        lease_seconds = (body or TaskClaimIn()).lease_seconds
        self._claims.claim(task, principal, lease_seconds=lease_seconds)
        self._gateway.commit()
        self._gateway.refresh(task)
        return task

    def release(self, principal: Principal, task_id: int) -> Task:
        task = self._access.get_task(principal, task_id, "tasks:claim")
        self._claims.release(task, principal)
        self._gateway.commit()
        self._gateway.refresh(task)
        return task

    def heartbeat(
        self,
        principal: Principal,
        task_id: int,
        body: TaskClaimIn | None = None,
    ) -> Task:
        task = self._access.get_task(principal, task_id, "tasks:claim")
        lease_seconds = (body or TaskClaimIn()).lease_seconds
        self._claims.renew(task, principal, lease_seconds=lease_seconds)
        self._gateway.commit()
        self._gateway.refresh(task)
        return task

    def archive(self, principal: Principal, task_id: int) -> Task:
        task = self._access.get_task(principal, task_id, "tasks:write")
        if task.archived_at is None:
            task.archived_at = self._utcnow()
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="archived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return task

    def unarchive(self, principal: Principal, task_id: int) -> Task:
        task = self._access.get_task(principal, task_id, "tasks:write")
        if task.archived_at is not None:
            task.archived_at = None
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="unarchived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return task

    def delete(self, principal: Principal, task_id: int) -> None:
        task = self._access.require_owner(principal, task_id)
        self._gateway.delete(task)
        self._gateway.commit()

    def _apply_update(
        self, task: Task, principal: Principal, body: TaskUpdate
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
        self._apply_parent_change(task, principal, body, changes)
        self._apply_due_change(task, body, changes)
        return changes

    def _apply_parent_change(
        self,
        task: Task,
        principal: Principal,
        body: TaskUpdate,
        changes: dict,
    ) -> None:
        if body.clear_parent:
            task.parent_task_id = None
            changes["parent_task_id"] = None
        elif body.parent_task_id is not None:
            if body.parent_task_id == task.id:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "Cannot parent to self"
                )
            self._access.get_task(principal, body.parent_task_id, "tasks:write")
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

    def _apply_status_last_error(
        self, task: Task, *, old: str, body: TaskStatusIn
    ) -> None:
        if body.last_error is not None:
            text = body.last_error.strip()
            task.last_error = text or None
            return
        if body.status != "failed" and old == "failed":
            task.last_error = None

    def _utcnow(self) -> datetime:
        return datetime.now(UTC)
