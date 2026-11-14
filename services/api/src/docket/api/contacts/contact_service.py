from sqlalchemy.orm import Session

from docket.api.contacts.contact_gateway import ContactGateway
from docket.schemas.contacts import ContactOut


class ContactService:
    """Discover people in the caller's collaboration / invite graph."""

    def __init__(self, db: Session) -> None:
        self._gateway = ContactGateway(db)

    def list_contacts(self, user_id: int, *, query: str | None = None) -> list[ContactOut]:
        contact_ids = self._gateway.collaborator_user_ids(
            user_id
        ) | self._gateway.invitee_user_ids(user_id)
        contact_ids.discard(user_id)
        users = self._gateway.users_by_ids(contact_ids, query=query)
        return [
            ContactOut(id=u.id, email=u.email, display_name=u.display_name)
            for u in users
        ]
