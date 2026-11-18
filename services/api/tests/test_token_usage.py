from fastapi.testclient import TestClient
from sqlalchemy import select

from waymark.db import database
from waymark.main import create_app
from waymark.models import ApiTokenRequestLog
from waymark.security import api_token_hasher


def _bootstrap(client: TestClient) -> None:
    res = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password1234",
        },
    )
    assert res.status_code == 200


def _mint_agent(client: TestClient) -> tuple[str, int]:
    roles = client.get("/api/tokens/roles")
    assert roles.status_code == 200
    agent_role_id = next(r["id"] for r in roles.json() if r["name"] == "agent_worker")
    created = client.post(
        "/api/tokens",
        json={"name": "demo-agent", "role_id": agent_role_id},
    )
    assert created.status_code == 201
    body = created.json()
    return body["token"], body["id"]


def test_bearer_requests_are_recorded_and_listed() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    raw, token_id = _mint_agent(client)

    tasks = client.get(
        "/api/tasks",
        headers={
            "Authorization": f"Bearer {raw}",
            "X-Forwarded-For": "192.0.2.10",
            "User-Agent": "demo-agent/1.0",
        },
    )
    assert tasks.status_code == 200

    session = database.session()
    try:
        rows = list(
            session.scalars(
                select(ApiTokenRequestLog).where(
                    ApiTokenRequestLog.token_id == token_id
                )
            ).all()
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.method == "GET"
        assert row.path == "/api/tasks"
        assert row.status_code == 200
        assert row.client_ip == "192.0.2.10"
        assert row.user_agent == "demo-agent/1.0"
        assert raw not in (row.path or "")
        assert "Authorization" not in (row.user_agent or "")
        assert row.client_ip != raw
        assert api_token_hasher.hash(raw) != (row.user_agent or "")
    finally:
        session.close()

    usage = client.get(f"/api/tokens/{token_id}/usage?window_days=7")
    assert usage.status_code == 200
    body = usage.json()
    assert body["total_requests"] == 1
    assert body["granularity"] == "day"
    assert sum(b["count"] for b in body["requests_by_bucket"]) == 1
    assert body["status_mix"] == [{"status_class": "2xx", "count": 1}]
    assert body["top_paths"][0]["path"] == "/api/tasks"

    listed = client.get(f"/api/tokens/{token_id}/requests?limit=20")
    assert listed.status_code == 200
    page = listed.json()
    assert page["total"] == 1
    assert page["has_more"] is False
    item = page["items"][0]
    assert item["method"] == "GET"
    assert item["path"] == "/api/tasks"
    assert item["status_code"] == 200
    assert item["client_ip"] == "192.0.2.10"
    assert item["user_agent"] == "demo-agent/1.0"
    assert "token" not in item
    assert raw not in str(item)


def test_usage_works_for_any_owned_token_scope() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    raw, token_id = _mint_agent(client)

    # Downscoped agent cannot manage tokens, but owner session can still read usage.
    forbidden = client.get(
        f"/api/tokens/{token_id}/usage",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert forbidden.status_code == 403

    client.get("/api/auth/me", headers={"Authorization": f"Bearer {raw}"})
    usage = client.get(f"/api/tokens/{token_id}/usage")
    assert usage.status_code == 200
    assert usage.json()["total_requests"] >= 1


def test_usage_unknown_token_is_404() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    missing = client.get("/api/tokens/999/usage")
    assert missing.status_code == 404
    missing_req = client.get("/api/tokens/999/requests")
    assert missing_req.status_code == 404


def test_retention_caps_rows_per_token(monkeypatch) -> None:
    monkeypatch.setenv("TOKEN_USAGE_LOG_MAX_ROWS_PER_TOKEN", "2")
    monkeypatch.setenv("TOKEN_USAGE_LOG_RETENTION_DAYS", "14")
    from waymark.config import get_settings

    get_settings.cache_clear()
    client = TestClient(create_app())
    _bootstrap(client)
    raw, token_id = _mint_agent(client)
    headers = {"Authorization": f"Bearer {raw}"}
    for _ in range(4):
        assert client.get("/api/tasks", headers=headers).status_code == 200

    session = database.session()
    try:
        count = len(
            list(
                session.scalars(
                    select(ApiTokenRequestLog).where(
                        ApiTokenRequestLog.token_id == token_id
                    )
                ).all()
            )
        )
        assert count == 2
    finally:
        session.close()
    get_settings.cache_clear()


def test_session_requests_are_not_logged() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    raw, token_id = _mint_agent(client)

    # Human session call (cookie) must not create a log row for the token.
    me = client.get("/api/auth/me")
    assert me.status_code == 200

    session = database.session()
    try:
        count = len(
            list(
                session.scalars(
                    select(ApiTokenRequestLog).where(
                        ApiTokenRequestLog.token_id == token_id
                    )
                ).all()
            )
        )
        assert count == 0
    finally:
        session.close()

    # Control: bearer does create a row.
    client.get("/api/tasks", headers={"Authorization": f"Bearer {raw}"})
    session = database.session()
    try:
        count = len(
            list(
                session.scalars(
                    select(ApiTokenRequestLog).where(
                        ApiTokenRequestLog.token_id == token_id
                    )
                ).all()
            )
        )
        assert count == 1
    finally:
        session.close()
