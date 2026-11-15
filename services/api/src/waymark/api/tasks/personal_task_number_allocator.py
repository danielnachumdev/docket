from sqlalchemy import func, select
from sqlalchemy.orm import Session

from waymark.models import Membership, Task


class PersonalTaskNumberAllocator:
    """Allocates the next per-user display number across owned + shared tasks."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def next_number(self, user_id: int) -> int:
        owned = self._db.scalar(
            select(func.max(Task.owner_task_number)).where(
                Task.owner_user_id == user_id
            )
        )
        shared = self._db.scalar(
            select(func.max(Membership.viewer_task_number)).where(
                Membership.user_id == user_id,
                Membership.scope_type == "task",
                Membership.viewer_task_number.is_not(None),
            )
        )
        return max(int(owned or 0), int(shared or 0)) + 1
