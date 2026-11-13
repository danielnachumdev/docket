from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from docket.db import database
from docket.main import create_app
from docket.models import Membership, RegistrationInvite, Role, User
from docket.security import api_token_hasher, password_hasher
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


def test_owner_can_create_list_and_member_cannot() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert "users:admin" in status.json()["permissions"]

    created = client.post("/api/invites", json={})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["token"]
    assert body["register_path"].startswith("/register?token=")
    assert body["email"] is None

    listed = client.get("/api/invites")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "token" not in listed.json()[0]

    client.post("/api/auth/logout")
    _create_member_user()
    _login(client, "alex@example.com", MEMBER_PASSWORD)
    forbidden = client.post("/api/invites", json={})
    assert forbidden.status_code == 403


def test_register_happy_path_notifies_owner_and_enables_share() -> None:
    client = TestClient(create_app())
    owner = bootstrap_owner(client)

    invite = client.post(
        "/api/invites", json={"email": "invitee@example.com"}
    ).json()
    token = invite["token"]

    preview = client.get(f"/api/auth/invites/{token}")
    assert preview.status_code == 200
    assert preview.json()["email_bound"] is True
    assert preview.json()["email"] == "invitee@example.com"

    client.post("/api/auth/logout")
    registered = client.post(
        "/api/auth/register",
        json={
            "token": token,
            "email": "invitee@example.com",
            "display_name": "Invitee",
            "password": MEMBER_PASSWORD,
        },
    )
    assert registered.status_code == 200, registered.text
    assert registered.json()["email"] == "invitee@example.com"

    me = client.get("/api/auth/me")
    assert me.status_code == 200

    reuse = client.post(
        "/api/auth/register",
        json={
            "token": token,
            "email": "other@example.com",
            "display_name": "Other",
            "password": MEMBER_PASSWORD,
        },
    )
    assert reuse.status_code == 410

    client.post("/api/auth/logout")
    _login(client, "ops@example.com", OWNER_PASSWORD)
    notes = client.get("/api/notifications")
    assert notes.status_code == 200
    kinds = [n["kind"] for n in notes.json()]
    assert "invite_accepted" in kinds

    task = client.post("/api/tasks", json={"title": "Shared work"}).json()
    shared = client.post(
        f"/api/tasks/{task['id']}/shares",
        json={"email": "invitee@example.com", "role": "editor"},
    )
    assert shared.status_code == 201, shared.text
    assert shared.json()["email"] == "invitee@example.com"
    assert any(n["user_id"] == owner["id"] for n in notes.json())


def test_register_rejects_weak_password_collision_and_email_mismatch() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    invite = client.post("/api/invites", json={"email": "bound@example.com"}).json()
    token = invite["token"]
    open_invite = client.post("/api/invites", json={}).json()
    client.post("/api/auth/logout")

    weak = client.post(
        "/api/auth/register",
        json={
            "token": open_invite["token"],
            "email": "newbie@example.com",
            "display_name": "New",
            "password": "short",
        },
    )
    assert weak.status_code == 422

    no_digit = client.post(
        "/api/auth/register",
        json={
            "token": open_invite["token"],
            "email": "newbie@example.com",
            "display_name": "New",
            "password": "abcdefghijkl",
        },
    )
    assert no_digit.status_code == 400

    mismatch = client.post(
        "/api/auth/register",
        json={
            "token": token,
            "email": "wrong@example.com",
            "display_name": "Wrong",
            "password": MEMBER_PASSWORD,
        },
    )
    assert mismatch.status_code == 400

    ok = client.post(
        "/api/auth/register",
        json={
            "token": open_invite["token"],
            "email": "ops@example.com",
            "display_name": "Dup",
            "password": MEMBER_PASSWORD,
        },
    )
    assert ok.status_code == 409


def test_expired_invite_and_revoke() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/invites", json={}).json()
    token = created["token"]

    db = database.SessionLocal()
    try:
        row = db.scalar(
            select(RegistrationInvite).where(
                RegistrationInvite.token_hash == api_token_hasher.hash(token)
            )
        )
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(hours=1)
        db.commit()
    finally:
        db.close()

    gone = client.get(f"/api/auth/invites/{token}")
    assert gone.status_code == 410

    fresh = client.post("/api/invites", json={}).json()
    revoked = client.delete(f"/api/invites/{fresh['id']}")
    assert revoked.status_code == 204
    missing = client.get(f"/api/auth/invites/{fresh['token']}")
    assert missing.status_code == 404

    # consumed invite cannot be revoked
    usable = client.post("/api/invites", json={}).json()
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/register",
        json={
            "token": usable["token"],
            "email": "done@example.com",
            "display_name": "Done",
            "password": MEMBER_PASSWORD,
        },
    )
    _login(client, "ops@example.com", OWNER_PASSWORD)
    conflict = client.delete(f"/api/invites/{usable['id']}")
    assert conflict.status_code == 409
