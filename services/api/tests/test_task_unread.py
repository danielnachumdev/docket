"""Shared (user-independent) task read/unread indicators."""

from fastapi.testclient import TestClient

from docket.main import create_app
from tests.helpers import bootstrap_owner


def test_update_marks_unread_and_list_exposes_flag() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    created = client.post("/api/tasks", json={"title": "Ledger sync", "priority": 2})
    assert created.status_code == 201
    task = created.json()
    assert task["unread"] is False
    task_id = task["id"]

    patched = client.patch(f"/api/tasks/{task_id}", json={"body": "agent update"})
    assert patched.status_code == 200
    assert patched.json()["unread"] is True

    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    row = next(t for t in listed.json() if t["id"] == task_id)
    assert row["unread"] is True


def test_status_change_and_comment_mark_unread() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Status work"}).json()["id"]
    client.post(f"/api/tasks/{task_id}/read")

    status = client.post(f"/api/tasks/{task_id}/status", json={"status": "in_progress"})
    assert status.status_code == 200
    assert status.json()["unread"] is True

    client.post(f"/api/tasks/{task_id}/read")
    comment = client.post(f"/api/tasks/{task_id}/comments", json={"body": "ping"})
    assert comment.status_code == 201
    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.json()["task"]["unread"] is True


def test_mark_read_on_view_endpoint_is_idempotent() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Read me"}).json()["id"]
    client.patch(f"/api/tasks/{task_id}", json={"title": "Read me now"})

    first = client.post(f"/api/tasks/{task_id}/read")
    assert first.status_code == 200
    assert first.json()["unread"] is False

    second = client.post(f"/api/tasks/{task_id}/read")
    assert second.status_code == 200
    assert second.json()["unread"] is False


def test_manual_mark_unread_is_idempotent() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Toggle"}).json()["id"]
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["unread"] is False

    first = client.post(f"/api/tasks/{task_id}/unread")
    assert first.status_code == 200
    assert first.json()["unread"] is True

    second = client.post(f"/api/tasks/{task_id}/unread")
    assert second.status_code == 200
    assert second.json()["unread"] is True

    cleared = client.post(f"/api/tasks/{task_id}/read")
    assert cleared.json()["unread"] is False


def test_artifact_add_marks_unread() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "With artifact"}).json()["id"]

    art = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hello"},
    )
    assert art.status_code == 201
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["unread"] is True
