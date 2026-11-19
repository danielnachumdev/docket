from typing import Annotated

from fastapi import APIRouter, Depends, status

from waymark.api.task_external_shares.task_external_share_service import (
    TaskExternalShareService,
)
from waymark.auth import Principal, RequirePermission
from waymark.db import DbSession
from waymark.schemas.external_shares import (
    ExternalShareCreate,
    ExternalShareCreatedOut,
    ExternalShareOut,
    ExternalShareRotatedOut,
    ExternalShareUpdate,
)

CanWrite = Annotated[Principal, Depends(RequirePermission("tasks:write"))]


class TaskExternalSharesApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tasks", tags=["task-external-shares"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route("/{task_id}/external-shares", self.list_shares, methods=["GET"], response_model=list[ExternalShareOut])
        self.router.add_api_route("/{task_id}/external-shares", self.create_share, methods=["POST"], response_model=ExternalShareCreatedOut, status_code=status.HTTP_201_CREATED)
        self.router.add_api_route("/{task_id}/external-shares/{share_id}", self.update_share, methods=["PATCH"], response_model=ExternalShareOut)
        self.router.add_api_route("/{task_id}/external-shares/{share_id}/revoke", self.revoke_share, methods=["POST"], response_model=ExternalShareOut)
        self.router.add_api_route("/{task_id}/external-shares/{share_id}/rotate", self.rotate_share, methods=["POST"], response_model=ExternalShareRotatedOut)

    def list_shares(self, task_id: str, db: DbSession, principal: CanWrite) -> list[ExternalShareOut]:
        return TaskExternalShareService(db).list_shares(principal, task_id)

    def create_share(self, task_id: str, body: ExternalShareCreate, db: DbSession, principal: CanWrite) -> ExternalShareCreatedOut:
        return TaskExternalShareService(db).create(principal, task_id, body)

    def update_share(self, task_id: str, share_id: int, body: ExternalShareUpdate, db: DbSession, principal: CanWrite) -> ExternalShareOut:
        return TaskExternalShareService(db).update(principal, task_id, share_id, body)

    def revoke_share(self, task_id: str, share_id: int, db: DbSession, principal: CanWrite) -> ExternalShareOut:
        return TaskExternalShareService(db).revoke(principal, task_id, share_id)

    def rotate_share(self, task_id: str, share_id: int, db: DbSession, principal: CanWrite) -> ExternalShareRotatedOut:
        return TaskExternalShareService(db).rotate(principal, task_id, share_id)


task_external_shares_api = TaskExternalSharesApi()
