from sqlalchemy.orm import Session

from docket.artifacts.artifact_gateway import ArtifactGateway
from docket.artifacts.artifact_library_page import ArtifactLibraryPage
from docket.artifacts.artifact_library_query import ArtifactLibraryQuery
from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService


class ArtifactLibraryService:
    """Accessible-artifact library listing with filter, sort, and pagination."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._gateway = ArtifactGateway(db)
        self._access = TaskAccessService(db)

    def list_page(
        self, principal: Principal, query: ArtifactLibraryQuery
    ) -> ArtifactLibraryPage:
        task_ids = self._access.accessible_task_ids_select(principal.user_id)
        mine_user_id = principal.user_id if query.mine else None
        rows, total = self._gateway.page_with_tasks_for_ids(
            task_ids,
            kind=query.kind,
            q=query.q,
            sort=query.sort,
            mine_user_id=mine_user_id,
            offset=query.offset,
            limit=query.limit,
        )
        kind_counts = self._gateway.kind_counts_for_ids(
            task_ids,
            q=query.q,
            mine_user_id=mine_user_id,
        )
        return ArtifactLibraryPage(
            rows=rows,
            total=total,
            offset=query.offset,
            limit=query.limit,
            kind_counts=kind_counts,
        )
