from datetime import datetime

from sqlalchemy import nulls_last, or_, select
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql import ColumnElement, Select

from docket.models import ApiToken, Task, TaskEvent

_CLOSED_STATUSES = ("done", "cancelled")


class TaskGateway:
    """Raw task table access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, task_id: int) -> Task | None:
        return self._db.scalar(
            select(Task)
            .options(joinedload(Task.claimed_by_token))
            .where(Task.id == task_id)
        )

    def get_by_owner_external_id(
        self, owner_user_id: int, external_id: str
    ) -> Task | None:
        return self._db.scalar(
            select(Task).where(
                Task.owner_user_id == owner_user_id,
                Task.external_id == external_id,
            )
        )

    def add(self, task: Task) -> Task:
        self._db.add(task)
        self._db.flush()
        return task

    def delete(self, task: Task) -> None:
        self._db.delete(task)

    def rollback(self) -> None:
        self._db.rollback()

    def list_visible(
        self,
        accessible_ids: Select[tuple[int]],
        *,
        archived: bool,
        parent_task_id: int | None,
        roots_only: bool,
    ) -> list[Task]:
        stmt = select(Task).where(Task.id.in_(accessible_ids))
        if archived:
            stmt = stmt.where(Task.archived_at.is_not(None))
        else:
            stmt = stmt.where(Task.archived_at.is_(None))
        if parent_task_id is not None:
            stmt = stmt.where(Task.parent_task_id == parent_task_id)
        elif roots_only:
            stmt = stmt.where(Task.parent_task_id.is_(None))
        stmt = stmt.order_by(Task.priority.asc(), Task.rank.asc(), Task.id.asc())
        return list(self._db.scalars(stmt).all())

    def list_claimable(
        self,
        accessible_ids: Select[tuple[int]],
        *,
        now: datetime,
        priority: int | None,
        due_before: datetime | None,
        limit: int,
    ) -> list[Task]:
        stmt = (
            select(Task)
            .where(Task.id.in_(accessible_ids))
            .where(Task.archived_at.is_(None))
            .where(Task.status.notin_(_CLOSED_STATUSES))
            .where(self._lease_inactive(now))
        )
        if priority is not None:
            stmt = stmt.where(Task.priority == priority)
        if due_before is not None:
            stmt = stmt.where(Task.due_at.is_not(None), Task.due_at <= due_before)
        stmt = stmt.order_by(
            Task.priority.asc(),
            nulls_last(Task.due_at.asc()),
            Task.rank.asc(),
            Task.id.asc(),
        ).limit(limit)
        return list(self._db.scalars(stmt).all())

    @staticmethod
    def _lease_inactive(now: datetime) -> ColumnElement[bool]:
        return or_(
            Task.claimed_by_token_id.is_(None),
            Task.claim_expires_at.is_(None),
            Task.claim_expires_at <= now,
        )

    def list_events(self, task_id: int) -> list[TaskEvent]:
        return list(
            self._db.scalars(
                select(TaskEvent)
                .options(joinedload(TaskEvent.actor_token).joinedload(ApiToken.role))
                .where(TaskEvent.task_id == task_id)
                .order_by(TaskEvent.created_at.desc(), TaskEvent.id.desc())
            )
            .unique()
            .all()
        )

    def list_children(self, parent_id: int) -> list[Task]:
        return list(
            self._db.scalars(
                select(Task)
                .where(Task.parent_task_id == parent_id, Task.archived_at.is_(None))
                .order_by(Task.priority.asc(), Task.rank.asc(), Task.id.asc())
            ).all()
        )

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, obj: object) -> None:
        self._db.refresh(obj)
