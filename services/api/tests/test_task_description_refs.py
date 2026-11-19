from fastapi.testclient import TestClient

from waymark.db import database
from waymark.main import create_app
from tests.helpers import link_as_contact
from waymark.models import User
from waymark.security import password_hasher


def _bootstrap(client: TestClient) -> dict:
    res = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password1234",
        },
    )
    assert res.status_code == 200
    return res.json()


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


def test_description_refs_resolve_on_create_and_update() -> None:
    client = TestClient(create_app())
    owner = _bootstrap(client)
    other_id = client.post("/api/tasks", json={"title": "Other"}).json()["id"]
    alex = _create_user("alex@example.com", "Alex", "password123")
    link_as_contact(owner_user_id=owner["id"], contact=alex)

    created = client.post(
        "/api/tasks",
        json={
            "title": "With refs",
            "description": f"See #{other_id} and @alex@example.com",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    kinds = {ref["kind"] for ref in body["description_refs"]}
    assert kinds == {"task", "user"}
    assert any(ref.get("task_id") == other_id for ref in body["description_refs"])

    task_id = body["id"]
    artifact = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hi"},
    )
    assert artifact.status_code == 201
    artifact_id = artifact.json()["id"]
    comment = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Anchor"},
    )
    assert comment.status_code == 201
    comment_id = comment.json()["id"]

    updated = client.patch(
        f"/api/tasks/{task_id}",
        json={
            "description": (
                f"Hey @alex@example.com see #{other_id} "
                f"and &{artifact_id} plus ~{comment_id}"
            )
        },
    )
    assert updated.status_code == 200, updated.text
    refs = updated.json()["description_refs"]
    assert {ref["kind"] for ref in refs} == {"user", "task", "artifact", "comment"}

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    assert len(detail.json()["task"]["description_refs"]) == 4

    bad = client.patch(
        f"/api/tasks/{task_id}",
        json={"description": "Missing &999999"},
    )
    assert bad.status_code == 400, bad.text


def test_description_private_task_ref_scrubbed_for_sharee() -> None:
    client = TestClient(create_app())
    owner = _bootstrap(client)
    shared_id = client.post("/api/tasks", json={"title": "Shared"}).json()["id"]
    private_id = client.post("/api/tasks", json={"title": "Secret"}).json()["id"]
    alex = _create_user("alex@example.com", "Alex", "password123")
    link_as_contact(owner_user_id=owner["id"], contact=alex)
    assert (
        client.post(
            f"/api/tasks/{shared_id}/shares",
            json={"email": "alex@example.com", "role": "viewer"},
        ).status_code
        == 201
    )

    patched = client.patch(
        f"/api/tasks/{shared_id}",
        json={"description": f"See private #{private_id}"},
    )
    assert patched.status_code == 200, patched.text
    owner_refs = patched.json()["description_refs"]
    assert len(owner_refs) == 1
    assert owner_refs[0].get("accessible") is True
    assert owner_refs[0]["title"] == "Secret"

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")
    detail = client.get(f"/api/tasks/{shared_id}")
    assert detail.status_code == 200
    sharee_refs = detail.json()["task"]["description_refs"]
    assert len(sharee_refs) == 1
    assert sharee_refs[0].get("accessible") is False
    assert "task_id" not in sharee_refs[0]
    assert "title" not in sharee_refs[0]
