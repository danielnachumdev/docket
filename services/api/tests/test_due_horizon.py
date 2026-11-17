"""Persist due_horizon intent alongside due_at for date-mode sections."""

from fastapi.testclient import TestClient

from tests.helpers import bootstrap_owner
from waymark.main import create_app


def test_patch_horizon_chip_persists_due_horizon() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/tasks", json={"title": "Quarterly wrap"})
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]

    patched = client.patch(
        f"/api/tasks/{task_id}",
        json={
            "due_at": "2026-12-31T21:59:59.999Z",
            "due_horizon": "year",
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["due_horizon"] == "year"
    assert body["due_at"] is not None

    detail = client.get(f"/api/tasks/{task_id}").json()["task"]
    assert detail["due_horizon"] == "year"


def test_patch_due_at_alone_defaults_horizon_to_exact() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/tasks", json={"title": "Exact due"})
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]

    patched = client.patch(
        f"/api/tasks/{task_id}",
        json={"due_at": "2026-12-15T12:00:00Z"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["due_horizon"] == "exact"


def test_clear_due_clears_horizon() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post(
        "/api/tasks",
        json={
            "title": "Clear me",
            "due_at": "2026-12-31T21:59:59.999Z",
            "due_horizon": "quarter",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["due_horizon"] == "quarter"

    cleared = client.patch(
        f"/api/tasks/{created.json()['id']}",
        json={"clear_due_at": True},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["due_at"] is None
    assert cleared.json()["due_horizon"] is None


def test_create_with_due_at_without_horizon_is_exact() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post(
        "/api/tasks",
        json={"title": "API due", "due_at": "2026-06-01T12:00:00Z"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["due_horizon"] == "exact"


def test_rejects_invalid_due_horizon() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/tasks", json={"title": "Bad horizon"})
    assert created.status_code == 201, created.text
    bad = client.patch(
        f"/api/tasks/{created.json()['id']}",
        json={"due_at": "2026-12-31T12:00:00Z", "due_horizon": "sometime"},
    )
    assert bad.status_code == 422
