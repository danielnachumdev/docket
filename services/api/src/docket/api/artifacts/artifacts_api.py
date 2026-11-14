from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response, status

from docket.api.tasks.task_response_mapper import TaskResponseMapper
from docket.artifacts import ArtifactContent, ArtifactService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.models import Artifact, Task
from docket.schemas import ArtifactCreate, ArtifactOut, ArtifactUpdate

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]
CanArtifacts = Annotated[Principal, Depends(RequirePermission("artifacts:write"))]


class ArtifactsApi:
    def __init__(self) -> None:
        self.router = APIRouter(tags=["artifacts"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/api/artifacts",
            self.list_accessible_artifacts,
            methods=["GET"],
            response_model=list[ArtifactOut],
        )
        self.router.add_api_route(
            "/api/tasks/{task_id}/artifacts",
            self.list_artifacts,
            methods=["GET"],
            response_model=list[ArtifactOut],
        )
        self.router.add_api_route(
            "/api/tasks/{task_id}/artifacts",
            self.create_artifact,
            methods=["POST"],
            response_model=ArtifactOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/api/tasks/{task_id}/artifacts/{artifact_id}",
            self.get_artifact,
            methods=["GET"],
            response_model=ArtifactOut,
        )
        self.router.add_api_route(
            "/api/tasks/{task_id}/artifacts/{artifact_id}/content",
            self.get_artifact_content,
            methods=["GET"],
        )
        self.router.add_api_route(
            "/api/tasks/{task_id}/artifacts/{artifact_id}",
            self.update_artifact,
            methods=["PATCH"],
            response_model=ArtifactOut,
        )
        self.router.add_api_route(
            "/api/tasks/{task_id}/artifacts/{artifact_id}",
            self.delete_artifact,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def list_accessible_artifacts(
        self, db: DbSession, principal: CanRead
    ) -> list[ArtifactOut]:
        service = ArtifactService(db)
        mapper = TaskResponseMapper(db)
        rows = service.list_accessible(principal)
        mapper.remember(task for _, task in rows)
        return [
            self._artifact_out(mapper, service, principal, artifact, task)
            for artifact, task in rows
        ]

    def list_artifacts(
        self, task_id: str, db: DbSession, principal: CanRead
    ) -> list[ArtifactOut]:
        service = ArtifactService(db)
        mapper = TaskResponseMapper(db)
        artifacts = service.list_artifacts(principal, task_id)
        return [
            self._artifact_out(mapper, service, principal, artifact)
            for artifact in artifacts
        ]

    def create_artifact(
        self,
        task_id: str,
        body: ArtifactCreate,
        db: DbSession,
        principal: CanArtifacts,
    ) -> ArtifactOut:
        service = ArtifactService(db)
        artifact = service.create(principal, task_id, body)
        return self._artifact_out(
            TaskResponseMapper(db), service, principal, artifact, can_modify=True
        )

    def get_artifact(
        self,
        task_id: str,
        artifact_id: int,
        db: DbSession,
        principal: CanRead,
    ) -> ArtifactOut:
        service = ArtifactService(db)
        artifact = service.get_artifact(principal, task_id, artifact_id)
        return self._artifact_out(
            TaskResponseMapper(db), service, principal, artifact
        )

    def get_artifact_content(
        self,
        task_id: str,
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
        task_id: str,
        artifact_id: int,
        body: ArtifactUpdate,
        db: DbSession,
        principal: CanArtifacts,
    ) -> ArtifactOut:
        service = ArtifactService(db)
        artifact = service.update(principal, task_id, artifact_id, body)
        return self._artifact_out(
            TaskResponseMapper(db), service, principal, artifact, can_modify=True
        )

    def delete_artifact(
        self,
        task_id: str,
        artifact_id: int,
        db: DbSession,
        principal: CanArtifacts,
    ) -> None:
        ArtifactService(db).delete(principal, task_id, artifact_id)

    def _artifact_out(
        self,
        mapper: TaskResponseMapper,
        service: ArtifactService,
        principal: Principal,
        artifact: Artifact,
        task: Task | None = None,
        *,
        can_modify: bool | None = None,
    ) -> ArtifactOut:
        allowed = (
            can_modify
            if can_modify is not None
            else service.can_modify(principal, artifact, task)
        )
        return mapper.artifact_out(
            artifact,
            can_modify=allowed,
            task_title=task.title if task is not None else None,
            task_number=task.owner_task_number if task is not None else None,
        )


artifacts_api = ArtifactsApi()
