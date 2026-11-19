from sqlalchemy import select
from sqlalchemy.orm import Session

from waymark.models import TaskExternalShare


class TaskExternalShareGateway:
    """Raw persistence for external task share links."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, row: TaskExternalShare) -> TaskExternalShare:
        self._db.add(row)
        self._db.flush()
        return row

    def get(self, share_id: int) -> TaskExternalShare | None:
        return self._db.get(TaskExternalShare, share_id)

    def get_for_task(self, task_id: int, share_id: int) -> TaskExternalShare | None:
        row = self.get(share_id)
        if row is None or row.task_id != task_id:
            return None
        return row

    def by_token_hash(self, token_hash: str) -> TaskExternalShare | None:
        return self._db.scalar(
            select(TaskExternalShare).where(TaskExternalShare.token_hash == token_hash)
        )

    def list_for_task(self, task_id: int) -> list[TaskExternalShare]:
        return list(
            self._db.scalars(
                select(TaskExternalShare)
                .where(TaskExternalShare.task_id == task_id)
                .order_by(TaskExternalShare.id.desc())
            ).all()
        )

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, row: TaskExternalShare) -> None:
        self._db.refresh(row)
