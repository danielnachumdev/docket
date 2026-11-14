from fastapi.testclient import TestClient

from docket.main import create_app
from tests.helpers import bearer, bootstrap_owner, mint_api_token


def test_patch_me_requires_auth() -> None:
    client = TestClient(create_app())
    res = client.patch("/api/auth/me", json={"display_name": "Ops"})
    assert res.status_code == 401


def test_patch_me_updates_display_name() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Ops"
    assert me.json()["email"] == "ops@example.com"

    patched = client.patch("/api/auth/me", json={"display_name": "Ops Lead"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["display_name"] == "Ops Lead"
    assert patched.json()["email"] == "ops@example.com"

    again = client.get("/api/auth/me")
    assert again.status_code == 200
    assert again.json()["display_name"] == "Ops Lead"

    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert status.json()["user"]["display_name"] == "Ops Lead"


def test_patch_me_rejects_empty_name() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    empty = client.patch("/api/auth/me", json={"display_name": ""})
    assert empty.status_code == 422

    whitespace = client.patch("/api/auth/me", json={"display_name": "   "})
    assert whitespace.status_code == 422


def test_patch_me_via_api_token() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, _token_id = mint_api_token(user_id=user["id"])

    res = client.patch(
        "/api/auth/me",
        headers=bearer(raw),
        json={"display_name": "Token Ops"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["display_name"] == "Token Ops"
