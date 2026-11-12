from fastapi.testclient import TestClient

from docket.db import database
from docket.main import create_app
from docket.models import ApiToken
from docket.security import api_token_hasher


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


def test_token_mint_list_revoke_and_bearer_auth() -> None:
    client = TestClient(create_app())
    _bootstrap(client)

    roles = client.get("/api/tokens/roles")
    assert roles.status_code == 200
    role_names = {row["name"] for row in roles.json()}
    assert "agent_worker" in role_names
    assert "owner" in role_names
    agent_role_id = next(r["id"] for r in roles.json() if r["name"] == "agent_worker")

    created = client.post(
        "/api/tokens",
        json={"name": "Instinct", "role_id": agent_role_id},
    )
    assert created.status_code == 201
    body = created.json()
    raw = body["token"]
    assert raw.startswith("dkt_")
    assert body["name"] == "Instinct"
    assert body["role_id"] == agent_role_id
    assert body["role_name"] == "agent_worker"
    assert body["revoked_at"] is None
    token_id = body["id"]

    session = database.session()
    try:
        stored = session.get(ApiToken, token_id)
        assert stored is not None
        assert stored.token_hash == api_token_hasher.hash(raw)
        assert stored.token_hash != raw
    finally:
        session.close()

    listed = client.get("/api/tokens")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert "token" not in rows[0]
    assert rows[0]["id"] == token_id

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "ops@example.com"

    # Downscoped agent token cannot manage tokens.
    forbidden = client.get(
        "/api/tokens",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert forbidden.status_code == 403

    # Agent can still read tasks.
    tasks = client.get(
        "/api/tasks",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert tasks.status_code == 200

    revoked = client.post(f"/api/tokens/{token_id}/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None

    dead = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert dead.status_code == 401

    active = client.get("/api/tokens")
    assert active.json() == []

    with_revoked = client.get("/api/tokens?include_revoked=true")
    assert len(with_revoked.json()) == 1
    assert with_revoked.json()[0]["revoked_at"] is not None


def test_token_rejects_unassignable_role_and_requires_auth() -> None:
    client = TestClient(create_app())

    unauth = client.get("/api/tokens")
    assert unauth.status_code == 401

    _bootstrap(client)
    bogus = client.post("/api/tokens", json={"name": "x", "role_id": 999999})
    assert bogus.status_code == 400
    assert "Unknown role_id" in bogus.json()["detail"]

    # Full-permission owner role is assignable; mint without downscope works.
    plain = client.post("/api/tokens", json={"name": "full"})
    assert plain.status_code == 201
    assert plain.json()["role_id"] is None
    raw = plain.json()["token"]

    # Undownscoped token inherits tokens:manage and can list.
    listed = client.get(
        "/api/tokens",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert listed.status_code == 200
    assert len(listed.json()) >= 1


def test_revoke_unknown_token_is_404() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    missing = client.post("/api/tokens/999/revoke")
    assert missing.status_code == 404
