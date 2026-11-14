from typing import Annotated

from fastapi import APIRouter, Depends

from docket.api.admin.storage_stats_service import StorageStatsService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.schemas.admin_storage import StorageOverviewOut

CanAdminUsers = Annotated[Principal, Depends(RequirePermission("users:admin"))]


class AdminStorageApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/admin", tags=["admin"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/storage",
            self.get_storage_overview,
            methods=["GET"],
            response_model=StorageOverviewOut,
        )

    def get_storage_overview(
        self, db: DbSession, principal: CanAdminUsers
    ) -> StorageOverviewOut:
        _ = principal
        return StorageStatsService(db).overview()


admin_storage_api = AdminStorageApi()
