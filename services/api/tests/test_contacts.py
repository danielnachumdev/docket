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


def test_contact_nickname_patch_search_and_uniqueness() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Nick board"}).json()["id"]
    alex = _create_member("alex@example.com", "Alex Friend")
    blake = _create_member("blake@example.com", "Blake Friend")
    for email in ("alex@example.com", "blake@example.com"):
        assert (
            client.post(
                f"/api/tasks/{task_id}/shares",
                json={"email": email, "role": "viewer"},
            ).status_code
            == 201
        )

    listed = client.get("/api/me/contacts")
    assert listed.status_code == 200
    assert all(row["nickname"] is None for row in listed.json())

    patched = client.patch(
        f"/api/me/contacts/{alex.id}", json={"nickname": "dana"}
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["nickname"] == "dana"
    assert patched.json()["email"] == "alex@example.com"

    by_nick = client.get("/api/me/contacts", params={"q": "dana"})
    assert [r["id"] for r in by_nick.json()] == [alex.id]

    conflict = client.patch(
        f"/api/me/contacts/{blake.id}", json={"nickname": "Dana"}
    )
    assert conflict.status_code == 409, conflict.text

    blake_nick = client.patch(
        f"/api/me/contacts/{blake.id}", json={"nickname": "blake_ops"}
    )
    assert blake_nick.status_code == 200
    assert blake_nick.json()["nickname"] == "blake_ops"

    cleared = client.patch(
        f"/api/me/contacts/{alex.id}", json={"nickname": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["nickname"] is None

    bad = client.patch(
        f"/api/me/contacts/{blake.id}", json={"nickname": "bad nick!"}
    )
    assert bad.status_code == 422

    missing = client.patch("/api/me/contacts/999999", json={"nickname": "ghost"})
    assert missing.status_code == 404


def test_contact_nickname_private_to_viewer_and_mention_resolve() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = client.post("/api/tasks", json={"title": "Mention nick"}).json()["id"]
    alex = _create_member("alex@example.com", "Alex Friend")
    assert (
        client.post(
            f"/api/tasks/{task_id}/shares",
            json={"email": "alex@example.com", "role": "commentor"},
        ).status_code
        == 201
    )
    assert (
        client.patch(
            f"/api/me/contacts/{alex.id}", json={"nickname": "dana"}
        ).status_code
        == 200
    )

    mentionables = client.get(f"/api/tasks/{task_id}/mentionables")
    assert mentionables.status_code == 200
    alex_row = next(r for r in mentionables.json() if r["user_id"] == alex.id)
    assert alex_row["nickname"] == "dana"
    assert alex_row["handle"] == "dana"

    mentioned = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Ping @dana please"},
    )
    assert mentioned.status_code == 201, mentioned.text
    assert alex.id in mentioned.json()["mentioned_user_ids"]
    user_ref = next(r for r in mentioned.json()["refs"] if r["kind"] == "user")
    assert user_ref["user_id"] == alex.id

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", MEMBER_PASSWORD)
    alex_contacts = client.get("/api/me/contacts")
    assert alex_contacts.status_code == 200
    owner_row = alex_contacts.json()[0]
    assert owner_row["email"] == "ops@example.com"
    assert owner_row["nickname"] is None

    leak = client.get("/api/me/contacts", params={"q": "dana"})
    assert leak.json() == []

    alex_mentionables = client.get(f"/api/tasks/{task_id}/mentionables")
    owner_mention = next(
        r for r in alex_mentionables.json() if r["email"] == "ops@example.com"
    )
    assert owner_mention["nickname"] is None
    assert owner_mention["handle"] == "ops@example.com"

    unresolved = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Cannot see @dana"},
    )
    assert unresolved.status_code == 400, unresolved.text
