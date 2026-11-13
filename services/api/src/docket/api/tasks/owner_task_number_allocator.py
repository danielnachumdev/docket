from sqlalchemy import func, select
from sqlalchemy.orm import Session

from docket.models import Task


class OwnerTaskNumberAllocator:
    """Allocates the next per-owner display number (unique within owner_user_id)."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def next_number(self, owner_user_id: int) -> int:
        current = self._db.scalar(
            select(func.max(Task.owner_task_number)).where(
                Task.owner_user_id == owner_user_id
            )
        )
        return int(current or 0) + 1
