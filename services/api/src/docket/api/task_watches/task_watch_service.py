from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService
from docket.models import TaskWatch
from docket.schemas.notifications import TaskWatchOut


class TaskWatchService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._access = TaskAccessService(db)

    def get(self, principal: Principal, task_ref: str) -> TaskWatchOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        return TaskWatchOut(watching=self.is_watching(principal.user_id, task.id))

    def watch(self, principal: Principal, task_ref: str) -> TaskWatchOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        if not self.is_watching(principal.user_id, task.id):
            self._db.add(TaskWatch(task_id=task.id, user_id=principal.user_id))
            self._db.commit()
        return TaskWatchOut(watching=True)

    def unwatch(self, principal: Principal, task_ref: str) -> None:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        row = self._db.scalar(
            select(TaskWatch).where(
                TaskWatch.task_id == task.id,
                TaskWatch.user_id == principal.user_id,
            )
        )
        if row is not None:
            self._db.delete(row)
            self._db.commit()

    def is_watching(self, user_id: int, task_id: int) -> bool:
        return (
            self._db.scalar(
                select(TaskWatch.id).where(
                    TaskWatch.task_id == task_id,
                    TaskWatch.user_id == user_id,
                )
            )
            is not None
        )
