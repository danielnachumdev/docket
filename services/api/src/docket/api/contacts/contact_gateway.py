from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from docket.models import ContactNickname, Membership, RegistrationInvite, Task, User


class ContactGateway:
    """Raw queries for the caller's implicit contacts graph and nicknames."""

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

    def nicknames_for_viewer(
        self, viewer_user_id: int, contact_ids: set[int]
    ) -> dict[int, str]:
        if not contact_ids:
            return {}
        rows = self._db.scalars(
            select(ContactNickname).where(
                ContactNickname.viewer_user_id == viewer_user_id,
                ContactNickname.contact_user_id.in_(contact_ids),
            )
        ).all()
        return {row.contact_user_id: row.nickname for row in rows}

    def contact_ids_matching_nickname(
        self, viewer_user_id: int, contact_ids: set[int], query: str
    ) -> set[int]:
        if not contact_ids or not query.strip():
            return set()
        pattern = f"%{query.strip()}%"
        return set(
            self._db.scalars(
                select(ContactNickname.contact_user_id).where(
                    ContactNickname.viewer_user_id == viewer_user_id,
                    ContactNickname.contact_user_id.in_(contact_ids),
                    ContactNickname.nickname.ilike(pattern),
                )
            ).all()
        )

    def get_nickname_edge(
        self, viewer_user_id: int, contact_user_id: int
    ) -> ContactNickname | None:
        return self._db.scalar(
            select(ContactNickname).where(
                ContactNickname.viewer_user_id == viewer_user_id,
                ContactNickname.contact_user_id == contact_user_id,
            )
        )

    def find_nickname_conflict(
        self,
        viewer_user_id: int,
        nickname_normalized: str,
        *,
        except_contact_user_id: int,
    ) -> ContactNickname | None:
        return self._db.scalar(
            select(ContactNickname).where(
                ContactNickname.viewer_user_id == viewer_user_id,
                ContactNickname.nickname_normalized == nickname_normalized,
                ContactNickname.contact_user_id != except_contact_user_id,
            )
        )

    def upsert_nickname(
        self, viewer_user_id: int, contact_user_id: int, nickname: str
    ) -> ContactNickname:
        row = self.get_nickname_edge(viewer_user_id, contact_user_id)
        normalized = nickname.lower()
        if row is None:
            row = ContactNickname(
                viewer_user_id=viewer_user_id,
                contact_user_id=contact_user_id,
                nickname=nickname,
                nickname_normalized=normalized,
            )
            self._db.add(row)
        else:
            row.nickname = nickname
            row.nickname_normalized = normalized
        self._db.commit()
        self._db.refresh(row)
        return row

    def delete_nickname(self, viewer_user_id: int, contact_user_id: int) -> None:
        row = self.get_nickname_edge(viewer_user_id, contact_user_id)
        if row is None:
            return
        self._db.delete(row)
        self._db.commit()

    def get_user(self, user_id: int) -> User | None:
        return self._db.get(User, user_id)

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
