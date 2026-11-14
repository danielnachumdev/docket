import base64

from fastapi.testclient import TestClient
from sqlalchemy import select

from docket.db import database
from docket.main import create_app
from docket.models import Membership, Role, User
from docket.security import password_hasher
from tests.helpers import bootstrap_owner


OWNER_PASSWORD = "password1234"
MEMBER_PASSWORD = "SecurePass12"


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text


def _create_member_user(email: str = "alex@example.com") -> User:
    db = database.SessionLocal()
    try:
        role = db.scalar(select(Role).where(Role.name == "member"))
        assert role is not None
        user = User(
            email=email,
            display_name="Alex",
            password_hash=password_hasher.hash(MEMBER_PASSWORD),
        )
        db.add(user)
        db.flush()
        db.add(
            Membership(
                user_id=user.id,
                role_id=role.id,
                scope_type="global",
                scope_task_id=None,
            )
        )
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _create_task(client: TestClient, title: str = "Demo task") -> str:
    res = client.post("/api/tasks", json={"title": title, "priority": 2})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_admin_storage_requires_auth_and_users_admin() -> None:
    client = TestClient(create_app())

    anon = client.get("/api/admin/storage")
    assert anon.status_code == 401

    bootstrap_owner(client)
    owner = client.get("/api/admin/storage")
    assert owner.status_code == 200, owner.text

    client.post("/api/auth/logout")
    _create_member_user()
    _login(client, "alex@example.com", MEMBER_PASSWORD)
    forbidden = client.get("/api/admin/storage")
    assert forbidden.status_code == 403


def test_admin_storage_totals_and_uploader_breakdown() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_a = _create_task(client, "Alpha docs")
    task_b = _create_task(client, "Beta dump")

    text = client.post(
        f"/api/tasks/{task_a}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "hello ops"},
    )
    assert text.status_code == 201
    assert text.json()["byte_size"] == 0

    link = client.post(
        f"/api/tasks/{task_a}/artifacts",
        json={
            "kind": "link",
            "title": "Spec",
            "content_text": "https://example.com/spec",
        },
    )
    assert link.status_code == 201
    assert link.json()["byte_size"] == 0

    payload_a = base64.b64encode(b"file-bytes-aaa").decode("ascii")
    file_a = client.post(
        f"/api/tasks/{task_a}/artifacts",
        json={
            "kind": "file",
            "title": "a.txt",
            "content_base64": payload_a,
            "content_type": "text/plain",
        },
    )
    assert file_a.status_code == 201
    assert file_a.json()["byte_size"] == len(b"file-bytes-aaa")

    payload_b = base64.b64encode(b"bigger-file-payload!!").decode("ascii")
    file_b = client.post(
        f"/api/tasks/{task_b}/artifacts",
        json={
            "kind": "file",
            "title": "b.bin",
            "content_base64": payload_b,
            "content_type": "application/octet-stream",
        },
    )
    assert file_b.status_code == 201
    assert file_b.json()["byte_size"] == len(b"bigger-file-payload!!")

    overview = client.get("/api/admin/storage")
    assert overview.status_code == 200, overview.text
    body = overview.json()

    assert "blob storage for kind=file" in body["size_note"]
    assert body["artifact_count"] == 4
    assert body["stored_bytes"] == len(b"file-bytes-aaa") + len(b"bigger-file-payload!!")

    by_kind = {row["kind"]: row for row in body["by_kind"]}
    assert by_kind["file"]["artifact_count"] == 2
    assert by_kind["file"]["stored_bytes"] == body["stored_bytes"]
    assert by_kind["text"]["artifact_count"] == 1
    assert by_kind["text"]["stored_bytes"] == 0
    assert by_kind["link"]["artifact_count"] == 1
    assert by_kind["link"]["stored_bytes"] == 0

    assert len(body["by_uploader"]) == 1
    uploader = body["by_uploader"][0]
    assert uploader["email"] == "ops@example.com"
    assert uploader["display_name"] == "Ops"
    assert uploader["artifact_count"] == 4
    assert uploader["stored_bytes"] == body["stored_bytes"]

    assert len(body["top_tasks"]) == 2
    assert body["top_tasks"][0]["task_id"] == task_b
    assert body["top_tasks"][0]["stored_bytes"] == len(b"bigger-file-payload!!")
    assert body["top_tasks"][0]["title"] == "Beta dump"
    assert body["top_tasks"][1]["task_id"] == task_a
    assert body["top_tasks"][1]["stored_bytes"] == len(b"file-bytes-aaa")


def test_admin_storage_empty_workspace() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    overview = client.get("/api/admin/storage")
    assert overview.status_code == 200
    body = overview.json()
    assert body["artifact_count"] == 0
    assert body["stored_bytes"] == 0
    assert body["by_kind"] == []
    assert body["by_uploader"] == []
    assert body["top_tasks"] == []
