from fastapi.testclient import TestClient

from docket.main import create_app


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
