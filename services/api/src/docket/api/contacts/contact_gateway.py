from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from docket.models import Membership, RegistrationInvite, Task, User


class ContactGateway:
    """Raw queries for the caller's implicit contacts graph."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def collaborator_user_ids(self, user_id: int) -> set[int]:
        collab_task_ids = self._collaborative_task_ids(user_id)
        if not collab_task_ids:
            return set()
        owners = set(
            self._db.scalars(
                select(Task.owner_user_id).where(
                    Task.id.in_(collab_task_ids),
                    Task.owner_user_id != user_id,
                )
            ).all()
        )
        members = set(
            self._db.scalars(
                select(Membership.user_id).where(
                    Membership.scope_type == "task",
                    Membership.scope_task_id.in_(collab_task_ids),
                    Membership.user_id != user_id,
                )
            ).all()
        )
        return owners | members

    def invitee_user_ids(self, user_id: int) -> set[int]:
        return {
            uid
            for uid in self._db.scalars(
                select(RegistrationInvite.consumed_by_user_id).where(
                    RegistrationInvite.created_by_user_id == user_id,
                    RegistrationInvite.consumed_by_user_id.is_not(None),
                )
            ).all()
            if uid is not None
        }

    def users_by_ids(
        self, user_ids: set[int], *, query: str | None
    ) -> list[User]:
        if not user_ids:
            return []
        stmt = select(User).where(User.id.in_(user_ids))
        needle = (query or "").strip()
        if needle:
            pattern = f"%{needle}%"
            stmt = stmt.where(
                or_(
                    User.email.ilike(pattern),
                    User.display_name.ilike(pattern),
                )
            )
        stmt = stmt.order_by(User.display_name.asc(), User.id.asc())
        return list(self._db.scalars(stmt).all())

    def _collaborative_task_ids(self, user_id: int) -> set[int]:
        owned = set(
            self._db.scalars(select(Task.id).where(Task.owner_user_id == user_id)).all()
        )
        shared = set(
            self._db.scalars(
                select(Membership.scope_task_id).where(
                    Membership.user_id == user_id,
                    Membership.scope_type == "task",
                    Membership.scope_task_id.is_not(None),
                )
            ).all()
        )
        return owned | {tid for tid in shared if tid is not None}
