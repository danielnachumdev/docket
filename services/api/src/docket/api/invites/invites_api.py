from typing import Annotated

from fastapi import APIRouter, Depends, status

from docket.api.invites.invite_service import InviteService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.schemas.invites import InviteCreate, InviteCreatedOut, InviteOut

CanInvite = Annotated[Principal, Depends(RequirePermission("users:admin"))]


class InvitesApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/invites", tags=["invites"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "",
            self.list_invites,
            methods=["GET"],
            response_model=list[InviteOut],
        )
        self.router.add_api_route(
            "",
            self.create_invite,
            methods=["POST"],
            response_model=InviteCreatedOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{invite_id}",
            self.revoke_invite,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def list_invites(self, db: DbSession, principal: CanInvite) -> list[InviteOut]:
        _ = principal
        return InviteService(db).list_invites()

    def create_invite(
        self, body: InviteCreate, db: DbSession, principal: CanInvite
    ) -> InviteCreatedOut:
        return InviteService(db).create(principal, body)

    def revoke_invite(
        self, invite_id: int, db: DbSession, principal: CanInvite
    ) -> None:
        _ = principal
        InviteService(db).revoke(invite_id)


invites_api = InvitesApi()
