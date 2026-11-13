import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from docket.main import create_app
from docket.webhooks.webhook_http_gateway import WebhookHttpResult
from tests.helpers import bearer, bootstrap_owner, mint_api_token


class _FakeHttp:
    def __init__(self, *, status_code: int = 200, raise_exc: Exception | None = None) -> None:
        self.calls: list[dict] = []
        self._status_code = status_code
        self._raise_exc = raise_exc

    def post(self, url: str, *, content: bytes, headers: dict[str, str]) -> WebhookHttpResult:
        self.calls.append({"url": url, "content": content, "headers": headers})
        if self._raise_exc is not None:
            raise self._raise_exc
        return WebhookHttpResult(status_code=self._status_code, text="ok")


def _install_fake(monkeypatch, fake: _FakeHttp) -> None:
    monkeypatch.setattr(
        "docket.webhooks.webhook_delivery_service.WebhookHttpGateway",
        lambda *args, **kwargs: fake,
    )


def _bootstrap(client: TestClient) -> dict:
    return bootstrap_owner(client)


def _create_webhook(
    client: TestClient,
    *,
    name: str = "Slack bridge",
    url: str = "https://hooks.example.com/docket",
    event_types: list[str] | None = None,
) -> dict:
    body: dict = {"name": name, "url": url}
    if event_types is not None:
        body["event_types"] = event_types
    res = client.post("/api/webhooks", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_webhook_crud_and_secret_once() -> None:
    client = TestClient(create_app())
    _bootstrap(client)

    created = _create_webhook(client, event_types=["status_changed", "commented"])
    assert created["secret"].startswith("whsec_")
    assert set(created["event_types"]) == {"status_changed", "commented"}
    assert created["enabled"] is True
    secret = created["secret"]
    wid = created["id"]

    listed = client.get("/api/webhooks")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert "secret" not in rows[0]
    assert rows[0]["id"] == wid

    updated = client.patch(
        f"/api/webhooks/{wid}",
        json={"enabled": False, "name": "Paused Slack"},
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False
    assert updated.json()["name"] == "Paused Slack"

    deleted = client.delete(f"/api/webhooks/{wid}")
    assert deleted.status_code == 204
    assert client.get("/api/webhooks").json() == []
    assert secret  # still held by caller after create


def test_agent_token_cannot_manage_webhooks() -> None:
    client = TestClient(create_app())
    owner = _bootstrap(client)
    raw, _ = mint_api_token(user_id=owner["id"], name="demo-api")
    client.cookies.clear()
    res = client.get("/api/webhooks", headers=bearer(raw))
    assert res.status_code == 403


def test_status_claim_comment_fire_signed_webhooks(monkeypatch) -> None:
    client = TestClient(create_app())
    owner = _bootstrap(client)
    fake = _FakeHttp()
    _install_fake(monkeypatch, fake)

    hook = _create_webhook(client)
    secret = hook["secret"]

    task = client.post("/api/tasks", json={"title": "Bridge demo"}).json()
    task_id = task["id"]

    status_res = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert status_res.status_code == 200
    assert len(fake.calls) == 1
    _assert_signed_delivery(
        fake.calls[0],
        secret=secret,
        event_type="status_changed",
        task_id=task_id,
        data_subset={"to": "done"},
    )

    raw, token_id = mint_api_token(user_id=owner["id"], name="demo-api")
    claim = client.post(
        f"/api/tasks/{task_id}/claim",
        headers=bearer(raw),
        json={"lease_seconds": 60},
    )
    assert claim.status_code == 200
    assert len(fake.calls) == 2
    _assert_signed_delivery(
        fake.calls[1],
        secret=secret,
        event_type="claimed",
        task_id=task_id,
        data_subset={"claimed_by_token_id": token_id},
    )

    comment = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"body": "Shipped to WhatsApp bridge"},
    )
    assert comment.status_code == 201
    assert comment.json()["body"] == "Shipped to WhatsApp bridge"
    assert len(fake.calls) == 3
    _assert_signed_delivery(
        fake.calls[2],
        secret=secret,
        event_type="commented",
        task_id=task_id,
        data_subset={"body": "Shipped to WhatsApp bridge"},
    )

    release = client.post(f"/api/tasks/{task_id}/release", headers=bearer(raw))
    assert release.status_code == 200
    assert len(fake.calls) == 4
    _assert_signed_delivery(
        fake.calls[3],
        secret=secret,
        event_type="released",
        task_id=task_id,
    )

    hooks = client.get("/api/webhooks").json()
    assert hooks[0]["last_status_code"] == 200
    assert hooks[0]["last_error"] is None
    assert hooks[0]["last_delivered_at"] is not None


def test_webhook_delivery_errors_fail_soft(monkeypatch) -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    fake = _FakeHttp(raise_exc=RuntimeError("connection refused"))
    _install_fake(monkeypatch, fake)
    _create_webhook(client, event_types=["status_changed"])
    task = client.post("/api/tasks", json={"title": "Soft fail"}).json()

    res = client.post(f"/api/tasks/{task['id']}/status", json={"status": "in_progress"})
    assert res.status_code == 200
    assert res.json()["status"] == "in_progress"
    assert len(fake.calls) == 1

    hooks = client.get("/api/webhooks").json()
    assert hooks[0]["last_error"] is not None
    assert "connection refused" in hooks[0]["last_error"]


def test_event_type_filter_skips_unsubscribed(monkeypatch) -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    fake = _FakeHttp()
    _install_fake(monkeypatch, fake)
    _create_webhook(client, event_types=["commented"])
    task = client.post("/api/tasks", json={"title": "Filtered"}).json()
    client.post(f"/api/tasks/{task['id']}/status", json={"status": "done"})
    assert fake.calls == []
    client.post(f"/api/tasks/{task['id']}/comments", json={"body": "hi"})
    assert len(fake.calls) == 1


def _assert_signed_delivery(
    call: dict,
    *,
    secret: str,
    event_type: str,
    task_id: int,
    data_subset: dict | None = None,
) -> None:
    body = call["content"]
    headers = call["headers"]
    assert headers["X-Docket-Event"] == event_type
    assert headers["Content-Type"] == "application/json"
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert headers["X-Docket-Signature"] == expected
    payload = json.loads(body)
    assert payload["type"] == event_type
    assert payload["task"]["id"] == task_id
    assert "event_id" in payload
    assert "actor" in payload
    if data_subset:
        for key, value in data_subset.items():
            assert payload["data"][key] == value
