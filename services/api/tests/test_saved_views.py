from fastapi.testclient import TestClient

from docket.main import create_app
from tests.helpers import bootstrap_owner


def test_saved_views_crud() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)

    empty = client.get("/api/saved-views")
    assert empty.status_code == 200
    assert empty.json() == []

    created = client.post(
        "/api/saved-views",
        json={
            "name": "My open queue",
            "filter_key": "my_open",
            "query": "ship",
            "position": 1,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "My open queue"
    assert body["filter_key"] == "my_open"
    assert body["query"] == "ship"
    assert body["position"] == 1
    view_id = body["id"]

    listed = client.get("/api/saved-views")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == view_id

    conflict = client.post(
        "/api/saved-views",
        json={"name": "My open queue", "filter_key": "due_soon"},
    )
    assert conflict.status_code == 409

    bad_key = client.post(
        "/api/saved-views",
        json={"name": "Weird", "filter_key": "not_a_filter"},
    )
    assert bad_key.status_code == 400

    patched = client.patch(
        f"/api/saved-views/{view_id}",
        json={"name": "Due soon", "filter_key": "due_soon", "query": ""},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Due soon"
    assert patched.json()["filter_key"] == "due_soon"
    assert patched.json()["query"] == ""

    deleted = client.delete(f"/api/saved-views/{view_id}")
    assert deleted.status_code == 204
    assert client.get("/api/saved-views").json() == []


def test_saved_views_require_auth() -> None:
    client = TestClient(create_app())
    assert client.get("/api/saved-views").status_code == 401
    assert (
        client.post(
            "/api/saved-views",
            json={"name": "x", "filter_key": "active"},
        ).status_code
        == 401
    )
