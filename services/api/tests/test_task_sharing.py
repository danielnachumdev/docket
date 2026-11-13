from fastapi.testclient import TestClient
from sqlalchemy import select

from docket.db import database
from docket.main import create_app
from docket.models import Membership, Role, User
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


def test_share_task_grants_read_and_list() -> None:
    client = TestClient(create_app())
    _bootstrap(client)

    created = client.post("/api/tasks", json={"title": "Shared board", "priority": 2})
    assert created.status_code == 201
    task_id = created.json()["id"]

    _create_user("alex@example.com", "Alex", "password123")

    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201
    assert share.json()["email"] == "alex@example.com"
    assert share.json()["role"] == "viewer"
    membership_id = share.json()["id"]

    listed_shares = client.get(f"/api/tasks/{task_id}/shares")
    assert listed_shares.status_code == 200
    assert len(listed_shares.json()) == 1

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    listed = client.get("/api/tasks?roots_only=true")
    assert listed.status_code == 200
    assert [t["id"] for t in listed.json()] == [task_id]

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    assert detail.json()["task"]["title"] == "Shared board"

    denied = client.patch(f"/api/tasks/{task_id}", json={"title": "Nope"})
    assert denied.status_code == 403

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password123")
    unshare = client.delete(f"/api/tasks/{task_id}/shares/{membership_id}")
    assert unshare.status_code == 204

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    gone = client.get(f"/api/tasks/{task_id}")
    assert gone.status_code in {403, 404}


def test_share_editor_can_write() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Edit me"}).json()["id"]
    _create_user("alex@example.com", "Alex", "password123")

    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    assert share.status_code == 201

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    updated = client.patch(f"/api/tasks/{task_id}", json={"title": "Edited by Alex"})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Edited by Alex"

    status_res = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert status_res.status_code == 200


def test_share_requires_existing_user_and_owner() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Solo"}).json()["id"]

    missing = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "nobody@example.com", "role": "viewer"},
    )
    assert missing.status_code == 404

    self_share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "ops@example.com", "role": "viewer"},
    )
    assert self_share.status_code == 400

    _create_user("alex@example.com", "Alex", "password123")
    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    # No membership yet → no tasks:read → 403 from RequirePermission
    forbidden = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "ops@example.com", "role": "viewer"},
    )
    assert forbidden.status_code == 403


def test_share_upserts_role() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Role flip"}).json()["id"]
    _create_user("alex@example.com", "Alex", "password123")

    first = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert first.status_code == 201
    mid = first.json()["id"]

    second = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    assert second.status_code == 201
    assert second.json()["id"] == mid
    assert second.json()["role"] == "editor"

    session = database.session()
    try:
        from docket.models import Task

        internal_id = session.scalar(select(Task.id).where(Task.public_id == task_id))
        assert internal_id is not None
        count = len(
            session.scalars(
                select(Membership).where(
                    Membership.scope_type == "task",
                    Membership.scope_task_id == internal_id,
                )
            ).all()
        )
        assert count == 1
        role = session.scalar(select(Role).where(Role.name == "editor"))
        assert role is not None
        membership = session.get(Membership, mid)
        assert membership is not None
        assert membership.role_id == role.id
    finally:
        session.close()
