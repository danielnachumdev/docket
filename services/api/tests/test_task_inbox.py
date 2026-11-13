from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from docket.db import database
from docket.main import create_app
from docket.models import Task
from tests.helpers import bearer, bootstrap_owner, internal_task_id, mint_api_token


def _create_task(
    client: TestClient,
    *,
    title: str,
    priority: int = 3,
    due_at: str | None = None,
) -> str:
    payload: dict = {"title": title, "priority": priority}
    if due_at is not None:
        payload["due_at"] = due_at
    created = client.post("/api/tasks", json=payload)
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _set_task_fields(public_id: str, **fields: object) -> None:
    db = database.SessionLocal()
    try:
        task = db.get(Task, internal_task_id(public_id))
        assert task is not None
        for key, value in fields.items():
            setattr(task, key, value)
        db.commit()
    finally:
        db.close()


def test_inbox_returns_claimable_excludes_claimed_closed_archived() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, token_id = mint_api_token(user_id=user["id"])

    open_id = _create_task(client, title="Open work", priority=2)
    claimed_id = _create_task(client, title="Held by peer", priority=2)
    expired_id = _create_task(client, title="Expired lease", priority=2)
    done_id = _create_task(client, title="Done work", priority=2)
    cancelled_id = _create_task(client, title="Cancelled work", priority=2)
    archived_id = _create_task(client, title="Archived work", priority=2)

    assert (
        client.post(f"/api/tasks/{claimed_id}/claim", headers=bearer(raw)).status_code
        == 200
    )

    _set_task_fields(
        expired_id,
        claimed_by_token_id=token_id,
        claim_expires_at=datetime.now(UTC) - timedelta(seconds=30),
    )
    assert (
        client.post(
            f"/api/tasks/{done_id}/status", json={"status": "done"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{cancelled_id}/status", json={"status": "cancelled"}
        ).status_code
        == 200
    )
    assert client.post(f"/api/tasks/{archived_id}/archive").status_code == 200

    inbox = client.get("/api/tasks/inbox", headers=bearer(raw))
    assert inbox.status_code == 200, inbox.text
    ids = [t["id"] for t in inbox.json()]
    assert open_id in ids
    assert expired_id in ids
    assert claimed_id not in ids
    assert done_id not in ids
    assert cancelled_id not in ids
    assert archived_id not in ids


def test_inbox_sorts_by_priority_then_due_date() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, _ = mint_api_token(user_id=user["id"])

    later = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    sooner = (datetime.now(UTC) + timedelta(days=1)).isoformat()

    low = _create_task(client, title="Low", priority=4, due_at=sooner)
    high_later = _create_task(client, title="High later", priority=1, due_at=later)
    high_sooner = _create_task(client, title="High sooner", priority=1, due_at=sooner)

    inbox = client.get("/api/tasks/inbox", headers=bearer(raw))
    assert inbox.status_code == 200, inbox.text
    ids = [t["id"] for t in inbox.json()]
    assert ids.index(high_sooner) < ids.index(high_later) < ids.index(low)


def test_inbox_filters_priority_and_due_before() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, _ = mint_api_token(user_id=user["id"])

    due_soon = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    due_later = (datetime.now(UTC) + timedelta(days=5)).isoformat()
    cutoff = (datetime.now(UTC) + timedelta(days=1)).isoformat()

    match = _create_task(client, title="Match", priority=1, due_at=due_soon)
    _create_task(client, title="Wrong priority", priority=3, due_at=due_soon)
    _create_task(client, title="Too late", priority=1, due_at=due_later)

    inbox = client.get(
        "/api/tasks/inbox",
        params={"priority": 1, "due_before": cutoff},
        headers=bearer(raw),
    )
    assert inbox.status_code == 200, inbox.text
    assert [t["id"] for t in inbox.json()] == [match]


def test_inbox_requires_claim_permission() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    _create_task(client, title="Needs claim role")

    # Session owner has claim via owner role — allowed.
    ok = client.get("/api/tasks/inbox")
    assert ok.status_code == 200
    assert len(ok.json()) == 1
