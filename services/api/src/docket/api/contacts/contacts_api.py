from fastapi import APIRouter, Query

from docket.api.contacts.contact_service import ContactService
from docket.auth import AuthenticatedPrincipal
from docket.db import DbSession
from docket.schemas.contacts import ContactOut


class ContactsApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/me/contacts", tags=["contacts"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "",
            self.list_contacts,
            methods=["GET"],
            response_model=list[ContactOut],
        )

    def list_contacts(
        self,
        db: DbSession,
        principal: AuthenticatedPrincipal,
        q: str | None = Query(default=None, max_length=200),
    ) -> list[ContactOut]:
        return ContactService(db).list_contacts(principal.user_id, query=q)


contacts_api = ContactsApi()
