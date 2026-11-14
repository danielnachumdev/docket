from fastapi.testclient import TestClient
from sqlalchemy import select

from docket.db import database
from docket.main import create_app
from docket.models import Membership, Role, User
from docket.security import password_hasher
from tests.helpers import bearer, bootstrap_owner, mint_api_token

MEMBER_PASSWORD = "SecurePass12"


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text


def _create_member(
    email: str, display_name: str, *, password: str = MEMBER_PASSWORD
) -> User:
    db = database.SessionLocal()
    try:
        role = db.scalar(select(Role).where(Role.name == "member"))
        assert role is not None
        user = User(
            email=email,
            display_name=display_name,
            password_hash=password_hasher.hash(password),
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
        db.expunge(user)
        return user
    finally:
        db.close()


def test_contacts_require_auth() -> None:
    client = TestClient(create_app())
    assert client.get("/api/me/contacts").status_code == 401


def test_contacts_empty_without_graph() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    res = client.get("/api/me/contacts")
    assert res.status_code == 200
    assert res.json() == []


def test_contacts_from_share_either_direction_and_search() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Shared board"}).json()["id"]

    alex = _create_member("alex@example.com", "Alex Friend")
    stranger = _create_member("stranger@example.com", "Stranger")
    _ = stranger

    share = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": "alex@example.com", "role": "viewer"},
    )
    assert share.status_code == 201

    owner_contacts = client.get("/api/me/contacts")
    assert owner_contacts.status_code == 200
    owner_rows = owner_contacts.json()
    assert len(owner_rows) == 1
    assert owner_rows[0]["id"] == alex.id
    assert owner_rows[0]["email"] == "alex@example.com"
    assert owner_rows[0]["display_name"] == "Alex Friend"

    search = client.get("/api/me/contacts", params={"q": "alex@"})
    assert search.status_code == 200
    assert [r["email"] for r in search.json()] == ["alex@example.com"]

    miss = client.get("/api/me/contacts", params={"q": "stranger"})
    assert miss.status_code == 200
    assert miss.json() == []

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", MEMBER_PASSWORD)
    alex_contacts = client.get("/api/me/contacts")
    assert alex_contacts.status_code == 200
    rows = alex_contacts.json()
    assert len(rows) == 1
    assert rows[0]["email"] == "ops@example.com"
    assert rows[0]["display_name"] == "Ops"

    stranger_leak = client.get("/api/me/contacts", params={"q": "stranger"})
    assert stranger_leak.json() == []


def test_contacts_from_consumed_invite_no_unrelated_leak() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    _create_member("unrelated@example.com", "Unrelated")

    invite = client.post(
        "/api/invites", json={"email": "invitee@example.com"}
    ).json()
    token = invite["token"]

    client.post("/api/auth/logout")
    registered = client.post(
        "/api/auth/register",
        json={
            "token": token,
            "email": "invitee@example.com",
            "display_name": "Invitee Person",
            "password": MEMBER_PASSWORD,
        },
    )
    assert registered.status_code == 200, registered.text
    invitee_id = registered.json()["id"]

    _login(client, "ops@example.com", "password1234")
    contacts = client.get("/api/me/contacts")
    assert contacts.status_code == 200
    emails = {row["email"] for row in contacts.json()}
    assert emails == {"invitee@example.com"}
    assert contacts.json()[0]["id"] == invitee_id
    assert contacts.json()[0]["display_name"] == "Invitee Person"

    by_name = client.get("/api/me/contacts", params={"q": "Invitee"})
    assert [r["email"] for r in by_name.json()] == ["invitee@example.com"]

    leak = client.get("/api/me/contacts", params={"q": "unrelated"})
    assert leak.json() == []


def test_contacts_via_api_token() -> None:
    client = TestClient(create_app())
    owner = bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Agent share"}).json()["id"]
    _create_member("alex@example.com", "Alex")
    assert (
        client.post(
            f"/api/tasks/{task_id}/shares",
            json={"email": "alex@example.com", "role": "editor"},
        ).status_code
        == 201
    )

    raw, _token_id = mint_api_token(user_id=owner["id"])
    client.post("/api/auth/logout")
    res = client.get("/api/me/contacts", headers=bearer(raw))
    assert res.status_code == 200
    assert [r["email"] for r in res.json()] == ["alex@example.com"]


def test_member_cannot_mint_invite() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    client.post("/api/auth/logout")
    _create_member("alex@example.com", "Alex")
    _login(client, "alex@example.com", MEMBER_PASSWORD)
    forbidden = client.post("/api/invites", json={})
    assert forbidden.status_code == 403
