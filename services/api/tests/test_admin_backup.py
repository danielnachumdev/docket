import base64
import io
import json
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import select

from waymark.db import database
from waymark.main import create_app
from waymark.models import Membership, Role, User
from waymark.security import password_hasher
from tests.helpers import bootstrap_owner


OWNER_PASSWORD = "password1234"
MEMBER_PASSWORD = "SecurePass12"


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text


def _create_member_user(email: str = "alex@example.com") -> User:
    db = database.SessionLocal()
    try:
        role = db.scalar(select(Role).where(Role.name == "member"))
        assert role is not None
        user = User(
            email=email,
            display_name="Alex",
            password_hash=password_hasher.hash(MEMBER_PASSWORD),
        )
        db.add(user)
        db.flush()
        db.add(
            Membership(
                user_id=user.id,
                role_id=role.id,
                scope_type="global",
                scope_task_id=None,
            )
        )
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _create_task(client: TestClient, title: str = "Backup demo") -> str:
    res = client.post("/api/tasks", json={"title": title, "priority": 2})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _create_file_artifact(client: TestClient, task_id: str, payload: bytes) -> int:
    encoded = base64.b64encode(payload).decode("ascii")
    res = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "note.txt",
            "content_base64": encoded,
            "content_type": "text/plain",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_admin_backup_requires_auth_and_users_admin() -> None:
    client = TestClient(create_app())

    anon_export = client.get("/api/admin/backup/export")
    assert anon_export.status_code == 401
    anon_import = client.post(
        "/api/admin/backup/import",
        files={"file": ("b.zip", b"PK\x03\x04", "application/zip")},
        data={"confirm": "replace"},
    )
    assert anon_import.status_code == 401

    bootstrap_owner(client)
    owner_export = client.get("/api/admin/backup/export")
    assert owner_export.status_code == 200, owner_export.text

    client.post("/api/auth/logout")
    _create_member_user()
    _login(client, "alex@example.com", MEMBER_PASSWORD)
    forbidden_export = client.get("/api/admin/backup/export")
    assert forbidden_export.status_code == 403
    forbidden_import = client.post(
        "/api/admin/backup/import",
        files={"file": ("b.zip", b"PK\x03\x04", "application/zip")},
        data={"confirm": "replace"},
    )
    assert forbidden_import.status_code == 403


def test_admin_backup_export_zip_contains_sqlite_and_artifact() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client, "Alpha pack")
    payload = b"file-bytes-for-backup"
    artifact_id = _create_file_artifact(client, task_id, payload)

    res = client.get("/api/admin/backup/export")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("application/zip")
    assert "waymark-instance-backup-" in res.headers.get("content-disposition", "")

    with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
        names = set(zf.namelist())
        assert "manifest.json" in names
        assert "database.sqlite" in names
        assert "artifacts/index.json" in names
        blob_names = [n for n in names if n.startswith("artifacts/blobs/")]
        assert len(blob_names) == 1
        assert zf.read(blob_names[0]) == payload

        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["schema_version"] == 1
        assert manifest["format"] == "waymark.instance_backup.zip"
        assert manifest["exported_at"]
        assert manifest["artifacts_included"] == 1
        assert manifest["artifact_bytes"] == len(payload)
        assert manifest["bundle_sha256"]

        index = json.loads(zf.read("artifacts/index.json"))
        assert len(index) == 1
        assert index[0]["content_included"] is True

    content = client.get(f"/api/tasks/{task_id}/artifacts/{artifact_id}/content")
    assert content.status_code == 200
    assert content.content == payload


def test_admin_backup_round_trip_restores_task_and_artifact() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client, "Original title")
    payload = b"round-trip-bytes"
    artifact_id = _create_file_artifact(client, task_id, payload)

    export = client.get("/api/admin/backup/export")
    assert export.status_code == 200
    backup_zip = export.content

    mutated = client.patch(
        f"/api/tasks/{task_id}",
        json={"title": "Mutated after export"},
    )
    assert mutated.status_code == 200
    assert mutated.json()["title"] == "Mutated after export"

    restore = client.post(
        "/api/admin/backup/import",
        files={"file": ("backup.zip", backup_zip, "application/zip")},
        data={"confirm": "replace"},
    )
    assert restore.status_code == 200, restore.text
    body = restore.json()
    assert body["artifacts_restored"] == 1
    assert body["artifact_bytes"] == len(payload)
    assert body["exported_at"]

    task = client.get(f"/api/tasks/{task_id}")
    assert task.status_code == 200, task.text
    assert task.json()["task"]["title"] == "Original title"

    content = client.get(f"/api/tasks/{task_id}/artifacts/{artifact_id}/content")
    assert content.status_code == 200
    assert content.content == payload


def test_admin_backup_import_requires_confirm() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    export = client.get("/api/admin/backup/export")
    assert export.status_code == 200

    missing = client.post(
        "/api/admin/backup/import",
        files={"file": ("backup.zip", export.content, "application/zip")},
    )
    assert missing.status_code == 422

    wrong = client.post(
        "/api/admin/backup/import",
        files={"file": ("backup.zip", export.content, "application/zip")},
        data={"confirm": "yes"},
    )
    assert wrong.status_code == 400
    assert "confirm=replace" in wrong.json()["detail"]


def test_admin_backup_import_rejects_garbage_zip() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    garbage = client.post(
        "/api/admin/backup/import",
        files={"file": ("backup.zip", b"not-a-zip", "application/zip")},
        data={"confirm": "replace"},
    )
    assert garbage.status_code == 400

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "hello")
    non_backup = client.post(
        "/api/admin/backup/import",
        files={"file": ("backup.zip", buf.getvalue(), "application/zip")},
        data={"confirm": "replace"},
    )
    assert non_backup.status_code == 400

    buf2 = io.BytesIO()
    with zipfile.ZipFile(buf2, "w") as zf:
        zf.writestr(
            "manifest.json",
            json.dumps(
                {
                    "schema_version": 1,
                    "format": "waymark.task_export.zip",
                    "exported_at": "2020-01-01T00:00:00+00:00",
                }
            ),
        )
        zf.writestr("database.sqlite", b"not-really-sqlite")
    wrong_format = client.post(
        "/api/admin/backup/import",
        files={"file": ("backup.zip", buf2.getvalue(), "application/zip")},
        data={"confirm": "replace"},
    )
    assert wrong_format.status_code == 400
    assert "Unsupported backup format" in wrong_format.json()["detail"]
