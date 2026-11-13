from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from docket.db import database
from docket.main import create_app
from docket.models import Task
from tests.helpers import bearer, bootstrap_owner, internal_task_id, mint_api_token


def _create_task(client: TestClient) -> str:
    created = client.post("/api/tasks", json={"title": "Agent work", "priority": 2})
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_token_claim_release_and_events() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw, token_id = mint_api_token(user_id=user["id"], name="demo-api")

    claimed = client.post(
        f"/api/tasks/{task_id}/claim",
        json={"lease_seconds": 120},
        headers=bearer(raw),
    )
    assert claimed.status_code == 200, claimed.text
    body = claimed.json()
    assert body["claimed_by_token_id"] == token_id
    assert body["claim_expires_at"] is not None

    detail = client.get(f"/api/tasks/{task_id}", headers=bearer(raw))
    events = detail.json()["events"]
    types = [e["type"] for e in events]
    assert "claimed" in types
    claimed_events = [e for e in events if e["type"] == "claimed"]
    assert claimed_events[0]["actor_token_id"] == token_id
    assert claimed_events[0]["actor_token_name"] == "demo-api"
    assert claimed_events[0]["actor_role_name"] == "agent_worker"
    assert body["claimed_by_token_name"] == "demo-api"
    assert detail.json()["task"]["claimed_by_token_name"] == "demo-api"

    released = client.post(f"/api/tasks/{task_id}/release", headers=bearer(raw))
    assert released.status_code == 200
    assert released.json()["claimed_by_token_id"] is None
    assert released.json()["claim_expires_at"] is None

    detail2 = client.get(f"/api/tasks/{task_id}", headers=bearer(raw))
    types2 = [e["type"] for e in detail2.json()["events"]]
    assert "released" in types2


def test_task_detail_events_include_actor_token_name() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, token_id = mint_api_token(user_id=user["id"], name="demo-api")

    created = client.post(
        "/api/tasks",
        json={"title": "Token-authored task", "priority": 3},
        headers=bearer(raw),
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200, detail.text
    created_events = [e for e in detail.json()["events"] if e["type"] == "created"]
    assert created_events
    assert created_events[0]["actor_token_id"] == token_id
    assert created_events[0]["actor_token_name"] == "demo-api"
    assert created_events[0]["actor_role_name"] == "agent_worker"


def test_claim_lease_timeline_events_include_actor_role() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw, token_id = mint_api_token(user_id=user["id"], name="demo-api")

    assert (
        client.post(
            f"/api/tasks/{task_id}/claim",
            json={"lease_seconds": 60},
            headers=bearer(raw),
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{task_id}/heartbeat",
            json={"lease_seconds": 120},
            headers=bearer(raw),
        ).status_code
        == 200
    )
    assert client.post(f"/api/tasks/{task_id}/release", headers=bearer(raw)).status_code == 200

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200, detail.text
    by_type = {e["type"]: e for e in detail.json()["events"]}
    for event_type in ("claimed", "claim_renewed", "released"):
        event = by_type[event_type]
        assert event["actor_token_id"] == token_id
        assert event["actor_token_name"] == "demo-api"
        assert event["actor_role_name"] == "agent_worker"
    assert detail.json()["task"]["claimed_by_token_id"] is None
    assert detail.json()["task"]["claimed_by_token_name"] is None


def test_double_claim_rejected_while_lease_valid() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw_a, _ = mint_api_token(user_id=user["id"], name="agent-a")
    raw_b, _ = mint_api_token(user_id=user["id"], name="agent-b")

    first = client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_a))
    assert first.status_code == 200

    second = client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_b))
    assert second.status_code == 409

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.status_code == 200
    task = detail.json()["task"]
    assert task["last_error"] == "Task is claimed by another agent"
    failed_events = [e for e in detail.json()["events"] if e["type"] == "claim_failed"]
    assert failed_events
    assert "Task is claimed by another agent" in (failed_events[0]["payload_json"] or "")


def test_heartbeat_without_claim_records_last_error() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw, _ = mint_api_token(user_id=user["id"], name="demo-api")

    renewed = client.post(f"/api/tasks/{task_id}/heartbeat", headers=bearer(raw))
    assert renewed.status_code == 409

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.json()["task"]["last_error"] == "No active claim to renew"
    assert any(e["type"] == "heartbeat_failed" for e in detail.json()["events"])


def test_release_by_other_token_records_last_error() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw_a, _ = mint_api_token(user_id=user["id"], name="agent-a")
    raw_b, _ = mint_api_token(user_id=user["id"], name="agent-b")

    assert client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_a)).status_code == 200
    denied = client.post(f"/api/tasks/{task_id}/release", headers=bearer(raw_b))
    assert denied.status_code == 409

    detail = client.get(f"/api/tasks/{task_id}")
    assert detail.json()["task"]["last_error"] == "Task is claimed by another agent"
    assert any(e["type"] == "release_failed" for e in detail.json()["events"])


def test_successful_claim_clears_last_error() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw_a, token_a = mint_api_token(user_id=user["id"], name="agent-a")
    raw_b, _ = mint_api_token(user_id=user["id"], name="agent-b")

    assert client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_a)).status_code == 200
    assert client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_b)).status_code == 409

    db = database.SessionLocal()
    try:
        task = db.get(Task, internal_task_id(task_id))
        assert task is not None
        task.claimed_by_token_id = token_a
        task.claim_expires_at = datetime.now(UTC) - timedelta(seconds=5)
        db.commit()
    finally:
        db.close()

    reclaimed = client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_b))
    assert reclaimed.status_code == 200, reclaimed.text
    assert reclaimed.json()["last_error"] is None


def test_expired_lease_can_be_reclaimed() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw_a, token_a = mint_api_token(user_id=user["id"], name="agent-a")
    raw_b, token_b = mint_api_token(user_id=user["id"], name="agent-b")

    assert client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_a)).status_code == 200

    db = database.SessionLocal()
    try:
        task = db.get(Task, internal_task_id(task_id))
        assert task is not None
        task.claimed_by_token_id = token_a
        task.claim_expires_at = datetime.now(UTC) - timedelta(seconds=5)
        db.commit()
    finally:
        db.close()

    reclaimed = client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw_b))
    assert reclaimed.status_code == 200, reclaimed.text
    assert reclaimed.json()["claimed_by_token_id"] == token_b


def test_heartbeat_renews_lease() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw, _ = mint_api_token(user_id=user["id"])

    claimed = client.post(
        f"/api/tasks/{task_id}/claim",
        json={"lease_seconds": 60},
        headers=bearer(raw),
    )
    assert claimed.status_code == 200
    first_expiry = claimed.json()["claim_expires_at"]

    renewed = client.post(
        f"/api/tasks/{task_id}/heartbeat",
        json={"lease_seconds": 600},
        headers=bearer(raw),
    )
    assert renewed.status_code == 200, renewed.text
    assert renewed.json()["claim_expires_at"] != first_expiry

    detail = client.get(f"/api/tasks/{task_id}", headers=bearer(raw))
    assert any(e["type"] == "claim_renewed" for e in detail.json()["events"])


def test_session_cannot_claim_but_can_override_release() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    task_id = _create_task(client)
    raw, token_id = mint_api_token(user_id=user["id"])

    assert client.post(f"/api/tasks/{task_id}/claim", headers=bearer(raw)).status_code == 200

    session_claim = client.post(f"/api/tasks/{task_id}/claim", json={"lease_seconds": 60})
    assert session_claim.status_code == 400

    override = client.post(f"/api/tasks/{task_id}/release")
    assert override.status_code == 200
    assert override.json()["claimed_by_token_id"] is None

    # Confirm the agent still held it before override by checking event history.
    detail = client.get(f"/api/tasks/{task_id}")
    claimed_events = [e for e in detail.json()["events"] if e["type"] == "claimed"]
    assert claimed_events
    assert claimed_events[0]["actor_token_id"] == token_id
