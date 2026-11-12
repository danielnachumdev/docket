import base64
from pathlib import Path

from fastapi.testclient import TestClient

from docket.config import get_settings
from docket.main import create_app


def _bootstrap(client: TestClient) -> None:
    res = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password123",
        },
    )
    assert res.status_code == 200


def _create_task(client: TestClient) -> int:
    res = client.post("/api/tasks", json={"title": "Demo task", "priority": 2})
    assert res.status_code == 201
    return res.json()["id"]


def test_artifact_crud_text_and_file(tmp_path: Path, monkeypatch) -> None:
    artifact_root = tmp_path / "arts"
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    get_settings.cache_clear()

    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hello ops"},
    )
    assert created.status_code == 201
    text_id = created.json()["id"]
    assert created.json()["storage_key"] is None

    listed = client.get(f"/api/tasks/{task_id}/artifacts")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    got = client.get(f"/api/tasks/{task_id}/artifacts/{text_id}")
    assert got.status_code == 200
    assert got.json()["title"] == "Note"

    text_content = client.get(f"/api/tasks/{task_id}/artifacts/{text_id}/content")
    assert text_content.status_code == 200
    assert text_content.content == b"hello ops"

    patched = client.patch(
        f"/api/tasks/{task_id}/artifacts/{text_id}",
        json={"title": "Updated note", "content_text": "revised"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Updated note"

    payload = base64.b64encode(b"file-bytes").decode("ascii")
    file_created = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "demo.txt",
            "content_base64": payload,
            "content_type": "text/plain",
        },
    )
    assert file_created.status_code == 201
    file_body = file_created.json()
    assert file_body["storage_key"]
    assert file_body["content_type"] == "text/plain"
    file_id = file_body["id"]

    stored = artifact_root / file_body["storage_key"]
    assert stored.is_file()
    assert stored.read_bytes() == b"file-bytes"

    downloaded = client.get(f"/api/tasks/{task_id}/artifacts/{file_id}/content")
    assert downloaded.status_code == 200
    assert downloaded.content == b"file-bytes"
    assert downloaded.headers["content-type"].startswith("text/plain")

    replaced = base64.b64encode(b"new-bytes").decode("ascii")
    file_patched = client.patch(
        f"/api/tasks/{task_id}/artifacts/{file_id}",
        json={"content_base64": replaced, "content_type": "text/plain"},
    )
    assert file_patched.status_code == 200
    assert client.get(f"/api/tasks/{task_id}/artifacts/{file_id}/content").content == b"new-bytes"

    deleted = client.delete(f"/api/tasks/{task_id}/artifacts/{file_id}")
    assert deleted.status_code == 204
    assert not stored.exists()
    assert client.get(f"/api/tasks/{task_id}/artifacts/{file_id}").status_code == 404

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    events = {e["type"] for e in detail.json()["events"]}
    assert "artifact_added" in events
    assert "artifact_updated" in events
    assert "artifact_deleted" in events
    assert len(detail.json()["artifacts"]) == 1


def test_artifact_file_requires_base64() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    missing = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "file", "title": "empty.bin"},
    )
    assert missing.status_code == 400

    bad = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "file",
            "title": "bad.bin",
            "content_base64": "!!!not-base64!!!",
        },
    )
    assert bad.status_code == 400


def test_artifact_link_and_missing() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = _create_task(client)

    link = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={
            "kind": "link",
            "title": "Docs",
            "content_text": "https://example.com/docs",
        },
    )
    assert link.status_code == 201

    bare_link = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "link", "title": "Broken"},
    )
    assert bare_link.status_code == 400

    assert client.get(f"/api/tasks/{task_id}/artifacts/99999").status_code == 404
    assert client.delete(f"/api/tasks/{task_id}/artifacts/99999").status_code == 404
