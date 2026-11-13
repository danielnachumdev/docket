from fastapi.testclient import TestClient

from docket.config import get_settings
from docket.main import create_app


def _bootstrap(client: TestClient):
    return client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password123",
        },
    )


def _set_cookie_header(response) -> str:
    # Starlette may expose multiple Set-Cookie values; pick the session one.
    raw = response.headers.get_list("set-cookie")
    for item in raw:
        if item.startswith("docket_session="):
            return item
    raise AssertionError(f"no docket_session Set-Cookie in {raw!r}")


def test_session_cookie_defaults_httponly_lax_not_secure() -> None:
    client = TestClient(create_app())
    res = _bootstrap(client)
    assert res.status_code == 200
    header = _set_cookie_header(res).lower()
    assert "httponly" in header
    assert "samesite=lax" in header
    assert "secure" not in header


def test_session_cookie_secure_when_configured(monkeypatch) -> None:
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
    get_settings.cache_clear()
    try:
        client = TestClient(create_app())
        res = _bootstrap(client)
        assert res.status_code == 200
        header = _set_cookie_header(res).lower()
        assert "httponly" in header
        assert "samesite=lax" in header
        assert "secure" in header
    finally:
        get_settings.cache_clear()
