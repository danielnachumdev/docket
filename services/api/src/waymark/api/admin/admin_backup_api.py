from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile

from waymark.api.admin.backup_service import CONFIRM_REPLACE, InstanceBackupService
from waymark.auth import Principal, RequirePermission
from waymark.schemas.admin_backup import BackupImportResultOut

CanAdminUsers = Annotated[Principal, Depends(RequirePermission("users:admin"))]


class AdminBackupApi:
    """Full-instance backup export/import (SQLite + artifact blobs)."""

    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/admin/backup", tags=["admin"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/export",
            self.export_backup,
            methods=["GET"],
        )
        self.router.add_api_route(
            "/import",
            self.import_backup,
            methods=["POST"],
            response_model=BackupImportResultOut,
        )

    def export_backup(self, principal: CanAdminUsers) -> Response:
        _ = principal
        bundle = InstanceBackupService().export_backup()
        disposition = f"attachment; filename*=UTF-8''{quote(bundle.filename)}"
        return Response(
            content=bundle.data,
            media_type=bundle.content_type,
            headers={
                "Content-Disposition": disposition,
                "Cache-Control": "no-store",
            },
        )

    async def import_backup(
        self,
        principal: CanAdminUsers,
        file: Annotated[UploadFile, File(description="Instance backup zip")],
        confirm: Annotated[
            str,
            Form(
                description=(
                    f"Must be '{CONFIRM_REPLACE}' — destructive replace of "
                    "SQLite + restored artifact blobs"
                )
            ),
        ],
    ) -> BackupImportResultOut:
        _ = principal
        zip_bytes = await file.read()
        return InstanceBackupService().import_backup(zip_bytes, confirm=confirm)


admin_backup_api = AdminBackupApi()
