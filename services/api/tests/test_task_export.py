import base64
import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from docket.config import get_settings
from docket.db import database
from docket.main import create_app
from docket.models import User
from docket.security import password_hasher
from helpers import bootstrap_owner


def _create_task(client: TestClient, title: str = "Audit case") -> int:
    res = client.post(
        "/api/tasks",
        json={"title": title, "priority": 2, "body": "case notes"},
    )
    assert res.status_code == 201
    return res.json()["id"]


def _create_user(email: str, display_name: str, password: str) -> User:
    session = database.session()
    try:
        user = User(
            email=email,
            display_name=display_name,
            password_hash=password_hasher.hash(password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user
    finally:
        session.close()


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200


def _open_export(client: TestClient, task_id: int) -> zipfile.ZipFile:
    res = client.get(f"/api/tasks/{task_id}/export")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/zip")
    assert "docket-task-" in res.headers.get("content-disposition", "")
    return zipfile.ZipFile(io.BytesIO(res.content))


def test_export_includes_task_events_artifacts(tmp_path: Path, monkeypatch) -> None:
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)

    text = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hello audit"},
    )
    assert text.status_code == 201
    text_id = text.json()["id"]

    payload = base64.b64encode(b"file-bytes").decode("ascii")
    file_art = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "demo-note.txt",
            "content_base64": payload,
            "content_type": "text/plain",
        },
    )
    assert file_art.status_code == 201
    file_id = file_art.json()["id"]

    child = client.post(
        "/api/tasks",
        json={"title": "Child step", "parent_task_id": task_id},
    )
    assert child.status_code == 201

    with _open_export(client, task_id) as zf:
        names = set(zf.namelist())
        assert {
            "manifest.json",
            "task.json",
            "events.json",
            "links.json",
            "children.json",
            "artifacts/index.json",
        } <= names

        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["schema_version"] == 1
        assert manifest["format"] == "docket.task_export.zip"
        assert manifest["task_id"] == task_id
        assert manifest["bundle_sha256"]

        task = json.loads(zf.read("task.json"))
        assert task["id"] == task_id
        assert task["title"] == "Audit case"
        assert task["body"] == "case notes"

        events = json.loads(zf.read("events.json"))
        assert isinstance(events, list)
        assert any(e["type"] == "created" for e in events)
        assert any(e["type"] == "artifact_added" for e in events)
        assert events[0]["type"] == "created"

        children = json.loads(zf.read("children.json"))
        assert len(children) == 1
        assert children[0]["title"] == "Child step"

        index = json.loads(zf.read("artifacts/index.json"))
        by_id = {row["id"]: row for row in index}
        assert by_id[text_id]["content_included"] is True
        assert by_id[file_id]["content_included"] is True
        assert zf.read(by_id[text_id]["content_path"]) == b"hello audit"
        assert zf.read(by_id[file_id]["content_path"]) == b"file-bytes"


def test_export_allows_shared_viewer_not_stranger() -> None:
    """RBAC: anyone with tasks:read on the task may export (not owner-only)."""
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)
    _create_user("alex@example.com", "Alex", "password123")

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    # No membership → no tasks:read
    denied = client.get(f"/api/tasks/{task_id}/export")
    assert denied.status_code == 403

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password1234")
    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    allowed = client.get(f"/api/tasks/{task_id}/export")
    assert allowed.status_code == 200
    assert allowed.headers["content-type"].startswith("application/zip")


def test_export_missing_blob_still_includes_metadata(
    tmp_path: Path, monkeypatch
) -> None:
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)

    payload = base64.b64encode(b"gone-soon").decode("ascii")
    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "ephemeral.bin",
            "content_base64": payload,
            "content_type": "application/octet-stream",
        },
    )
    assert created.status_code == 201
    body = created.json()
    stored = artifact_root / body["storage_key"]
    assert stored.is_file()
    stored.unlink()

    with _open_export(client, task_id) as zf:
        index = json.loads(zf.read("artifacts/index.json"))
        assert len(index) == 1
        assert index[0]["content_included"] is False
        assert index[0]["content_error"] == "storage_missing"
        assert index[0]["content_path"] not in zf.namelist()
