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


def test_commentor_can_comment_viewer_cannot() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Shared notes"}).json()["id"]
    _create_user("alex@example.com", "Alex", "password123")
    _create_user("blair@example.com", "Blair", "password123")

    assert (
        client.post(
            f"/api/tasks/{task_id}/shares",
            json={"email": "alex@example.com", "role": "commentor"},
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/tasks/{task_id}/shares",
            json={"email": "blair@example.com", "role": "viewer"},
        ).status_code
        == 201
    )

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    created = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Hello from commentor"},
    )
    assert created.status_code == 201
    assert created.json()["body"] == "Hello from commentor"
    assert created.json()["id"] > 0
    assert created.json()["can_edit"] is True

    listed = client.get(f"/api/tasks/{task_id}/comments")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    client.post("/api/auth/logout")
    _login(client, "blair@example.com", "password123")
    denied = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "viewer should fail"},
    )
    assert denied.status_code == 403
    assert client.get(f"/api/tasks/{task_id}/comments").status_code == 200


def test_editor_can_comment_and_author_edit_delete() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Edit thread"}).json()["id"]
    _create_user("alex@example.com", "Alex", "password123")
    client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    created = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "First draft"},
    )
    assert created.status_code == 201
    comment_id = created.json()["id"]

    patched = client.patch(
        f"/api/tasks/{task_id}/comments/{comment_id}",
        json={"body": "Second draft"},
    )
    assert patched.status_code == 200
    assert patched.json()["body"] == "Second draft"

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", "password1234")
    forbidden = client.patch(
        f"/api/tasks/{task_id}/comments/{comment_id}",
        json={"body": "Nope"},
    )
    assert forbidden.status_code == 403
    assert (
        client.delete(f"/api/tasks/{task_id}/comments/{comment_id}").status_code == 403
    )

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    deleted = client.delete(f"/api/tasks/{task_id}/comments/{comment_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/tasks/{task_id}/comments").json() == []


def test_comment_ref_validation_and_mentions() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Refs"}).json()["id"]
    other_id = client.post("/api/tasks", json={"title": "Other"}).json()["id"]
    alex = _create_user("alex@example.com", "Alex", "password123")
    client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    artifact = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hi"},
    )
    assert artifact.status_code == 201
    artifact_id = artifact.json()["id"]

    first = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Anchor comment"},
    )
    assert first.status_code == 201
    first_id = first.json()["id"]

    rich = client.post(
        f"/api/tasks/{task_id}/comments",
        json={
            "body": (
                f"Hey @alex@example.com see #{other_id} "
                f"and &{artifact_id} plus ~{first_id}"
            )
        },
    )
    assert rich.status_code == 201, rich.text
    body = rich.json()
    assert alex.id in body["mentioned_user_ids"]
    kinds = {ref["kind"] for ref in body["refs"]}
    assert kinds == {"user", "task", "artifact", "comment"}

    bad_artifact = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Missing &999999"},
    )
    assert bad_artifact.status_code == 400, bad_artifact.text

    mentionables = client.get(f"/api/tasks/{task_id}/mentionables")
    assert mentionables.status_code == 200
    emails = {row["email"] for row in mentionables.json()}
    assert "ops@example.com" in emails
    assert "alex@example.com" in emails


def test_share_commentor_role_roundtrip() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    task_id = client.post("/api/tasks", json={"title": "Role"}).json()["id"]
    _create_user("alex@example.com", "Alex", "password123")
    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "commentor"},
    )
    assert share.status_code == 201
    assert share.json()["role"] == "commentor"
    listed = client.get(f"/api/tasks/{task_id}/shares")
    assert listed.json()[0]["role"] == "commentor"
