from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from docket.models import Task, TaskEvent


class TaskGateway:
    """Raw task table access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, task_id: int) -> Task | None:
        return self._db.get(Task, task_id)

    def add(self, task: Task) -> Task:
        self._db.add(task)
        self._db.flush()
        return task

    def delete(self, task: Task) -> None:
        self._db.delete(task)

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

    def list_events(self, task_id: int) -> list[TaskEvent]:
        return list(
            self._db.scalars(
                select(TaskEvent)
                .where(TaskEvent.task_id == task_id)
                .order_by(TaskEvent.created_at.desc(), TaskEvent.id.desc())
            ).all()
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
