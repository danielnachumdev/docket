from fastapi.testclient import TestClient

from docket.main import create_app
from tests.helpers import bootstrap_owner


def test_bootstrap_login_and_tasks() -> None:
    client = TestClient(create_app())

    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert status.json()["bootstrapped"] is False

    boot = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password123",
        },
    )
    assert boot.status_code == 200
    assert boot.json()["email"] == "ops@example.com"

    me = client.get("/api/auth/me")
    assert me.status_code == 200

    created = client.post(
        "/api/tasks",
        json={"title": "Ship UI", "priority": 1, "body": "Human control plane"},
    )
    assert created.status_code == 201
    task_id = created.json()["id"]

    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["task"]["title"] == "Ship UI"
    assert body["events"][0]["type"] == "created"

    status_res = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "done"

    art = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "done"},
    )
    assert art.status_code == 201

    detail2 = client.get(f"/api/tasks/{task_id}")
    assert len(detail2.json()["artifacts"]) == 1
    assert any(e["type"] == "status_changed" for e in detail2.json()["events"])


def test_task_status_on_hold() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/tasks", json={"title": "Paused work", "priority": 3})
    assert created.status_code == 201
    task_id = created.json()["id"]

    hold = client.post(f"/api/tasks/{task_id}/status", json={"status": "on_hold"})
    assert hold.status_code == 200
    assert hold.json()["status"] == "on_hold"
    assert hold.json()["completed_at"] is None
    assert hold.json()["cancelled_at"] is None

    bad = client.post(f"/api/tasks/{task_id}/status", json={"status": "paused"})
    assert bad.status_code == 422


def test_task_status_failed_with_last_error() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/tasks", json={"title": "Agent job", "priority": 2})
    assert created.status_code == 201
    task_id = created.json()["id"]

    failed = client.post(
        f"/api/tasks/{task_id}/status",
        json={"status": "failed", "last_error": "tool timed out after 30s"},
    )
    assert failed.status_code == 200, failed.text
    body = failed.json()
    assert body["status"] == "failed"
    assert body["last_error"] == "tool timed out after 30s"
    assert body["completed_at"] is None
    assert body["cancelled_at"] is None

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    events = detail.json()["events"]
    status_events = [e for e in events if e["type"] == "status_changed"]
    assert status_events
    assert "tool timed out after 30s" in (status_events[0]["payload_json"] or "")

    reopen = client.post(f"/api/tasks/{task_id}/status", json={"status": "open"})
    assert reopen.status_code == 200
    assert reopen.json()["status"] == "open"
    assert reopen.json()["last_error"] is None
