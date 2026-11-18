"""Personal progress stats (/api/me/stats)."""

from datetime import UTC, datetime, timedelta
import json

from fastapi.testclient import TestClient
from sqlalchemy import select

from waymark.db import database
from waymark.main import create_app
from waymark.models import Task, TaskEvent, User
from waymark.security import password_hasher
from tests.helpers import bearer, bootstrap_owner, link_as_contact, mint_api_token


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text


def _create_user(email: str, display_name: str, password: str) -> User:
    session = database.session()
    try:
        user = User(
            email=email,
            display_name=display_name,
            password_hash=password_hasher.hash(password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user
    finally:
        session.close()


def _patch_task(public_id: str, **fields: object) -> None:
    db = database.SessionLocal()
    try:
        task = db.scalar(select(Task).where(Task.public_id == public_id))
        assert task is not None
        for key, value in fields.items():
            setattr(task, key, value)
        db.commit()
    finally:
        db.close()


def _add_status_event(
    public_id: str,
    *,
    to_status: str,
    created_at: datetime,
    actor_user_id: int,
    actor_token_id: int | None = None,
    from_status: str = "backlog",
) -> None:
    db = database.SessionLocal()
    try:
        task = db.scalar(select(Task).where(Task.public_id == public_id))
        assert task is not None
        event = TaskEvent(
            task_id=task.id,
            type="status_changed",
            actor_user_id=actor_user_id,
            actor_token_id=actor_token_id,
            payload_json=json.dumps({"from": from_status, "to": to_status}),
            created_at=created_at,
        )
        db.add(event)
        db.commit()
    finally:
        db.close()


def test_me_stats_require_auth() -> None:
    client = TestClient(create_app())
    assert client.get("/api/me/stats").status_code == 401


def test_me_stats_empty_workspace_zeros() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    res = client.get("/api/me/stats")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["window_days"] == 7
    assert body["throughput"] == {"completed": 0, "prior_completed": 0, "delta": 0}
    assert body["completion_rate"] == {
        "done": 0,
        "failed": 0,
        "cancelled": 0,
        "rate": None,
    }
    assert body["cycle_time"] == {"sample_size": 0, "median_hours": None}
    assert body["wip"]["open"] == 0
    assert body["blocked"]["count"] == 0
    assert body["failed"] == {"count": 0, "in_window": 0}
    assert body["priority"] == {"p1_p2_open": 0, "p1_p2_done_in_window": 0}
    assert body["streak"] == {"current_days": 0, "active_days_in_window": 0}
    assert body["actor_mix"] == {"agent_completions": 0, "human_completions": 0}
    assert body["claims"] == {"active": 0, "expired": 0}
    assert body["outcomes"] == {"with_outcome": 0, "without_outcome": 0}
    assert body["shared"] == {
        "owned_completions": 0,
        "shared_with_me_completions": 0,
    }
    assert len(body["completions_by_day"]) == 7
    assert all(point["count"] == 0 for point in body["completions_by_day"])


def test_me_stats_throughput_wip_blocked_completion_rate() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    now = datetime.now(UTC)

    done_a = client.post("/api/tasks", json={"title": "Done A", "priority": 1}).json()[
        "id"
    ]
    done_b = client.post("/api/tasks", json={"title": "Done B", "priority": 3}).json()[
        "id"
    ]
    failed = client.post(
        "/api/tasks", json={"title": "Failed one", "priority": 2}
    ).json()["id"]
    blocked = client.post(
        "/api/tasks", json={"title": "Blocked one", "priority": 1}
    ).json()["id"]
    open_old = client.post(
        "/api/tasks", json={"title": "Old open", "priority": 2}
    ).json()["id"]
    cancelled = client.post(
        "/api/tasks", json={"title": "Cancelled", "priority": 4}
    ).json()["id"]
    backlog = client.post("/api/tasks", json={"title": "Never started"}).json()["id"]
    _ = backlog

    assert (
        client.post(f"/api/tasks/{done_a}/status", json={"status": "done"}).status_code
        == 200
    )
    assert (
        client.post(f"/api/tasks/{done_b}/status", json={"status": "done"}).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{failed}/status", json={"status": "failed"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{blocked}/status", json={"status": "blocked"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{cancelled}/status", json={"status": "cancelled"}
        ).status_code
        == 200
    )

    _patch_task(done_a, completed_at=now - timedelta(days=2))
    _patch_task(done_b, completed_at=now - timedelta(days=10))
    _patch_task(failed, updated_at=now - timedelta(hours=3))
    _patch_task(cancelled, cancelled_at=now - timedelta(days=1))
    _patch_task(open_old, created_at=now - timedelta(days=40))

    res = client.get("/api/me/stats?window_days=7")
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["throughput"]["completed"] == 1
    assert body["throughput"]["prior_completed"] == 1
    assert body["throughput"]["delta"] == 0
    assert body["completion_rate"]["done"] == 1
    assert body["completion_rate"]["failed"] == 1
    assert body["completion_rate"]["cancelled"] == 1
    assert body["completion_rate"]["rate"] == 1 / 3
    # failed + blocked + open_old + backlog
    assert body["wip"]["open"] == 4
    assert body["wip"]["open_older_than_30d"] >= 1
    assert body["blocked"]["count"] == 1
    assert body["failed"]["count"] == 1
    assert body["failed"]["in_window"] == 1
    assert body["priority"]["p1_p2_open"] >= 2
    assert body["priority"]["p1_p2_done_in_window"] == 1
    assert len(body["completions_by_day"]) == 7
    assert sum(point["count"] for point in body["completions_by_day"]) == 1
    expected_day = (now - timedelta(days=2)).date().isoformat()
    assert any(
        point["day"] == expected_day and point["count"] == 1
        for point in body["completions_by_day"]
    )


def test_me_stats_cycle_time_median() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    now = datetime.now(UTC)

    t1 = client.post("/api/tasks", json={"title": "Cycle short"}).json()["id"]
    t2 = client.post("/api/tasks", json={"title": "Cycle long"}).json()["id"]
    t3 = client.post("/api/tasks", json={"title": "No start event"}).json()["id"]

    for tid in (t1, t2, t3):
        assert (
            client.post(f"/api/tasks/{tid}/status", json={"status": "done"}).status_code
            == 200
        )

    _patch_task(t1, completed_at=now - timedelta(hours=1))
    _patch_task(t2, completed_at=now - timedelta(hours=1))
    _patch_task(t3, completed_at=now - timedelta(hours=1))

    _add_status_event(
        t1,
        to_status="in_progress",
        created_at=now - timedelta(hours=5),
        actor_user_id=user["id"],
    )
    _add_status_event(
        t2,
        to_status="in_progress",
        created_at=now - timedelta(hours=13),
        actor_user_id=user["id"],
    )
    # t3 has no in_progress event → excluded from sample

    res = client.get("/api/me/stats?window_days=7")
    assert res.status_code == 200, res.text
    cycle = res.json()["cycle_time"]
    assert cycle["sample_size"] == 2
    # median of 4h and 12h = 8h
    assert cycle["median_hours"] == 8.0


def test_me_stats_agent_vs_human_actor_mix() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, token_id = mint_api_token(user_id=user["id"], name="demo-api")
    now = datetime.now(UTC)

    human_task = client.post("/api/tasks", json={"title": "Human done"}).json()["id"]
    agent_task = client.post("/api/tasks", json={"title": "Agent done"}).json()["id"]

    assert (
        client.post(
            f"/api/tasks/{human_task}/status", json={"status": "done"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{agent_task}/claim",
            json={"lease_seconds": 120},
            headers=bearer(raw),
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{agent_task}/status",
            json={"status": "done"},
            headers=bearer(raw),
        ).status_code
        == 200
    )

    _patch_task(human_task, completed_at=now - timedelta(hours=2))
    _patch_task(agent_task, completed_at=now - timedelta(hours=2))

    # Ensure done events fall in window with correct actors (API already recorded them).
    res = client.get("/api/me/stats?window_days=7")
    assert res.status_code == 200, res.text
    mix = res.json()["actor_mix"]
    assert mix["human_completions"] >= 1
    assert mix["agent_completions"] >= 1
    assert token_id > 0


def test_me_stats_shared_vs_owned_completions() -> None:
    client = TestClient(create_app())
    owner = bootstrap_owner(client)
    now = datetime.now(UTC)

    owned = client.post("/api/tasks", json={"title": "Mine done"}).json()["id"]
    assert (
        client.post(f"/api/tasks/{owned}/status", json={"status": "done"}).status_code
        == 200
    )
    _patch_task(owned, completed_at=now - timedelta(hours=4))

    alex = _create_user("alex@example.com", "Alex", "password123")
    link_as_contact(owner_user_id=owner["id"], contact=alex)
    shared = client.post("/api/tasks", json={"title": "Shared board"}).json()["id"]
    share = client.post(
        f"/api/tasks/{shared}/shares",
        json={"email": "alex@example.com", "role": "editor"},
    )
    assert share.status_code == 201, share.text

    assert (
        client.post(f"/api/tasks/{shared}/status", json={"status": "done"}).status_code
        == 200
    )
    _patch_task(shared, completed_at=now - timedelta(hours=3))

    client.post("/api/auth/logout")
    _login(client, "alex@example.com", "password123")

    res = client.get("/api/me/stats?window_days=7")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["shared"]["owned_completions"] == 0
    assert body["shared"]["shared_with_me_completions"] == 1
    assert body["throughput"]["completed"] == 0
    assert alex.id > 0


def test_me_stats_claims_active_and_expired() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, token_id = mint_api_token(user_id=user["id"])
    now = datetime.now(UTC)

    active_id = client.post("/api/tasks", json={"title": "Active claim"}).json()["id"]
    expired_id = client.post("/api/tasks", json={"title": "Expired claim"}).json()["id"]

    assert (
        client.post(
            f"/api/tasks/{active_id}/claim",
            json={"lease_seconds": 600},
            headers=bearer(raw),
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{expired_id}/claim",
            json={"lease_seconds": 60},
            headers=bearer(raw),
        ).status_code
        == 200
    )
    _patch_task(
        expired_id,
        claimed_by_token_id=token_id,
        claim_expires_at=now - timedelta(minutes=5),
    )

    res = client.get("/api/me/stats")
    assert res.status_code == 200, res.text
    claims = res.json()["claims"]
    assert claims["active"] == 1
    assert claims["expired"] == 1


def test_me_stats_outcomes_and_window_30() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    schema = {
        "type": "object",
        "properties": {"summary": {"type": "string"}},
        "required": ["summary"],
        "additionalProperties": False,
    }
    with_out = client.post(
        "/api/tasks",
        json={"title": "With outcome", "outcome_schema": schema},
    ).json()["id"]
    without = client.post("/api/tasks", json={"title": "No outcome"}).json()["id"]

    assert (
        client.post(
            f"/api/tasks/{with_out}/status",
            json={"status": "done", "outcome": {"summary": "demo-api ok"}},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{without}/status", json={"status": "done"}
        ).status_code
        == 200
    )

    res = client.get("/api/me/stats?window_days=30")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["window_days"] == 30
    assert body["outcomes"]["with_outcome"] == 1
    assert body["outcomes"]["without_outcome"] == 1


def test_me_stats_rejects_invalid_window() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    assert client.get("/api/me/stats?window_days=0").status_code == 422
    assert client.get("/api/me/stats?window_days=91").status_code == 422
