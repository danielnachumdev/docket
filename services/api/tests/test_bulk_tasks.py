from fastapi.testclient import TestClient

from docket.db import database
from docket.main import create_app
from docket.models import User
from docket.security import password_hasher
from tests.helpers import bootstrap_owner


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


def _create_task(client: TestClient, title: str, *, priority: int = 3) -> int:
    res = client.post("/api/tasks", json={"title": title, "priority": priority})
    assert res.status_code == 201
    return res.json()["id"]


def test_bulk_update_status_and_priority() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    a = _create_task(client, "Blocked A", priority=1)
    b = _create_task(client, "Blocked B", priority=1)
    client.post(f"/api/tasks/{a}/status", json={"status": "blocked"})
    client.post(f"/api/tasks/{b}/status", json={"status": "blocked"})

    res = client.post(
        "/api/tasks/bulk",
        json={"task_ids": [a, b, a], "status": "on_hold", "priority": 3},
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 2
    assert {row["id"] for row in body} == {a, b}
    assert all(row["status"] == "on_hold" for row in body)
    assert all(row["priority"] == 3 for row in body)

    detail_a = client.get(f"/api/tasks/{a}").json()
    types = [e["type"] for e in detail_a["events"]]
    assert "status_changed" in types
    assert "updated" in types


def test_bulk_update_requires_status_or_priority() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client, "Needs field")
    res = client.post("/api/tasks/bulk", json={"task_ids": [task_id]})
    assert res.status_code == 422


def test_bulk_update_unknown_task_is_404_and_atomic() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client, "Known")
    res = client.post(
        "/api/tasks/bulk",
        json={"task_ids": [task_id, 999_999], "status": "on_hold"},
    )
    assert res.status_code == 404
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["status"] == "open"


def test_bulk_update_editor_share_can_write_unowned_denied() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    owned = _create_task(client, "Owner task")
    shared = _create_task(client, "Shared task")
    _create_user("alex@example.com", "Alex", "password123")
    share = client.post(
        f"/api/tasks/{shared}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    assert share.status_code == 201

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    ok = client.post(
        "/api/tasks/bulk",
        json={"task_ids": [shared], "status": "on_hold"},
    )
    assert ok.status_code == 200
    assert ok.json()[0]["status"] == "on_hold"

    denied = client.post(
        "/api/tasks/bulk",
        json={"task_ids": [owned], "status": "on_hold"},
    )
    assert denied.status_code == 404


def test_bulk_update_viewer_share_cannot_write() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client, "View only")
    _create_user("viewer@example.com", "Viewer", "password123")
    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "viewer@example.com", "role": "viewer"},
    )
    assert share.status_code == 201

    client.post("/api/auth/logout")
    _login(client, "viewer@example.com", "password123")
    blocked = client.post(
        "/api/tasks/bulk",
        json={"task_ids": [task_id], "priority": 4},
    )
    assert blocked.status_code == 403
