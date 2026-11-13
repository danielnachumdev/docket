"""Regression suite: user isolation, share roles, and token/webhook scope.

Dummy users only (ops@example.com / other@example.com). Encodes failure modes
for private tasks (404 when the caller has global perms but no access),
viewer/editor shares, and owner-scoped token/webhook management.
"""

from fastapi.testclient import TestClient
from sqlalchemy import select

from docket.db import database
from docket.main import create_app
from docket.models import Membership, Notification, Role, User
from docket.security import password_hasher
from tests.helpers import bearer, bootstrap_owner, internal_task_id, mint_api_token

OPS = "ops@example.com"
OTHER = "other@example.com"
PASSWORD = "password123"


def _create_user(email: str, display_name: str) -> User:
    session = database.session()
    try:
        user = User(
            email=email,
            display_name=display_name,
            password_hash=password_hasher.hash(PASSWORD),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user
    finally:
        session.close()


def _grant_global_role(user_id: int, role_name: str) -> None:
    session = database.session()
    try:
        role = session.scalar(select(Role).where(Role.name == role_name))
        assert role is not None
        session.add(
            Membership(
                user_id=user_id,
                role_id=role.id,
                scope_type="global",
                scope_task_id=None,
            )
        )
        session.commit()
    finally:
        session.close()


def _login(client: TestClient, email: str) -> None:
    client.cookies.clear()
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text


def _create_task(client: TestClient, title: str = "Private task") -> str:
    res = client.post("/api/tasks", json={"title": title, "priority": 2})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _share(client: TestClient, task_id: str, email: str, role: str) -> dict:
    res = client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": email, "role": role},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _setup_ops_and_other_owner() -> tuple[TestClient, dict, User, int]:
    """Bootstrap ops, peer-owner other, and one private task owned by ops."""
    client = TestClient(create_app())
    ops = bootstrap_owner(client)
    other = _create_user(OTHER, "Other")
    _grant_global_role(other.id, "owner")
    task_id = _create_task(client, "Ops private")
    return client, ops, other, task_id


def test_stranger_without_membership_gets_403() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client)
    _create_user(OTHER, "Other")

    _login(client, OTHER)
    assert client.get("/api/tasks").status_code == 403
    assert client.get(f"/api/tasks/{task_id}").status_code == 403
    assert client.get(f"/api/tasks/{task_id}/export").status_code == 403
    assert client.post(f"/api/tasks/{task_id}/claim").status_code == 403
    assert client.get(f"/api/tasks/{task_id}/artifacts").status_code == 403


def test_peer_owner_cannot_read_write_export_claim_private_task() -> None:
    client, _ops, other, task_id = _setup_ops_and_other_owner()
    art = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Secret", "content_text": "classified"},
    )
    assert art.status_code == 201, art.text
    artifact_id = art.json()["id"]

    _login(client, OTHER)
    assert client.get("/api/tasks").json() == []
    assert client.get("/api/tasks/inbox").json() == []
    assert client.get(f"/api/tasks/{task_id}").status_code == 404
    assert client.patch(
        f"/api/tasks/{task_id}", json={"title": "Hijacked"}
    ).status_code == 404
    assert client.post(
        f"/api/tasks/{task_id}/status", json={"status": "done"}
    ).status_code == 404
    assert client.post(
        f"/api/tasks/{task_id}/comments", json={"body": "Nope"}
    ).status_code == 404
    assert client.get(f"/api/tasks/{task_id}/export").status_code == 404
    assert client.post(f"/api/tasks/{task_id}/claim").status_code == 404
    assert client.get(f"/api/tasks/{task_id}/artifacts").status_code == 404
    assert client.get(
        f"/api/tasks/{task_id}/artifacts/{artifact_id}"
    ).status_code == 404
    assert client.get(
        f"/api/tasks/{task_id}/artifacts/{artifact_id}/content"
    ).status_code == 404
    assert client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Leak", "content_text": "x"},
    ).status_code == 404
    assert client.put(f"/api/tasks/{task_id}/watch").status_code == 404
    assert client.get(f"/api/tasks/{task_id}/watch").status_code == 404
    assert client.get(f"/api/tasks/{task_id}/shares").status_code == 404
    bulk = client.post(
        "/api/tasks/bulk",
        json={"task_ids": [task_id], "status": "on_hold"},
    )
    assert bulk.status_code == 404

    # Peer owner token also cannot claim ops' private task.
    raw, _ = mint_api_token(user_id=other.id, name="other-agent")
    client.cookies.clear()
    claimed = client.post(
        f"/api/tasks/{task_id}/claim", headers=bearer(raw)
    )
    assert claimed.status_code == 404


def test_viewer_share_read_ok_write_denied() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task_id = _create_task(client, "Shared read-only")
    _create_user(OTHER, "Other")
    _share(client, task_id, OTHER, "viewer")

    _login(client, OTHER)
    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    assert [t["id"] for t in listed.json()] == [task_id]
    assert client.get(f"/api/tasks/{task_id}").status_code == 200
    assert client.get(f"/api/tasks/{task_id}/export").status_code == 200
    assert client.get(f"/api/tasks/{task_id}/artifacts").status_code == 200

    assert client.patch(
        f"/api/tasks/{task_id}", json={"title": "Nope"}
    ).status_code == 403
    assert client.post(
        f"/api/tasks/{task_id}/status", json={"status": "done"}
    ).status_code == 403
    assert client.post(
        f"/api/tasks/{task_id}/comments", json={"body": "Nope"}
    ).status_code == 403
    assert client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "x", "content_text": "y"},
    ).status_code == 403
    assert client.post(f"/api/tasks/{task_id}/claim").status_code == 403
    assert client.post(
        "/api/tasks/bulk",
        json={"task_ids": [task_id], "priority": 1},
    ).status_code == 403
    # Viewer lacks tasks:write → gated before require_owner.
    assert client.post(
        f"/api/tasks/{task_id}/shares",
        json={"email": OPS, "role": "viewer"},
    ).status_code == 403


def test_editor_share_write_ok_within_share_rules() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    shared_id = _create_task(client, "Shared editable")
    private_id = _create_task(client, "Still private")
    _create_user(OTHER, "Other")
    _share(client, shared_id, OTHER, "editor")

    _login(client, OTHER)
    assert client.get(f"/api/tasks/{shared_id}").status_code == 200
    updated = client.patch(
        f"/api/tasks/{shared_id}", json={"title": "Edited by other"}
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Edited by other"
    assert client.post(
        f"/api/tasks/{shared_id}/status", json={"status": "on_hold"}
    ).status_code == 200
    assert client.post(
        f"/api/tasks/{shared_id}/comments", json={"body": "Looking good"}
    ).status_code == 201
    assert client.post(
        f"/api/tasks/{shared_id}/artifacts",
        json={"kind": "text", "title": "Note", "content_text": "ok"},
    ).status_code == 201
    assert client.put(f"/api/tasks/{shared_id}/watch").status_code == 200

    # Editor on one task must not reach a different private task (404).
    assert client.get(f"/api/tasks/{private_id}").status_code == 404
    assert client.patch(
        f"/api/tasks/{private_id}", json={"title": "Steal"}
    ).status_code == 404
    assert client.get(f"/api/tasks/{private_id}/export").status_code == 404
    bulk = client.post(
        "/api/tasks/bulk",
        json={"task_ids": [shared_id, private_id], "status": "done"},
    )
    assert bulk.status_code == 404
    # Shares remain owner-only even for editors.
    assert client.post(
        f"/api/tasks/{shared_id}/shares",
        json={"email": OPS, "role": "viewer"},
    ).status_code == 404


def test_api_token_downscope_and_cross_user() -> None:
    client, ops, other, _task_id = _setup_ops_and_other_owner()

    roles = client.get("/api/tokens/roles")
    assert roles.status_code == 200
    agent_role_id = next(
        r["id"] for r in roles.json() if r["name"] == "agent_worker"
    )
    minted = client.post(
        "/api/tokens",
        json={"name": "ops-agent", "role_id": agent_role_id},
    )
    assert minted.status_code == 201, minted.text
    raw = minted.json()["token"]
    ops_token_id = minted.json()["id"]

    # Narrower role cannot manage tokens or webhooks.
    client.cookies.clear()
    assert client.get(
        "/api/tokens", headers=bearer(raw)
    ).status_code == 403
    assert client.get(
        "/api/webhooks", headers=bearer(raw)
    ).status_code == 403
    # Can still act as ops within agent_worker perms.
    me = client.get("/api/auth/me", headers=bearer(raw))
    assert me.status_code == 200
    assert me.json()["email"] == OPS
    assert client.get("/api/tasks", headers=bearer(raw)).status_code == 200

    # Peer owner cannot list or revoke ops' tokens.
    _login(client, OTHER)
    listed = client.get("/api/tokens")
    assert listed.status_code == 200
    assert listed.json() == []
    revoke = client.post(f"/api/tokens/{ops_token_id}/revoke")
    assert revoke.status_code == 404

    # other cannot authenticate as ops via stealing token id; only raw secret works,
    # and that secret still belongs to ops (already asserted above). Mint other token
    # and confirm ops cannot revoke it.
    other_mint = client.post("/api/tokens", json={"name": "other-full"})
    assert other_mint.status_code == 201, other_mint.text
    other_token_id = other_mint.json()["id"]

    _login(client, OPS)
    assert client.post(
        f"/api/tokens/{other_token_id}/revoke"
    ).status_code == 404
    assert ops["id"] != other.id


def test_webhook_management_scoped_to_owner() -> None:
    client, _ops, _other, _task_id = _setup_ops_and_other_owner()
    created = client.post(
        "/api/webhooks",
        json={
            "name": "Ops hook",
            "url": "https://hooks.example.com/ops",
            "event_types": ["status_changed"],
        },
    )
    assert created.status_code == 201, created.text
    wid = created.json()["id"]

    _login(client, OTHER)
    assert client.get("/api/webhooks").json() == []
    assert client.patch(
        f"/api/webhooks/{wid}", json={"enabled": False}
    ).status_code == 404
    assert client.delete(f"/api/webhooks/{wid}").status_code == 404

    # other can create their own webhook without seeing ops'.
    own = client.post(
        "/api/webhooks",
        json={
            "name": "Other hook",
            "url": "https://hooks.example.com/other",
        },
    )
    assert own.status_code == 201, own.text
    listed = client.get("/api/webhooks")
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == own.json()["id"]


def test_notification_mark_read_scoped_to_owner() -> None:
    client, ops, other, task_id = _setup_ops_and_other_owner()
    session = database.session()
    try:
        note = Notification(
            user_id=ops["id"],
            task_id=internal_task_id(task_id),
            kind="status_changed",
            title="Ops only",
            body="private",
            actor_user_id=ops["id"],
        )
        session.add(note)
        session.commit()
        session.refresh(note)
        note_id = note.id
    finally:
        session.close()

    _login(client, OTHER)
    assert client.get("/api/notifications").json() == []
    assert client.post(
        f"/api/notifications/{note_id}/read"
    ).status_code == 404
    assert other.id != ops["id"]
