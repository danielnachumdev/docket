from fastapi.testclient import TestClient

from docket.db import database
from docket.main import create_app
from docket.models import User
from docket.security import password_hasher


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


def test_watch_status_change_creates_notification() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Watched board"}).json()["id"]

    alex = _create_user("alex@example.com", "Alex", "password123")
    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    assert share.status_code == 201

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    watch = client.put(f"/api/tasks/{task_id}/watch")
    assert watch.status_code == 200
    assert watch.json() == {"watching": True}

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    assert detail.json()["watching"] is True

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password123")
    status_res = client.post(
        f"/api/tasks/{task_id}/status", json={"status": "in_progress"}
    )
    assert status_res.status_code == 200

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    count = client.get("/api/notifications/unread-count")
    assert count.status_code == 200
    assert count.json()["count"] == 1

    feed = client.get("/api/notifications")
    assert feed.status_code == 200
    assert len(feed.json()) == 1
    note = feed.json()[0]
    assert note["kind"] == "status_changed"
    assert note["task_id"] == task_id
    assert note["user_id"] == alex.id
    assert note["read_at"] is None

    marked = client.post(f"/api/notifications/{note['id']}/read")
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None
    assert client.get("/api/notifications/unread-count").json()["count"] == 0


def test_comment_mentions_and_watchers() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Mention me"}).json()["id"]

    alex = _create_user("alex@example.com", "Alex", "password123")
    _create_user("blair@example.com", "Blair", "password123")
    client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "blair@example.com", "role": "viewer"},
    )

    client.post("/api/auth/logout")
    _login(client, "blair@example.com", "password123")
    assert client.put(f"/api/tasks/{task_id}/watch").status_code == 200

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password123")
    commented = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Please review @alex@example.com — thanks"},
    )
    assert commented.status_code == 201
    body = commented.json()
    assert body["mentioned_user_ids"] == [alex.id]
    assert "body" in body

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    alex_feed = client.get("/api/notifications").json()
    assert len(alex_feed) == 1
    assert alex_feed[0]["kind"] == "mentioned"

    client.post("/api/auth/logout")
    _login(client, "blair@example.com", "password123")
    blair_feed = client.get("/api/notifications").json()
    assert len(blair_feed) == 1
    assert blair_feed[0]["kind"] == "commented"

    detail = client.get(f"/api/tasks/{task_id}").json()
    comment_events = [e for e in detail["events"] if e["type"] == "commented"]
    assert len(comment_events) == 1


def test_unwatch_stops_notifications_and_actor_skipped() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Quiet"}).json()["id"]
    _create_user("alex@example.com", "Alex", "password123")
    client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    client.put(f"/api/tasks/{task_id}/watch")
    client.delete(f"/api/tasks/{task_id}/watch")
    assert client.get(f"/api/tasks/{task_id}/watch").json() == {"watching": False}

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password123")
    client.put(f"/api/tasks/{task_id}/watch")
    client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})

    assert client.get("/api/notifications/unread-count").json()["count"] == 0

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    assert client.get("/api/notifications/unread-count").json()["count"] == 0


def test_mark_all_read() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Batch"}).json()["id"]
    _create_user("alex@example.com", "Alex", "password123")
    client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    client.put(f"/api/tasks/{task_id}/watch")

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password123")
    client.post(f"/api/tasks/{task_id}/status", json={"status": "blocked"})
    client.post(f"/api/tasks/{task_id}/status", json={"status": "open"})

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    assert client.get("/api/notifications/unread-count").json()["count"] == 2
    cleared = client.post("/api/notifications/read-all")
    assert cleared.status_code == 200
    assert cleared.json()["count"] == 0
    assert client.get("/api/notifications/unread-count").json()["count"] == 0
