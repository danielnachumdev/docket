from fastapi.testclient import TestClient

from docket.main import create_app
from tests.helpers import bootstrap_owner, mint_api_token, bearer


def test_preferences_require_auth() -> None:
    client = TestClient(create_app())
    assert client.get("/api/me/preferences").status_code == 401
    assert (
        client.patch("/api/me/preferences", json={"theme": "dark"}).status_code == 401
    )


def test_preferences_default_empty_and_patch_persists() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    empty = client.get("/api/me/preferences")
    assert empty.status_code == 200
    assert empty.json() == {"theme": None, "locale": None}

    patched = client.patch(
        "/api/me/preferences",
        json={"theme": "dark", "locale": "he"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json() == {"theme": "dark", "locale": "he"}

    again = client.get("/api/me/preferences")
    assert again.status_code == 200
    assert again.json() == {"theme": "dark", "locale": "he"}

    merge = client.patch("/api/me/preferences", json={"theme": "light"})
    assert merge.status_code == 200
    assert merge.json() == {"theme": "light", "locale": "he"}


def test_preferences_reject_unknown_and_invalid() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    unknown = client.patch(
        "/api/me/preferences",
        json={"theme": "dark", "favorite_color": "blue"},
    )
    assert unknown.status_code == 422

    bad_theme = client.patch("/api/me/preferences", json={"theme": "neon"})
    assert bad_theme.status_code == 422

    bad_locale = client.patch("/api/me/preferences", json={"locale": "xx"})
    assert bad_locale.status_code == 422

    still_empty = client.get("/api/me/preferences")
    assert still_empty.json() == {"theme": None, "locale": None}


def test_preferences_via_api_token() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, _token_id = mint_api_token(user_id=user["id"])

    res = client.patch(
        "/api/me/preferences",
        headers=bearer(raw),
        json={"locale": "en"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["locale"] == "en"

    got = client.get("/api/me/preferences", headers=bearer(raw))
    assert got.status_code == 200
    assert got.json() == {"theme": None, "locale": "en"}
