"""Instance-wide admin backup/restore (SQLite + artifact blobs).

Import is a **destructive replace** of the live database file and restores
artifact blobs via ``ArtifactStorage.put``. Only ``sqlite`` ``database_url``
is supported. Callers must pass ``confirm=replace``.
"""

from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, status

from waymark.api.admin.backup_bundle import BackupBundle
from waymark.api.admin.restored_backup_schema_upgrader import (
    RestoredBackupSchemaUpgrader,
)
from waymark.artifact_storage import ArtifactStorage, ArtifactStorageFactory
from waymark.config import Settings, get_settings
from waymark.db import database
from waymark.schemas.admin_backup import BackupImportResultOut

SCHEMA_VERSION = 1
FORMAT_ID = "waymark.instance_backup.zip"
CONFIRM_REPLACE = "replace"
_BLOBS_PREFIX = "artifacts/blobs/"


class InstanceBackupService:
    def __init__(
        self,
        *,
        storage: ArtifactStorage | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._storage = storage or ArtifactStorageFactory().build(self._settings)

    def export_backup(self) -> BackupBundle:
        self._require_sqlite()
        exported_at = datetime.now(UTC)
        with tempfile.TemporaryDirectory(prefix="waymark-backup-") as tmp:
            tmp_path = Path(tmp)
            db_snapshot = tmp_path / "database.sqlite"
            self._sqlite_backup_to(db_snapshot)
            artifact_entries, blob_files = self._pack_artifacts_from_snapshot(db_snapshot)
            files: dict[str, bytes] = {
                "database.sqlite": db_snapshot.read_bytes(),
                "artifacts/index.json": self._json_bytes(artifact_entries),
            }
            files.update(blob_files)
            included = [e for e in artifact_entries if e.get("content_included")]
            missing = [e for e in artifact_entries if not e.get("content_included")]
            manifest = {
                "schema_version": SCHEMA_VERSION,
                "format": FORMAT_ID,
                "exported_at": exported_at.isoformat(),
                "app_version": self._settings.running_version,
                "database": {
                    "engine": "sqlite",
                    "filename": "database.sqlite",
                },
                "artifact_storage": self._settings.artifact_storage,
                "artifact_count": len(artifact_entries),
                "artifacts_included": len(included),
                "artifact_bytes": sum(int(e.get("byte_size") or 0) for e in included),
                "artifacts_missing": [
                    {"storage_key": e["storage_key"], "error": e.get("content_error")}
                    for e in missing
                ],
            }
            files["manifest.json"] = self._json_bytes(manifest)
            digest = self._bundle_digest(files)
            manifest["bundle_sha256"] = digest
            files["manifest.json"] = self._json_bytes(manifest)
            stamp = exported_at.strftime("%Y%m%dT%H%M%SZ")
            return BackupBundle(
                data=self._zip_payload(files),
                filename=f"waymark-instance-backup-{stamp}.zip",
            )

    def import_backup(
        self, zip_bytes: bytes, *, confirm: str
    ) -> BackupImportResultOut:
        """Replace live SQLite + restore artifact blobs from a backup zip.

        Destructive: overwrites the configured SQLite file and writes blobs
        for every ``artifacts/blobs/*`` entry in the archive.
        """
        if confirm != CONFIRM_REPLACE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Import requires confirm={CONFIRM_REPLACE} "
                "(destructive replace of instance data)",
            )
        self._require_sqlite()
        if not zip_bytes:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Backup zip is empty"
            )

        try:
            zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except zipfile.BadZipFile as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Not a valid zip archive"
            ) from exc

        with zf:
            names = set(zf.namelist())
            if "manifest.json" not in names or "database.sqlite" not in names:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Backup zip missing manifest.json or database.sqlite",
                )
            try:
                manifest = json.loads(zf.read("manifest.json"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "Invalid manifest.json"
                ) from exc
            self._validate_manifest(manifest)
            db_bytes = zf.read("database.sqlite")
            if not db_bytes:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "database.sqlite is empty"
                )
            blobs = self._extract_blobs(zf)

        db_path = self._sqlite_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=db_path.parent, suffix=".sqlite.tmp", delete=False
        ) as tmp:
            tmp.write(db_bytes)
            tmp_path = Path(tmp.name)
        try:
            # Release file locks before replacing the live DB file.
            database.rebind_after_file_replace(tmp_path, db_path)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

        # Bring restored SQLite (possibly older schema, e.g. tasks.body) to head.
        RestoredBackupSchemaUpgrader(
            db_path=self._sqlite_path(),
            database_url=self._settings.database_url,
            api_root=Path(__file__).resolve().parents[4],
        ).upgrade_to_head()

        restored = 0
        total_bytes = 0
        for storage_key, data in blobs:
            self._storage.put(storage_key, data)
            restored += 1
            total_bytes += len(data)

        missing = len(manifest.get("artifacts_missing") or [])
        return BackupImportResultOut(
            exported_at=str(manifest["exported_at"]),
            artifacts_restored=restored,
            artifact_bytes=total_bytes,
            artifacts_missing=missing,
        )

    def _require_sqlite(self) -> None:
        if not self._settings.database_url.startswith("sqlite"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Instance backup/restore only supports sqlite database_url",
            )

    def _sqlite_path(self) -> Path:
        url = self._settings.database_url
        if url.startswith("sqlite:///"):
            # sqlite:///relative and sqlite:////absolute both strip to a usable path.
            return Path(url.removeprefix("sqlite:///"))
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Instance backup/restore only supports sqlite database_url",
        )

    def _sqlite_backup_to(self, dest: Path) -> None:
        src_path = self._sqlite_path()
        if not src_path.is_file():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "SQLite database file not found"
            )
        # Online backup API — consistent snapshot without stopping the server.
        source = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
        try:
            dest_conn = sqlite3.connect(str(dest))
            try:
                source.backup(dest_conn)
            finally:
                dest_conn.close()
        finally:
            source.close()

    def _pack_artifacts_from_snapshot(
        self, snapshot: Path
    ) -> tuple[list[dict], dict[str, bytes]]:
        conn = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
        try:
            rows = conn.execute(
                "SELECT storage_key, content_type, byte_size FROM artifacts "
                "WHERE storage_key IS NOT NULL AND storage_key != ''"
            ).fetchall()
        finally:
            conn.close()

        entries: list[dict] = []
        blobs: dict[str, bytes] = {}
        for storage_key, content_type, byte_size in rows:
            key = str(storage_key)
            path = f"{_BLOBS_PREFIX}{key}"
            try:
                data = self._storage.get(key)
                error = None
                included = True
            except FileNotFoundError:
                data = None
                error = "storage_missing"
                included = False
            except Exception as exc:  # noqa: BLE001 — record and continue
                data = None
                error = f"storage_error:{type(exc).__name__}"
                included = False
            entry = {
                "storage_key": key,
                "content_type": content_type,
                "byte_size": int(byte_size or 0) if data is None else len(data),
                "content_path": path if included else None,
                "content_included": included,
                "content_sha256": (
                    hashlib.sha256(data).hexdigest() if data is not None else None
                ),
                "content_error": error,
            }
            entries.append(entry)
            if data is not None:
                blobs[path] = data
        return entries, blobs

    def _validate_manifest(self, manifest: object) -> None:
        if not isinstance(manifest, dict):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Invalid manifest.json"
            )
        if manifest.get("format") != FORMAT_ID:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported backup format (expected {FORMAT_ID})",
            )
        version = manifest.get("schema_version")
        if version != SCHEMA_VERSION:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported backup schema_version (expected {SCHEMA_VERSION})",
            )
        if not manifest.get("exported_at"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "manifest missing exported_at"
            )

    def _extract_blobs(self, zf: zipfile.ZipFile) -> list[tuple[str, bytes]]:
        blobs: list[tuple[str, bytes]] = []
        for name in zf.namelist():
            if name.endswith("/") or not name.startswith(_BLOBS_PREFIX):
                continue
            relative = name[len(_BLOBS_PREFIX) :]
            if not relative or ".." in Path(relative).parts:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Unsafe artifact path in backup: {name}",
                )
            blobs.append((relative, zf.read(name)))
        return blobs

    def _zip_payload(self, files: dict[str, bytes]) -> bytes:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for name, data in sorted(files.items()):
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
