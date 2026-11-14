from sqlalchemy.orm import Session

from docket.api.admin.storage_stats_gateway import StorageStatsGateway
from docket.schemas.admin_storage import (
    StorageKindTotalOut,
    StorageOverviewOut,
    StorageTaskOut,
    StorageUploaderOut,
)


class StorageStatsService:
    def __init__(self, db: Session) -> None:
        self._gateway = StorageStatsGateway(db)

    def overview(self) -> StorageOverviewOut:
        by_kind = self._gateway.totals_by_kind()
        by_uploader = self._gateway.totals_by_uploader()
        top_tasks = self._gateway.top_tasks_by_size(limit=10)
        return StorageOverviewOut(
            artifact_count=sum(row.artifact_count for row in by_kind),
            stored_bytes=sum(row.stored_bytes for row in by_kind),
            by_kind=[
                StorageKindTotalOut(
                    kind=row.kind,
                    artifact_count=row.artifact_count,
                    stored_bytes=row.stored_bytes,
                )
                for row in sorted(by_kind, key=lambda r: r.kind)
            ],
            by_uploader=[
                StorageUploaderOut(
                    user_id=row.user_id,
                    email=row.email,
                    display_name=row.display_name,
                    artifact_count=row.artifact_count,
                    stored_bytes=row.stored_bytes,
                )
                for row in by_uploader
            ],
            top_tasks=[
                StorageTaskOut(
                    task_id=row.public_id,
                    task_number=row.task_number,
                    title=row.title,
                    artifact_count=row.artifact_count,
                    stored_bytes=row.stored_bytes,
                )
                for row in top_tasks
            ],
        )
