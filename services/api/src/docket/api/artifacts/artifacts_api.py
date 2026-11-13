from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response, status

from docket.artifacts import ArtifactContent, ArtifactService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.models import Artifact
from docket.schemas import ArtifactCreate, ArtifactOut, ArtifactUpdate

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]
CanArtifacts = Annotated[Principal, Depends(RequirePermission("artifacts:write"))]


class ArtifactsApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tasks", tags=["artifacts"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/{task_id}/artifacts",
            self.list_artifacts,
            methods=["GET"],
            response_model=list[ArtifactOut],
        )
        self.router.add_api_route(
            "/{task_id}/artifacts",
            self.create_artifact,
            methods=["POST"],
            response_model=ArtifactOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{task_id}/artifacts/{artifact_id}",
            self.get_artifact,
            methods=["GET"],
            response_model=ArtifactOut,
        )
        self.router.add_api_route(
            "/{task_id}/artifacts/{artifact_id}/content",
            self.get_artifact_content,
            methods=["GET"],
        )
        self.router.add_api_route(
            "/{task_id}/artifacts/{artifact_id}",
            self.update_artifact,
            methods=["PATCH"],
            response_model=ArtifactOut,
        )
        self.router.add_api_route(
            "/{task_id}/artifacts/{artifact_id}",
            self.delete_artifact,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def list_artifacts(
        self, task_id: int, db: DbSession, principal: CanRead
    ) -> list[Artifact]:
        return ArtifactService(db).list_artifacts(principal, task_id)

    def create_artifact(
        self,
        task_id: int,
        body: ArtifactCreate,
        db: DbSession,
        principal: CanArtifacts,
    ) -> Artifact:
        return ArtifactService(db).create(principal, task_id, body)

    def get_artifact(
        self,
        task_id: int,
        artifact_id: int,
        db: DbSession,
        principal: CanRead,
    ) -> Artifact:
        return ArtifactService(db).get_artifact(principal, task_id, artifact_id)

    def get_artifact_content(
        self,
        task_id: int,
        artifact_id: int,
        db: DbSession,
        principal: CanRead,
    ) -> Response:
        content = ArtifactService(db).get_content(principal, task_id, artifact_id)
        return Response(
            content=content.data,
            media_type=content.response_media_type,
            headers={"Content-Disposition": self._content_disposition(content)},
        )

    def _content_disposition(self, content: ArtifactContent) -> str:
        kind = "inline" if content.is_image else "attachment"
        return f"{kind}; filename*=UTF-8''{quote(content.filename)}"

    def update_artifact(
        self,
        task_id: int,
        artifact_id: int,
        body: ArtifactUpdate,
        db: DbSession,
        principal: CanArtifacts,
    ) -> Artifact:
        return ArtifactService(db).update(principal, task_id, artifact_id, body)

    def delete_artifact(
        self,
        task_id: int,
        artifact_id: int,
        db: DbSession,
        principal: CanArtifacts,
    ) -> None:
        ArtifactService(db).delete(principal, task_id, artifact_id)


artifacts_api = ArtifactsApi()
