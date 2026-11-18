from fastapi.testclient import TestClient

from waymark.main import create_app
from waymark.schemas.preferences import ALLOWED_THEME_TOKEN_KEYS, SHADOW_THEME_TOKEN_KEYS
from tests.helpers import bootstrap_owner, mint_api_token, bearer


def _full_tokens(*, accent: str = "#4f46e5") -> dict[str, str]:
    tokens: dict[str, str] = {}
    for key in ALLOWED_THEME_TOKEN_KEYS:
        if key in SHADOW_THEME_TOKEN_KEYS:
            tokens[key] = "0 1px 2px rgb(0 0 0 / 0.2)"
        elif key == "accent":
            tokens[key] = accent
        else:
            tokens[key] = "#112233"
    return tokens


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
    assert empty.json() == {
        "theme": None,
        "locale": None,
        "custom_themes": None,
        "task_sort_mode": None,
        "notification_kinds": None,
        "notification_sort": None,
    }

    patched = client.patch(
        "/api/me/preferences",
        json={
            "theme": "dark",
            "locale": "he",
            "task_sort_mode": "date",
            "notification_kinds": ["mentioned", "shared"],
            "notification_sort": "oldest",
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json() == {
        "theme": "dark",
        "locale": "he",
        "custom_themes": None,
        "task_sort_mode": "date",
        "notification_kinds": ["mentioned", "shared"],
        "notification_sort": "oldest",
    }

    again = client.get("/api/me/preferences")
    assert again.status_code == 200
    assert again.json() == {
        "theme": "dark",
        "locale": "he",
        "custom_themes": None,
        "task_sort_mode": "date",
        "notification_kinds": ["mentioned", "shared"],
        "notification_sort": "oldest",
    }

    merge = client.patch("/api/me/preferences", json={"theme": "light"})
    assert merge.status_code == 200
    assert merge.json() == {
        "theme": "light",
        "locale": "he",
        "custom_themes": None,
        "task_sort_mode": "date",
        "notification_kinds": ["mentioned", "shared"],
        "notification_sort": "oldest",
    }


def test_preferences_custom_themes_persist_and_select() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    custom = {
        "id": "c_abcdef12abcdef",
        "name": "Teal desk",
        "base": "dark",
        "tokens": _full_tokens(accent="#14b8a6"),
    }
    patched = client.patch(
        "/api/me/preferences",
        json={"theme": custom["id"], "custom_themes": [custom]},
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["theme"] == custom["id"]
    assert len(body["custom_themes"]) == 1
    assert body["custom_themes"][0]["name"] == "Teal desk"
    assert body["custom_themes"][0]["tokens"]["accent"] == "#14b8a6"

    renamed = {
        **custom,
        "name": "Ocean night",
        "tokens": _full_tokens(accent="#0ea5e9"),
    }
    again = client.patch(
        "/api/me/preferences",
        json={"custom_themes": [renamed]},
    )
    assert again.status_code == 200, again.text
    assert again.json()["custom_themes"][0]["name"] == "Ocean night"
    assert again.json()["theme"] == custom["id"]

    cleared = client.patch(
        "/api/me/preferences",
        json={"theme": "light", "custom_themes": []},
    )
    assert cleared.status_code == 200
    assert cleared.json()["custom_themes"] == []
    assert cleared.json()["theme"] == "light"


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

    missing_custom = client.patch(
        "/api/me/preferences",
        json={"theme": "c_abcdef12abcdef"},
    )
    assert missing_custom.status_code == 422

    incomplete = client.patch(
        "/api/me/preferences",
        json={
            "custom_themes": [
                {
                    "id": "c_abcdef12abcdef",
                    "name": "Broken",
                    "base": "light",
                    "tokens": {"accent": "#fff"},
                }
            ]
        },
    )
    assert incomplete.status_code == 422

    bad_sort = client.patch(
        "/api/me/preferences", json={"task_sort_mode": "priority"}
    )
    assert bad_sort.status_code == 422

    bad_kinds = client.patch(
        "/api/me/preferences", json={"notification_kinds": ["heartbeat"]}
    )
    assert bad_kinds.status_code == 422

    bad_notif_sort = client.patch(
        "/api/me/preferences", json={"notification_sort": "priority"}
    )
    assert bad_notif_sort.status_code == 422

    still_empty = client.get("/api/me/preferences")
    assert still_empty.json() == {
        "theme": None,
        "locale": None,
        "custom_themes": None,
        "task_sort_mode": None,
        "notification_kinds": None,
        "notification_sort": None,
    }


def test_preferences_soft_builtins_and_pastel_alias() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    for theme_id in ("lilac", "sage", "sky", "sand", "dusk", "slate"):
        res = client.patch("/api/me/preferences", json={"theme": theme_id})
        assert res.status_code == 200, res.text
        assert res.json()["theme"] == theme_id

    # Retired id remaps to lilac
    aliased = client.patch("/api/me/preferences", json={"theme": "pastel"})
    assert aliased.status_code == 200, aliased.text
    assert aliased.json()["theme"] == "lilac"


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
    assert got.json() == {
        "theme": None,
        "locale": "en",
        "custom_themes": None,
        "notification_kinds": None,
        "notification_sort": None,
        "task_sort_mode": None,
    }
