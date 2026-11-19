import base64
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from tests.helpers import bootstrap_owner, invite_and_register_contact
from waymark.config import get_settings
from waymark.main import create_app


def _login(client: TestClient, email: str, password: str = "password1234") -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text


def _create_task(client: TestClient, title: str = "Shared externally") -> str:
    res = client.post("/api/tasks", json={"title": title, "priority": 2})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_create_list_and_guest_detail(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(tmp_path / "arts"))
    get_settings.cache_clear()
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)
    child = client.post("/api/tasks", json={"title": "Child", "parent_task_id": task_id})
    assert child.status_code == 201
    child_id = child.json()["id"]
    art = client.post(f"/api/tasks/{task_id}/artifacts", json={
        "kind": "file", "title": "note.txt",
        "content_base64": base64.b64encode(b"guest-bytes").decode("ascii"),
        "content_type": "text/plain",
    })
    assert art.status_code == 201
    artifact_id = art.json()["id"]
    assert client.post(f"/api/tasks/{task_id}/comments", json={"body": "Hello guest"}).status_code == 201
    first = client.post(f"/api/tasks/{task_id}/external-shares", json={"name": "Public readout"})
    assert first.status_code == 201, first.text
    token = first.json()["token"]
    assert token.startswith("wxs_")
    assert client.post(f"/api/tasks/{task_id}/external-shares", json={"name": "Partner link"}).status_code == 201
    listed = client.get(f"/api/tasks/{task_id}/external-shares")
    assert listed.status_code == 200
    assert len(listed.json()) == 2
    assert all("token" not in row for row in listed.json())
    guest = TestClient(create_app())
    detail = guest.get(f"/api/public/shares/{token}")
    assert detail.status_code == 200, detail.text
    payload = detail.json()
    assert payload["task"]["id"] == task_id
    assert payload["task"]["unread"] is False
    assert payload["task"]["shared"] is False
    assert payload["task"]["claimed_by_token_id"] is None
    assert "watching" not in payload
    assert payload["artifacts"][0]["can_modify"] is False
    assert [c["id"] for c in payload["children"]] == [child_id]
    assert any(c["body"] == "Hello guest" for c in payload["comments"])
    content = guest.get(f"/api/public/shares/{token}/artifacts/{artifact_id}/content")
    assert content.status_code == 200 and content.content == b"guest-bytes"
    activity = guest.get(f"/api/public/shares/{token}/activity")
    assert activity.status_code == 200, activity.text
    kinds = {item["kind"] for item in activity.json()["items"]}
    assert "comment" in kinds
    assert guest.patch(f"/api/tasks/{task_id}", json={"title": "Hacked"}).status_code in {401, 403, 404}


def test_revoke_expiry_and_wrong_token() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)
    created = client.post(f"/api/tasks/{task_id}/external-shares", json={"name": "Temp"})
    share_id, token = created.json()["id"], created.json()["token"]
    guest = TestClient(create_app())
    assert guest.get(f"/api/public/shares/{token}").status_code == 200
    assert client.post(f"/api/tasks/{task_id}/external-shares/{share_id}/revoke").status_code == 200
    assert guest.get(f"/api/public/shares/{token}").status_code == 404
    expired = client.post(f"/api/tasks/{task_id}/external-shares", json={
        "name": "Expired", "expires_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
    })
    assert guest.get(f"/api/public/shares/{expired.json()['token']}").status_code == 404
    assert guest.get("/api/public/shares/wxs_not-a-real-token").status_code == 404


def test_rotate_invalidates_old_token() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)
    created = client.post(f"/api/tasks/{task_id}/external-shares", json={"name": "Rotate me"})
    share_id, old = created.json()["id"], created.json()["token"]
    rotated = client.post(f"/api/tasks/{task_id}/external-shares/{share_id}/rotate")
    new = rotated.json()["token"]
    guest = TestClient(create_app())
    assert guest.get(f"/api/public/shares/{old}").status_code == 404
    assert guest.get(f"/api/public/shares/{new}").status_code == 200


def test_patch_rename_and_expiry() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)
    share_id = client.post(f"/api/tasks/{task_id}/external-shares", json={"name": "Old name"}).json()["id"]
    expires = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    patched = client.patch(f"/api/tasks/{task_id}/external-shares/{share_id}", json={"name": "New name", "expires_at": expires})
    assert patched.status_code == 200 and patched.json()["name"] == "New name"
    cleared = client.patch(f"/api/tasks/{task_id}/external-shares/{share_id}", json={"clear_expires_at": True})
    assert cleared.status_code == 200 and cleared.json()["expires_at"] is None


def test_token_cannot_read_other_task_artifact(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(tmp_path / "arts"))
    get_settings.cache_clear()
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_a, task_b = _create_task(client, "Task A"), _create_task(client, "Task B")
    art_b = client.post(f"/api/tasks/{task_b}/artifacts", json={
        "kind": "file", "title": "secret.txt",
        "content_base64": base64.b64encode(b"secret").decode("ascii"), "content_type": "text/plain",
    }).json()["id"]
    token = client.post(f"/api/tasks/{task_a}/external-shares", json={"name": "A only"}).json()["token"]
    guest = TestClient(create_app())
    assert guest.get(f"/api/public/shares/{token}/artifacts/{art_b}/content").status_code == 404


def test_non_writer_cannot_mint_links() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)
    invite_and_register_contact(client, email="alex@example.com", display_name="Alex")
    assert client.post(f"/api/tasks/{task_id}/shares", json={"email": "alex@example.com", "role": "viewer"}).status_code == 201
    client.post("/api/auth/logout")
    _login(client, "alex@example.com")
    assert client.post(f"/api/tasks/{task_id}/external-shares", json={"name": "Nope"}).status_code in {403, 404}
    assert client.get(f"/api/tasks/{task_id}/external-shares").status_code in {403, 404}
