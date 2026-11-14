from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.api.contacts.contact_gateway import ContactGateway
from docket.models import User
from docket.schemas.contacts import ContactOut


class ContactService:
    """Discover people in the caller's collaboration / invite graph."""

    def __init__(self, db: Session) -> None:
        self._gateway = ContactGateway(db)

    def list_contacts(self, user_id: int, *, query: str | None = None) -> list[ContactOut]:
        contact_ids = self._contact_ids(user_id)
        nicknames = self._gateway.nicknames_for_viewer(user_id, contact_ids)
        users = self._users_for_query(user_id, contact_ids, query=query)
        return [
            ContactOut(
                id=u.id,
                email=u.email,
                display_name=u.display_name,
                nickname=nicknames.get(u.id),
            )
            for u in users
        ]

    def patch_nickname(
        self, viewer_user_id: int, contact_user_id: int, nickname: str | None
    ) -> ContactOut:
        contact_ids = self._contact_ids(viewer_user_id)
        if contact_user_id not in contact_ids:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        contact = self._gateway.get_user(contact_user_id)
        if contact is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        if nickname is None:
            self._gateway.delete_nickname(viewer_user_id, contact_user_id)
            return self._contact_out(contact, None)
        self._ensure_nickname_unique(viewer_user_id, contact_user_id, nickname)
        row = self._gateway.upsert_nickname(
            viewer_user_id, contact_user_id, nickname
        )
        return self._contact_out(contact, row.nickname)

    def _contact_ids(self, user_id: int) -> set[int]:
        contact_ids = self._gateway.collaborator_user_ids(
            user_id
        ) | self._gateway.invitee_user_ids(user_id)
        contact_ids.discard(user_id)
        return contact_ids

    def _users_for_query(
        self,
        viewer_user_id: int,
        contact_ids: set[int],
        *,
        query: str | None,
    ) -> list[User]:
        needle = (query or "").strip()
        if not needle:
            return self._gateway.users_by_ids(contact_ids, query=None)
        by_profile = {
            u.id: u
            for u in self._gateway.users_by_ids(contact_ids, query=needle)
        }
        nick_hits = self._gateway.contact_ids_matching_nickname(
            viewer_user_id, contact_ids, needle
        )
        missing = nick_hits - by_profile.keys()
        if missing:
            for user in self._gateway.users_by_ids(missing, query=None):
                by_profile[user.id] = user
        users = list(by_profile.values())
        users.sort(key=lambda u: (u.display_name.lower(), u.id))
        return users

    def _ensure_nickname_unique(
        self, viewer_user_id: int, contact_user_id: int, nickname: str
    ) -> None:
        conflict = self._gateway.find_nickname_conflict(
            viewer_user_id,
            nickname.lower(),
            except_contact_user_id=contact_user_id,
        )
        if conflict is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Nickname already used for another contact",
            )

    @staticmethod
    def _contact_out(user: User, nickname: str | None) -> ContactOut:
        return ContactOut(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            nickname=nickname,
        )
