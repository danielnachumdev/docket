"""Cleanup: updated-event payloads use description, not body."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient
from sqlalchemy import select

from tests.helpers import bootstrap_owner
from waymark.db import database
from waymark.legacy.task_event_payload_rewriter import task_event_payload_rewriter
from waymark.main import create_app
from waymark.models import TaskEvent


def test_updated_events_store_description_not_body() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task = client.post(
        "/api/tasks",
        json={"title": "Cleanup payload", "description": "v1"},
    ).json()
    patched = client.patch(
        f"/api/tasks/{task['id']}",
        json={"description": "v2"},
    )
    assert patched.status_code == 200

    db = database.SessionLocal()
    try:
        events = db.scalars(select(TaskEvent).where(TaskEvent.type == "updated")).all()
        assert events
        for event in events:
            assert event.payload_json
            payload = json.loads(event.payload_json)
            assert "body" not in payload
            assert "description" in payload
    finally:
        db.close()


def test_payload_rewriter_renames_body_key() -> None:
    raw = json.dumps({"body": True, "priority": 2})
    out = task_event_payload_rewriter.rename_key(
        raw, from_key="body", to_key="description"
    )
    assert out is not None
    assert json.loads(out) == {"description": True, "priority": 2}
    assert (
        task_event_payload_rewriter.rename_key(
            json.dumps({"priority": 1}), from_key="body", to_key="description"
        )
        is None
    )


def test_task_create_rejects_legacy_body_field() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    res = client.post(
        "/api/tasks",
        json={"title": "nope", "body": "legacy"},
    )
    assert res.status_code == 422
