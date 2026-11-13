import base64
import binascii
from dataclasses import dataclass
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.artifact_storage import ArtifactStorage, ArtifactStorageFactory
from docket.artifacts.artifact_gateway import ArtifactGateway
from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService
from docket.config import Settings, get_settings
from docket.events import task_event_recorder
from docket.models import Artifact
from docket.schemas import ArtifactCreate, ArtifactUpdate


_IMAGE_MEDIA_BY_EXTENSION = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


@dataclass(frozen=True)
class ArtifactContent:
    data: bytes
    content_type: str
    filename: str

    @property
    def is_image(self) -> bool:
        return self._image_media_type() is not None

    @property
    def response_media_type(self) -> str:
        return self._image_media_type() or self.content_type

    def _image_media_type(self) -> str | None:
        media_type = self.content_type.split(";", 1)[0].strip().lower()
        if media_type.startswith("image/"):
            return self.content_type
        name = self.filename.rsplit("/", 1)[-1].lower()
        dot = name.rfind(".")
        if dot < 0:
            return None
        return _IMAGE_MEDIA_BY_EXTENSION.get(name[dot:])


class ArtifactService:
    def __init__(
        self,
        db: Session,
        *,
        storage: ArtifactStorage | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._db = db
        self._gateway = ArtifactGateway(db)
        self._access = TaskAccessService(db)
        resolved = settings or get_settings()
        self._storage = storage or ArtifactStorageFactory().build(resolved)

    def list_artifacts(self, principal: Principal, task_id: int) -> list[Artifact]:
        task = self._access.get_task(principal, task_id, "tasks:read")
        return self._gateway.list_for_task(task.id)

    def get_artifact(
        self, principal: Principal, task_id: int, artifact_id: int
    ) -> Artifact:
        self._access.get_task(principal, task_id, "tasks:read")
        return self._require_artifact(task_id, artifact_id)

    def get_content(
        self, principal: Principal, task_id: int, artifact_id: int
    ) -> ArtifactContent:
        artifact = self.get_artifact(principal, task_id, artifact_id)
        return self._read_content(artifact)

    def create(
        self, principal: Principal, task_id: int, body: ArtifactCreate
    ) -> Artifact:
        task = self._access.get_task(principal, task_id, "artifacts:write")
        storage_key, content_type, content_text = self._prepare_create_payload(
            task.id, body
        )
        artifact = Artifact(
            task_id=task.id,
            kind=body.kind,
            title=body.title.strip(),
            content_text=content_text,
            storage_key=storage_key,
            content_type=content_type,
            created_by_user_id=principal.user_id,
            created_by_token_id=principal.token_id,
        )
        self._gateway.add(artifact)
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="artifact_added",
            actor=principal,
            payload={
                "artifact_id": artifact.id,
                "kind": artifact.kind,
                "title": artifact.title,
            },
        )
        self._gateway.commit()
        self._gateway.refresh(artifact)
        return artifact

    def update(
        self,
        principal: Principal,
        task_id: int,
        artifact_id: int,
        body: ArtifactUpdate,
    ) -> Artifact:
        task = self._access.get_task(principal, task_id, "artifacts:write")
        artifact = self._require_artifact(task.id, artifact_id)
        changes = self._apply_update(artifact, body)
        if changes:
            task_event_recorder.record(
                self._db,
                task_id=task.id,
                event_type="artifact_updated",
                actor=principal,
                payload={"artifact_id": artifact.id, **changes},
            )
        self._gateway.commit()
        self._gateway.refresh(artifact)
        return artifact

    def delete(
        self, principal: Principal, task_id: int, artifact_id: int
    ) -> None:
        task = self._access.get_task(principal, task_id, "artifacts:write")
        artifact = self._require_artifact(task.id, artifact_id)
        storage_key = artifact.storage_key
        title = artifact.title
        kind = artifact.kind
        self._gateway.delete(artifact)
        if storage_key:
            self._storage.delete(storage_key)
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="artifact_deleted",
            actor=principal,
            payload={"artifact_id": artifact_id, "kind": kind, "title": title},
        )
        self._gateway.commit()

    def _require_artifact(self, task_id: int, artifact_id: int) -> Artifact:
        artifact = self._gateway.get_for_task(task_id, artifact_id)
        if artifact is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Artifact not found")
        return artifact

    def _prepare_create_payload(
        self, task_id: int, body: ArtifactCreate
    ) -> tuple[str | None, str | None, str | None]:
        if body.kind == "file":
            return self._store_file_payload(task_id, body)
        if body.kind == "link" and not (body.content_text or "").strip():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "link artifacts require content_text URL"
            )
        return None, body.content_type, body.content_text

    def _store_file_payload(
        self, task_id: int, body: ArtifactCreate
    ) -> tuple[str, str | None, str | None]:
        data = self._decode_base64(body.content_base64, required=True)
        key = self._new_storage_key(task_id)
        content_type = body.content_type or "application/octet-stream"
        self._storage.put(key, data, content_type=content_type)
        return key, content_type, body.content_text

    def _apply_update(self, artifact: Artifact, body: ArtifactUpdate) -> dict:
        changes: dict = {}
        if body.title is not None:
            artifact.title = body.title.strip()
            changes["title"] = artifact.title
        if body.content_type is not None:
            artifact.content_type = body.content_type
            changes["content_type"] = artifact.content_type
        if body.content_text is not None:
            artifact.content_text = body.content_text
            changes["content_text"] = True
        if body.content_base64 is not None:
            self._replace_blob(artifact, body)
            changes["content_replaced"] = True
        return changes

    def _replace_blob(self, artifact: Artifact, body: ArtifactUpdate) -> None:
        data = self._decode_base64(body.content_base64, required=True)
        key = artifact.storage_key or self._new_storage_key(artifact.task_id)
        content_type = body.content_type or artifact.content_type or "application/octet-stream"
        self._storage.put(key, data, content_type=content_type)
        artifact.storage_key = key
        artifact.content_type = content_type
        if artifact.kind != "file" and artifact.kind in {"text", "json"}:
            artifact.content_text = None

    def _read_content(self, artifact: Artifact) -> ArtifactContent:
        filename = artifact.title or f"artifact-{artifact.id}"
        if artifact.storage_key:
            try:
                data = self._storage.get(artifact.storage_key)
            except FileNotFoundError as exc:
                raise HTTPException(
                    status.HTTP_404_NOT_FOUND, "Artifact content missing"
                ) from exc
            return ArtifactContent(
                data=data,
                content_type=artifact.content_type or "application/octet-stream",
                filename=filename,
            )
        if artifact.content_text is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "Artifact has no downloadable content"
            )
        return ArtifactContent(
            data=artifact.content_text.encode("utf-8"),
            content_type=artifact.content_type or "text/plain; charset=utf-8",
            filename=filename,
        )

    def _new_storage_key(self, task_id: int) -> str:
        return f"{task_id}/{uuid4().hex}"

    def _decode_base64(self, value: str | None, *, required: bool) -> bytes:
        if value is None or value == "":
            if required:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "file artifacts require content_base64",
                )
            return b""
        try:
            return base64.b64decode(value, validate=True)
        except binascii.Error as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Invalid content_base64"
            ) from exc
