from fastapi.testclient import TestClient
from sqlalchemy import select

from tests.helpers import invite_and_register_contact
from waymark.db import database
from waymark.main import create_app
from waymark.models import Membership, Notification, Role, User
from waymark.security import password_hasher


def _bootstrap(client: TestClient) -> None:
    res = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password1234",
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
    assert created.json()["shared"] is False

    invite_and_register_contact(
        client, email="alex@example.com", display_name="Alex"
    )

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

    owner_listed = client.get("/api/tasks?roots_only=true")
    assert owner_listed.status_code == 200
    owner_row = next(t for t in owner_listed.json() if t["id"] == task_id)
    assert owner_row["shared"] is True
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["shared"] is True

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password1234")

    listed = client.get("/api/tasks?roots_only=true")
    assert listed.status_code == 200
    assert [t["id"] for t in listed.json()] == [task_id]
    assert listed.json()[0]["shared"] is True

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    assert detail.json()["task"]["title"] == "Shared board"
    assert detail.json()["task"]["shared"] is True

    denied = client.patch(f"/api/tasks/{task_id}", json={"title": "Nope"})
    assert denied.status_code in {403, 404}

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password1234")
    unshare = client.delete(f"/api/tasks/{task_id}/shares/{membership_id}")
    assert unshare.status_code == 204
    assert client.get(f"/api/tasks/{task_id}").json()["task"]["shared"] is False

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password1234")
    gone = client.get(f"/api/tasks/{task_id}")
    assert gone.status_code in {403, 404}


def test_share_editor_can_write() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Edit me"}).json()["id"]
    invite_and_register_contact(client, email="alex@example.com", display_name="Alex")

    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    assert share.status_code == 201

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password1234")

    updated = client.patch(f"/api/tasks/{task_id}", json={"title": "Edited by Alex"})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Edited by Alex"

    status_res = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert status_res.status_code == 200


def test_share_editor_can_share_and_unshare_collaborators() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Team board"}).json()["id"]
    invite_and_register_contact(client, email="alex@example.com", display_name="Alex")
    invite_and_register_contact(client, email="blake@example.com", display_name="Blake")
    assert (
        client.post(
            f"/api/tasks/{task_id}/shares",
            json={"email": "alex@example.com", "role": "editor"},
        ).status_code
        == 201
    )
    blake_share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "blake@example.com", "role": "viewer"},
    )
    assert blake_share.status_code == 201
    blake_mid = blake_share.json()["id"]

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password1234")
    upgraded = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "blake@example.com", "role": "commentor"},
    )
    assert upgraded.status_code == 201
    assert upgraded.json()["role"] == "commentor"

    removed = client.delete(f"/api/tasks/{task_id}/shares/{blake_mid}")
    assert removed.status_code == 204


def test_share_requires_collaborator_and_write_access() -> None:
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

    _create_user("stranger@example.com", "Stranger", "password1234")
    stranger_share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "stranger@example.com", "role": "viewer"},
    )
    assert stranger_share.status_code == 403

    invite_and_register_contact(client, email="alex@example.com", display_name="Alex")
    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password1234")
    # No membership yet → no task write access
    forbidden = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "ops@example.com", "role": "viewer"},
    )
    assert forbidden.status_code in {403, 404}


def test_share_commentor_cannot_manage_shares() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Comment only"}).json()["id"]
    invite_and_register_contact(client, email="alex@example.com", display_name="Alex")
    invite_and_register_contact(client, email="blake@example.com", display_name="Blake")
    assert (
        client.post(
            f"/api/tasks/{task_id}/shares",
            json={"email": "alex@example.com", "role": "commentor"},
        ).status_code
        == 201
    )
    blake_mid = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "blake@example.com", "role": "viewer"},
    ).json()["id"]

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password1234")
    denied_create = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "blake@example.com", "role": "editor"},
    )
    assert denied_create.status_code in {403, 404}
    denied_delete = client.delete(f"/api/tasks/{task_id}/shares/{blake_mid}")
    assert denied_delete.status_code in {403, 404}


def test_share_notifies_sharee_not_actor() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Notify board"}).json()["id"]
    alex = invite_and_register_contact(
        client, email="alex@example.com", display_name="Alex"
    )

    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201
    membership_id = share.json()["id"]

    # Invite consumption notifies the owner; sharing must not notify the actor.
    owner_kinds = {
        n["kind"] for n in client.get("/api/notifications").json()
    }
    assert "shared" not in owner_kinds

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password1234")
    feed = client.get("/api/notifications").json()
    shared_notes = [n for n in feed if n["kind"] == "shared"]
    assert len(shared_notes) == 1
    note = shared_notes[0]
    assert note["kind"] == "shared"
    assert note["task_id"] == task_id
    assert note["user_id"] == alex["id"]
    assert note["read_at"] is None
    assert "Notify board" in note["title"]

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password1234")
    unshare = client.delete(f"/api/tasks/{task_id}/shares/{membership_id}")
    assert unshare.status_code == 204

    session = database.session()
    try:
        kinds = list(
            session.scalars(
                select(Notification.kind).where(Notification.user_id == alex["id"])
            ).all()
        )
    finally:
        session.close()
    assert kinds == ["shared"]


def test_share_upserts_role() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Role flip"}).json()["id"]
    invite_and_register_contact(client, email="alex@example.com", display_name="Alex")

    first = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert first.status_code == 201
    mid = first.json()["id"]

    second = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"user_id": first.json()["user_id"], "role": "editor"},
    )
    assert second.status_code == 201
    assert second.json()["id"] == mid
    assert second.json()["role"] == "editor"

    session = database.session()
    try:
        from waymark.models import Task

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
