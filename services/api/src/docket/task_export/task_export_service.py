import hashlib
import io
import json
import re
import zipfile
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from docket.api.tasks.task_gateway import TaskGateway
from docket.api.tasks.task_response_mapper import TaskResponseMapper
from docket.artifact_storage import ArtifactStorage, ArtifactStorageFactory
from docket.artifacts.artifact_gateway import ArtifactGateway
from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService
from docket.config import Settings, get_settings
from docket.models import Artifact, Task
from docket.task_export.task_export_bundle import TaskExportBundle
from docket.task_links import TaskLinkService

SCHEMA_VERSION = 1
FORMAT_ID = "docket.task_export.zip"
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


class TaskExportService:
    """Build an immutable audit zip for a task the principal can read.

    Authorization mirrors task detail: any principal with ``tasks:read`` on
    the task (owner or shared membership) may export. Owner-only is not
    required so viewers/editors can take a case pack for review.
    """

    def __init__(
        self,
        db: Session,
        *,
        storage: ArtifactStorage | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._db = db
        self._gateway = TaskGateway(db)
        self._artifacts = ArtifactGateway(db)
        self._access = TaskAccessService(db)
        self._mapper = TaskResponseMapper(db)
        resolved = settings or get_settings()
        self._storage = storage or ArtifactStorageFactory().build(resolved)

    def export_task(self, principal: Principal, task_ref: str) -> TaskExportBundle:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        exported_at = datetime.now(UTC)
        payload = self._assemble_payload(principal, task, exported_at)
        data = self._zip_payload(payload)
        return TaskExportBundle(
            data=data,
            filename=f"docket-task-{task.public_id}-export.zip",
        )

    def _assemble_payload(
        self, principal: Principal, task: Task, exported_at: datetime
    ) -> dict[str, object]:
        self._mapper.remember([task])
        events = list(reversed(self._gateway.list_events(task.id)))
        links = TaskLinkService(self._db).list_for_task(
            user_id=principal.user_id, task_id=task.id
        )
        children = self._gateway.list_children(task.id)
        artifacts = self._artifacts.list_for_task(task.id)
        artifact_entries, content_files = self._pack_artifacts(artifacts)
        files: dict[str, bytes] = {
            "manifest.json": self._json_bytes(
                {
                    "schema_version": SCHEMA_VERSION,
                    "format": FORMAT_ID,
                    "exported_at": exported_at.isoformat(),
                    "exported_by_user_id": principal.user_id,
                    "task_id": task.public_id,
                }
            ),
            "task.json": self._json_bytes(
                self._mapper.task_out(task).model_dump(mode="json")
            ),
            "events.json": self._json_bytes(
                [self._mapper.event_out(e).model_dump(mode="json") for e in events]
            ),
            "links.json": self._json_bytes(
                [self._mapper.link_out(link).model_dump(mode="json") for link in links]
            ),
            "children.json": self._json_bytes(
                [
                    child.model_dump(mode="json")
                    for child in self._mapper.tasks_out(children)
                ]
            ),
            "artifacts/index.json": self._json_bytes(artifact_entries),
        }
        files.update(content_files)
        digest = self._bundle_digest(files)
        manifest = json.loads(files["manifest.json"])
        manifest["bundle_sha256"] = digest
        files["manifest.json"] = self._json_bytes(manifest)
        return files

    def _pack_artifacts(
        self, artifacts: list[Artifact]
    ) -> tuple[list[dict], dict[str, bytes]]:
        entries: list[dict] = []
        content_files: dict[str, bytes] = {}
        for artifact in artifacts:
            meta = self._mapper.artifact_out(artifact).model_dump(mode="json")
            path, data, error = self._read_artifact_bytes(artifact)
            entry = {
                **meta,
                "content_path": path,
                "content_included": data is not None,
                "content_sha256": (
                    hashlib.sha256(data).hexdigest() if data is not None else None
                ),
                "content_error": error,
            }
            entries.append(entry)
            if path and data is not None:
                content_files[path] = data
        return entries, content_files

    def _read_artifact_bytes(
        self, artifact: Artifact
    ) -> tuple[str | None, bytes | None, str | None]:
        safe = self._safe_filename(artifact.title or f"artifact-{artifact.id}")
        path = f"artifacts/content/{artifact.id}__{safe}"
        if artifact.storage_key:
            try:
                return path, self._storage.get(artifact.storage_key), None
            except FileNotFoundError:
                return path, None, "storage_missing"
        if artifact.content_text is not None:
            return path, artifact.content_text.encode("utf-8"), None
        return None, None, "no_content"

    def _zip_payload(self, files: dict[str, object]) -> bytes:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for name, data in sorted(files.items()):
                assert isinstance(data, bytes)
                info = zipfile.ZipInfo(filename=name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(info, data)
        return buffer.getvalue()

    def _bundle_digest(self, files: dict[str, bytes]) -> str:
        hasher = hashlib.sha256()
        for name in sorted(files):
            hasher.update(name.encode("utf-8"))
            hasher.update(b"\0")
            hasher.update(files[name])
            hasher.update(b"\0")
        return hasher.hexdigest()

    def _json_bytes(self, value: object) -> bytes:
        return json.dumps(value, indent=2, sort_keys=True, default=str).encode("utf-8")

    def _safe_filename(self, title: str) -> str:
        cleaned = _SAFE_NAME.sub("_", title.strip())[:80].strip("._")
        return cleaned or "content"
