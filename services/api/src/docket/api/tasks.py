from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from docket.deps import CurrentUser, DbSession, require_permission
from docket.events import record_event
from docket.models import Artifact, Task, TaskEvent
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

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _get_owned_task(db: DbSession, user_id: int, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.owner_user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: DbSession,
    user: CurrentUser,
    archived: bool = Query(False),
    parent_task_id: int | None = Query(None),
    roots_only: bool = Query(False),
) -> list[Task]:
    require_permission(db, user, "tasks:read")
    stmt = select(Task).where(Task.owner_user_id == user.id)
    if archived:
        stmt = stmt.where(Task.archived_at.is_not(None))
    else:
        stmt = stmt.where(Task.archived_at.is_(None))
    if parent_task_id is not None:
        stmt = stmt.where(Task.parent_task_id == parent_task_id)
    elif roots_only:
        stmt = stmt.where(Task.parent_task_id.is_(None))
    stmt = stmt.order_by(Task.priority.asc(), Task.rank.asc(), Task.id.asc())
    return list(db.scalars(stmt).all())


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, db: DbSession, user: CurrentUser) -> Task:
    require_permission(db, user, "tasks:write")
    if body.parent_task_id is not None:
        parent = _get_owned_task(db, user.id, body.parent_task_id)
        if parent.archived_at is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent is archived")

    task = Task(
        owner_user_id=user.id,
        parent_task_id=body.parent_task_id,
        title=body.title.strip(),
        body=body.body,
        priority=body.priority,
        due_at=body.due_at,
        source="ui",
        created_by_user_id=user.id,
    )
    db.add(task)
    db.flush()
    record_event(
        db,
        task_id=task.id,
        event_type="created",
        actor=user,
        payload={"title": task.title, "priority": task.priority},
    )
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskDetailOut)
def get_task(task_id: int, db: DbSession, user: CurrentUser) -> TaskDetailOut:
    require_permission(db, user, "tasks:read")
    task = _get_owned_task(db, user.id, task_id)
    events = list(
        db.scalars(
            select(TaskEvent)
            .where(TaskEvent.task_id == task.id)
            .order_by(TaskEvent.created_at.desc(), TaskEvent.id.desc())
        ).all()
    )
    artifacts = list(
        db.scalars(
            select(Artifact)
            .where(Artifact.task_id == task.id)
            .order_by(Artifact.created_at.desc(), Artifact.id.desc())
        ).all()
    )
    children = list(
        db.scalars(
            select(Task)
            .where(Task.parent_task_id == task.id, Task.archived_at.is_(None))
            .order_by(Task.priority.asc(), Task.rank.asc(), Task.id.asc())
        ).all()
    )
    return TaskDetailOut(
        task=TaskOut.model_validate(task),
        events=[TaskEventOut.model_validate(e) for e in events],
        artifacts=[ArtifactOut.model_validate(a) for a in artifacts],
        children=[TaskOut.model_validate(c) for c in children],
    )


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int, body: TaskUpdate, db: DbSession, user: CurrentUser
) -> Task:
    require_permission(db, user, "tasks:write")
    task = _get_owned_task(db, user.id, task_id)
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
    if body.clear_parent:
        task.parent_task_id = None
        changes["parent_task_id"] = None
    elif body.parent_task_id is not None:
        if body.parent_task_id == task.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot parent to self")
        _get_owned_task(db, user.id, body.parent_task_id)
        task.parent_task_id = body.parent_task_id
        changes["parent_task_id"] = task.parent_task_id
    if body.clear_due_at:
        task.due_at = None
        changes["due_at"] = None
    elif body.due_at is not None:
        task.due_at = body.due_at
        changes["due_at"] = task.due_at.isoformat() if task.due_at else None

    if changes:
        record_event(
            db, task_id=task.id, event_type="updated", actor=user, payload=changes
        )
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/status", response_model=TaskOut)
def set_status(
    task_id: int, body: TaskStatusIn, db: DbSession, user: CurrentUser
) -> Task:
    require_permission(db, user, "tasks:write")
    task = _get_owned_task(db, user.id, task_id)
    old = task.status
    task.status = body.status
    if body.status == "done":
        task.completed_at = _utcnow()
        task.cancelled_at = None
    elif body.status == "cancelled":
        task.cancelled_at = _utcnow()
        task.completed_at = None
    else:
        task.completed_at = None
        task.cancelled_at = None
    record_event(
        db,
        task_id=task.id,
        event_type="status_changed",
        actor=user,
        payload={"from": old, "to": body.status},
    )
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/archive", response_model=TaskOut)
def archive_task(task_id: int, db: DbSession, user: CurrentUser) -> Task:
    require_permission(db, user, "tasks:write")
    task = _get_owned_task(db, user.id, task_id)
    if task.archived_at is None:
        task.archived_at = _utcnow()
        record_event(db, task_id=task.id, event_type="archived", actor=user)
        db.commit()
        db.refresh(task)
    return task


@router.post("/{task_id}/unarchive", response_model=TaskOut)
def unarchive_task(task_id: int, db: DbSession, user: CurrentUser) -> Task:
    require_permission(db, user, "tasks:write")
    task = _get_owned_task(db, user.id, task_id)
    if task.archived_at is not None:
        task.archived_at = None
        record_event(db, task_id=task.id, event_type="unarchived", actor=user)
        db.commit()
        db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, user: CurrentUser) -> None:
    require_permission(db, user, "tasks:admin")
    task = _get_owned_task(db, user.id, task_id)
    db.delete(task)
    db.commit()


@router.post(
    "/{task_id}/artifacts",
    response_model=ArtifactOut,
    status_code=status.HTTP_201_CREATED,
)
def add_artifact(
    task_id: int, body: ArtifactCreate, db: DbSession, user: CurrentUser
) -> Artifact:
    require_permission(db, user, "artifacts:write")
    task = _get_owned_task(db, user.id, task_id)
    artifact = Artifact(
        task_id=task.id,
        kind=body.kind,
        title=body.title.strip(),
        content_text=body.content_text,
        created_by_user_id=user.id,
    )
    db.add(artifact)
    db.flush()
    record_event(
        db,
        task_id=task.id,
        event_type="artifact_added",
        actor=user,
        payload={"artifact_id": artifact.id, "kind": artifact.kind, "title": artifact.title},
    )
    db.commit()
    db.refresh(artifact)
    return artifact
