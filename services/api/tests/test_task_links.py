from fastapi.testclient import TestClient

from docket.main import create_app


def _bootstrap(client: TestClient) -> None:
    res = client.post(
        "/api/auth/bootstrap",
        json={
            "email": "ops@example.com",
            "display_name": "Ops",
            "password": "password123",
        },
    )
    assert res.status_code == 200


def _create_task(client: TestClient, title: str) -> int:
    res = client.post("/api/tasks", json={"title": title, "priority": 2})
    assert res.status_code == 201
    return res.json()["id"]


def test_task_links_crud_and_events() -> None:
    client = TestClient(create_app())
    _bootstrap(client)

    a = _create_task(client, "Alpha")
    b = _create_task(client, "Beta")

    created = client.post(
        f"/api/tasks/{a}/links",
        json={"to_task_id": b, "kind": "blocks"},
    )
    assert created.status_code == 201
    link = created.json()
    assert link["from_task_id"] == a
    assert link["to_task_id"] == b
    assert link["kind"] == "blocks"
    link_id = link["id"]

    listed = client.get(f"/api/tasks/{a}/links")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    detail_a = client.get(f"/api/tasks/{a}")
    assert detail_a.status_code == 200
    body_a = detail_a.json()
    assert len(body_a["links"]) == 1
    assert body_a["links"][0]["kind"] == "blocks"
    assert any(e["type"] == "linked" for e in body_a["events"])

    detail_b = client.get(f"/api/tasks/{b}")
    assert any(e["type"] == "linked" for e in detail_b.json()["events"])
    assert len(detail_b.json()["links"]) == 1

    dup = client.post(
        f"/api/tasks/{a}/links",
        json={"to_task_id": b, "kind": "blocks"},
    )
    assert dup.status_code == 409

    related = client.post(
        f"/api/tasks/{a}/links",
        json={"to_task_id": b, "kind": "related"},
    )
    assert related.status_code == 201

    deleted = client.delete(f"/api/tasks/{a}/links/{link_id}")
    assert deleted.status_code == 204

    after = client.get(f"/api/tasks/{a}")
    kinds = {link["kind"] for link in after.json()["links"]}
    assert kinds == {"related"}
    assert any(e["type"] == "unlinked" for e in after.json()["events"])


def test_task_links_reject_self_and_missing() -> None:
    client = TestClient(create_app())
    _bootstrap(client)
    a = _create_task(client, "Solo")

    self_link = client.post(
        f"/api/tasks/{a}/links",
        json={"to_task_id": a, "kind": "related"},
    )
    assert self_link.status_code == 400

    missing = client.post(
        f"/api/tasks/{a}/links",
        json={"to_task_id": "00000000-0000-4000-8000-000000000999", "kind": "duplicate_of"},
    )
    assert missing.status_code == 404

    gone = client.delete(f"/api/tasks/{a}/links/99999")
    assert gone.status_code == 404
