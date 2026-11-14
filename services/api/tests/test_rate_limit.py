import pytest
from fastapi.testclient import TestClient

from docket.config import get_settings
from docket.main import create_app
from docket.rate_limit import TokenRateLimiter
from tests.helpers import bearer, bootstrap_owner, mint_api_token


def test_token_rate_limiter_sliding_window() -> None:
    limiter = TokenRateLimiter(max_requests=2, window_seconds=10)
    first = limiter.check(7, now=100.0)
    second = limiter.check(7, now=101.0)
    third = limiter.check(7, now=102.0)
    assert first.allowed and first.remaining == 1
    assert second.allowed and second.remaining == 0
    assert not third.allowed
    assert third.retry_after_seconds >= 1
    # Different token is independent.
    assert limiter.check(8, now=102.0).allowed
    # After window slides past the first hit, capacity returns.
    assert limiter.check(7, now=110.1).allowed


def test_bearer_token_over_limit_returns_429(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_TOKEN_REQUESTS", "3")
    monkeypatch.setenv("RATE_LIMIT_TOKEN_WINDOW_SECONDS", "60")
    get_settings.cache_clear()
    client = TestClient(create_app())
    owner = bootstrap_owner(client)
    raw, _token_id = mint_api_token(user_id=owner["id"], name="rate-agent")
    headers = bearer(raw)

    ok_codes = []
    for _ in range(3):
        res = client.get("/api/tasks", headers=headers)
        ok_codes.append(res.status_code)
        assert res.headers.get("X-RateLimit-Limit") == "3"
    assert ok_codes == [200, 200, 200]

    blocked = client.get("/api/tasks", headers=headers)
    assert blocked.status_code == 429
    body = blocked.json()
    assert body["detail"] == "Rate limit exceeded for API token"
    assert "retry_after" in body
    assert blocked.headers.get("Retry-After")
    assert blocked.headers.get("X-RateLimit-Remaining") == "0"

    # Session human traffic is not under the per-token ceiling.
    session_ok = client.get("/api/tasks")
    assert session_ok.status_code == 200

    # Health stays exempt even if a token is presented.
    health = client.get("/api/health", headers=headers)
    assert health.status_code == 200


def test_under_limit_token_still_works(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_TOKEN_REQUESTS", "50")
    monkeypatch.setenv("RATE_LIMIT_TOKEN_WINDOW_SECONDS", "60")
    get_settings.cache_clear()
    client = TestClient(create_app())
    owner = bootstrap_owner(client)
    raw, _ = mint_api_token(user_id=owner["id"])
    res = client.get("/api/auth/me", headers=bearer(raw))
    assert res.status_code == 200
    assert res.json()["email"] == "ops@example.com"
    assert res.headers.get("X-RateLimit-Limit") == "50"
