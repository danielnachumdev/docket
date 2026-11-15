from fastapi.testclient import TestClient

from waymark.db import database
from waymark.main import create_app
from waymark.models import Task
from sqlalchemy import select
from tests.helpers import bootstrap_owner, mint_api_token, bearer


def _create(client: TestClient, title: str, **extra: object) -> dict:
    res = client.post("/api/tasks", json={"title": title, **extra})
    assert res.status_code == 201, res.text
    return res.json()


def test_create_appends_increasing_ranks() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    a = _create(client, "A")
    b = _create(client, "B")
    c = _create(client, "C")
    assert a["rank"] < b["rank"] < c["rank"]
    listed = client.get("/api/tasks").json()
    assert [t["id"] for t in listed] == [a["id"], b["id"], c["id"]]


def test_reorder_before_after_and_end() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    a = _create(client, "A")
    b = _create(client, "B")
    c = _create(client, "C")

    # Move C to the top (before A).
    res = client.post(
        f"/api/tasks/{c['id']}/reorder", json={"before_task_id": a["id"]}
    )
    assert res.status_code == 200, res.text
    assert res.json()["rank"] < a["rank"]

    listed = [t["id"] for t in client.get("/api/tasks").json()]
    assert listed == [c["id"], a["id"], b["id"]]

    # Move A after B (to the end among remaining).
    res = client.post(
        f"/api/tasks/{a['id']}/reorder", json={"after_task_id": b["id"]}
    )
    assert res.status_code == 200, res.text
    listed = [t["id"] for t in client.get("/api/tasks").json()]
    assert listed == [c["id"], b["id"], a["id"]]

    # Empty body moves to end (already at end — still ok).
    res = client.post(f"/api/tasks/{c['id']}/reorder", json={})
    assert res.status_code == 200, res.text
    listed = [t["id"] for t in client.get("/api/tasks").json()]
    assert listed == [b["id"], a["id"], c["id"]]

    detail = client.get(f"/api/tasks/{c['id']}").json()
    assert any(e["type"] == "reordered" for e in detail["events"])


def test_reorder_rejects_both_anchors_and_self() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    root = _create(client, "Root")
    other_root = _create(client, "Other")

    both = client.post(
        f"/api/tasks/{root['id']}/reorder",
        json={"before_task_id": other_root["id"], "after_task_id": other_root["id"]},
    )
    assert both.status_code == 422

    self_ref = client.post(
        f"/api/tasks/{root['id']}/reorder",
        json={"before_task_id": root["id"]},
    )
    assert self_ref.status_code == 400


def test_reorder_child_before_unrelated_root() -> None:
    """Rank is owner-global: a child may sit before a root with a different parent."""
    client = TestClient(create_app())
    bootstrap_owner(client)
    parent = _create(client, "Parent")
    child = _create(client, "Child", parent_task_id=parent["id"])
    root = _create(client, "Root")

    res = client.post(
        f"/api/tasks/{child['id']}/reorder",
        json={"before_task_id": root["id"]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["rank"] < root["rank"]

    listed = [t["id"] for t in client.get("/api/tasks").json()]
    assert listed.index(child["id"]) < listed.index(root["id"])
    assert listed == [parent["id"], child["id"], root["id"]]


def test_list_order_follows_global_rank_across_parents() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    parent = _create(client, "Parent")
    child = _create(client, "Child", parent_task_id=parent["id"])
    root = _create(client, "Root")

    # Child first, then root, then parent — crosses hierarchy.
    assert (
        client.post(
            f"/api/tasks/{child['id']}/reorder",
            json={"before_task_id": parent["id"]},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tasks/{root['id']}/reorder",
            json={"after_task_id": child["id"]},
        ).status_code
        == 200
    )

    listed = client.get("/api/tasks").json()
    assert [t["id"] for t in listed] == [child["id"], root["id"], parent["id"]]
    ranks = [t["rank"] for t in listed]
    assert ranks == sorted(ranks)


def test_reorder_subtasks_sort_by_global_rank_in_detail() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    parent = _create(client, "Parent")
    a = _create(client, "Sub A", parent_task_id=parent["id"])
    b = _create(client, "Sub B", parent_task_id=parent["id"])
    c = _create(client, "Sub C", parent_task_id=parent["id"])

    client.post(f"/api/tasks/{c['id']}/reorder", json={"before_task_id": a["id"]})
    detail = client.get(f"/api/tasks/{parent['id']}").json()
    assert [t["id"] for t in detail["children"]] == [c["id"], a["id"], b["id"]]


def test_create_subtask_appends_on_owner_queue() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    parent = _create(client, "Parent")
    root = _create(client, "Root")
    child = _create(client, "Child", parent_task_id=parent["id"])
    assert parent["rank"] < root["rank"] < child["rank"]
    listed = [t["id"] for t in client.get("/api/tasks").json()]
    assert listed == [parent["id"], root["id"], child["id"]]


def test_reorder_rebalances_when_gap_collapses() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    a = _create(client, "A")
    b = _create(client, "B")
    c = _create(client, "C")

    # Force nearly-identical ranks so midpoint insert must reindex.
    db = database.SessionLocal()
    try:
        for public_id, rank in ((a["id"], 1.0), (b["id"], 1.0 + 1e-9), (c["id"], 2.0)):
            task = db.scalar(select(Task).where(Task.public_id == public_id))
            assert task is not None
            task.rank = rank
        db.commit()
    finally:
        db.close()

    res = client.post(
        f"/api/tasks/{c['id']}/reorder", json={"after_task_id": a["id"]}
    )
    assert res.status_code == 200, res.text
    listed = client.get("/api/tasks").json()
    ranks = [t["rank"] for t in listed]
    assert ranks == sorted(ranks)
    assert len(set(ranks)) == 3
    assert [t["id"] for t in listed] == [a["id"], c["id"], b["id"]]


def test_inbox_follows_rank_order() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, _ = mint_api_token(user_id=user["id"])
    a = _create(client, "A", priority=4)
    b = _create(client, "B", priority=1)
    client.post(f"/api/tasks/{b['id']}/reorder", json={"before_task_id": a["id"]})
    inbox = client.get("/api/tasks/inbox", headers=bearer(raw))
    assert inbox.status_code == 200
    ids = [t["id"] for t in inbox.json()]
    assert ids.index(b["id"]) < ids.index(a["id"])
