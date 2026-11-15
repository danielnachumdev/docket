from datetime import datetime

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from waymark.models import Membership, Task, TaskEvent


class MeStatsGateway:
    def __init__(self, db: Session) -> None:
        self._db = db

    def owned_tasks(self, user_id: int) -> list[Task]:
        return list(
            self._db.scalars(select(Task).where(Task.owner_user_id == user_id)).all()
        )

    def accessible_tasks(self, user_id: int) -> list[Task]:
        return list(self._db.scalars(self._accessible_stmt(user_id)).all())

    def shared_membership_task_ids(self, user_id: int) -> set[int]:
        rows = self._db.scalars(
            select(Membership.scope_task_id).where(
                Membership.user_id == user_id,
                Membership.scope_type == "task",
                Membership.scope_task_id.is_not(None),
            )
        ).all()
        return {tid for tid in rows if tid is not None}

    def status_changed_events_for_tasks(
        self, task_ids: list[int], *, since: datetime
    ) -> list[TaskEvent]:
        if not task_ids:
            return []
        return list(
            self._db.scalars(
                select(TaskEvent)
                .where(
                    TaskEvent.task_id.in_(task_ids),
                    TaskEvent.type == "status_changed",
                    TaskEvent.created_at >= since,
                )
                .order_by(TaskEvent.created_at.asc())
            ).all()
        )

    def first_in_progress_events(self, task_ids: list[int]) -> list[TaskEvent]:
        """All status_changed events for tasks (caller filters to first in_progress)."""
        if not task_ids:
            return []
        return list(
            self._db.scalars(
                select(TaskEvent)
                .where(
                    TaskEvent.task_id.in_(task_ids),
                    TaskEvent.type == "status_changed",
                )
                .order_by(TaskEvent.created_at.asc())
            ).all()
        )

    def _accessible_stmt(self, user_id: int) -> Select[tuple[Task]]:
        shared = select(Membership.scope_task_id).where(
            Membership.user_id == user_id,
            Membership.scope_type == "task",
            Membership.scope_task_id.is_not(None),
        )
        return select(Task).where(
            or_(Task.owner_user_id == user_id, Task.id.in_(shared))
        )
