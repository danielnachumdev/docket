"""Viewer-aware task unread: session actors skip themselves; tokens mark all."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from waymark.db import database
from waymark.main import create_app
from waymark.models import User
from waymark.security import password_hasher
from tests.helpers import bearer, bootstrap_owner, link_as_contact, mint_api_token, task_by_public_id


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


def test_session_owner_update_does_not_unread_for_self() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    created = client.post("/api/tasks", json={"title": "Ledger sync", "priority": 2})
    assert created.status_code == 201
    task = created.json()
    assert task["unread"] is False
    task_id = task["id"]

    patched = client.patch(f"/api/tasks/{task_id}", json={"description": "my edit"})
    assert patched.status_code == 200
    assert patched.json()["unread"] is False

    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    row = next(t for t in listed.json() if t["id"] == task_id)
    assert row["unread"] is False

    orm = task_by_public_id(task_id)
    assert orm.unread is True
    assert orm.unread_except_user_id is not None


def test_sharee_sees_unread_after_owner_session_update() -> None:
    client = TestClient(create_app())
    owner = bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Shared unread"}).json()["id"]
    alex = _create_user("alex@example.com", "Alex", "password123")
    link_as_contact(owner_user_id=owner["id"], contact=alex)
    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201

    patched = client.patch(f"/api/tasks/{task_id}", json={"description": "owner edit"})
    assert patched.status_code == 200
    assert patched.json()["unread"] is False

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    listed = client.get("/api/tasks?roots_only=true")
    assert listed.status_code == 200
    row = next(t for t in listed.json() if t["id"] == task_id)
    assert row["unread"] is True

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    assert detail.json()["task"]["unread"] is True


def test_api_token_update_marks_unread_for_token_owner() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Agent work"}).json()["id"]
    raw, _token_id = mint_api_token(user_id=user["id"], name="demo-api")

    claimed = client.post(
        f"/api/tasks/{task_id}/claim",
        json={"lease_seconds": 120},
        headers=bearer(raw),
    )
    assert claimed.status_code == 200, claimed.text

    patched = client.patch(
        f"/api/tasks/{task_id}",
        json={"description": "agent update"},
        headers=bearer(raw),
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["unread"] is True

    listed = client.get("/api/tasks")
    row = next(t for t in listed.json() if t["id"] == task_id)
    assert row["unread"] is True

    orm = task_by_public_id(task_id)
    assert orm.unread is True
    assert orm.unread_except_user_id is None


def test_status_and_comment_set_shared_bit_but_skip_session_actor() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Status work"}).json()["id"]

    status = client.post(f"/api/tasks/{task_id}/status", json={"status": "in_progress"})
    assert status.status_code == 200
    assert status.json()["unread"] is False
    assert task_by_public_id(task_id).unread is True

    client.post(f"/api/tasks/{task_id}/read")
    comment = client.post(f"/api/tasks/{task_id}/comments", json={"body": "ping"})
    assert comment.status_code == 201
    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.json()["task"]["unread"] is False
    assert task_by_public_id(task_id).unread is True


def test_artifact_add_sets_shared_bit_but_skips_session_actor() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "With artifact"}).json()["id"]

    art = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hello"},
    )
    assert art.status_code == 201
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["unread"] is False
    assert task_by_public_id(task_id).unread is True


def test_mark_read_on_view_endpoint_is_idempotent() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Read me"}).json()["id"]
    raw, _ = mint_api_token(user_id=user["id"], name="demo-api")
    assert (
        client.post(
            f"/api/tasks/{task_id}/claim",
            json={"lease_seconds": 120},
            headers=bearer(raw),
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/tasks/{task_id}",
            json={"title": "Read me now"},
            headers=bearer(raw),
        ).status_code
        == 200
    )
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["unread"] is True

    first = client.post(f"/api/tasks/{task_id}/read")
    assert first.status_code == 200
    assert first.json()["unread"] is False
    orm = task_by_public_id(task_id)
    assert orm.unread is False
    assert orm.unread_except_user_id is None

    second = client.post(f"/api/tasks/{task_id}/read")
    assert second.status_code == 200
    assert second.json()["unread"] is False


def test_manual_mark_unread_is_visible_to_actor() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Toggle"}).json()["id"]
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["unread"] is False

    # Session edit would normally exclude actor; manual mark forces visible.
    client.patch(f"/api/tasks/{task_id}", json={"description": "self edit"})
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["unread"] is False

    first = client.post(f"/api/tasks/{task_id}/unread")
    assert first.status_code == 200
    assert first.json()["unread"] is True
    assert task_by_public_id(task_id).unread_except_user_id is None

    second = client.post(f"/api/tasks/{task_id}/unread")
    assert second.status_code == 200
    assert second.json()["unread"] is True

    cleared = client.post(f"/api/tasks/{task_id}/read")
    assert cleared.json()["unread"] is False


def test_mapper_except_semantics_without_sharee() -> None:
    """Direct ORM/mapper check when sharing setup is not needed."""
    from waymark.api.tasks.task_response_mapper import TaskResponseMapper
    from waymark.models import Task

    client = TestClient(create_app())
    owner = bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Mapper"}).json()["id"]
    client.patch(f"/api/tasks/{task_id}", json={"description": "x"})

    db = database.SessionLocal()
    try:
        task = db.scalar(select(Task).where(Task.public_id == task_id))
        assert task is not None
        mapper = TaskResponseMapper(db)
        assert mapper.unread_for(task, viewer_user_id=owner["id"]) is False
        assert mapper.unread_for(task, viewer_user_id=owner["id"] + 999) is True
        assert mapper.unread_for(task, viewer_user_id=None) is True
    finally:
        db.close()
