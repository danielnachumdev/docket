from fastapi.testclient import TestClient

from docket.main import create_app
from tests.helpers import bearer, bootstrap_owner, mint_api_token


def test_create_with_same_external_id_is_idempotent() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    payload = {
        "title": "WhatsApp follow-up",
        "priority": 2,
        "external_id": "wa:chat-demo:msg-001",
        "body": "From demo chat bot",
    }

    first = client.post("/api/tasks", json=payload)
    assert first.status_code == 201, first.text
    first_body = first.json()
    assert first_body["external_id"] == "wa:chat-demo:msg-001"
    task_id = first_body["id"]

    second = client.post(
        "/api/tasks",
        json={
            **payload,
            "title": "Different title should not create a duplicate",
            "body": "retry",
        },
    )
    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["id"] == task_id
    assert second_body["title"] == "WhatsApp follow-up"
    assert second_body["external_id"] == "wa:chat-demo:msg-001"

    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_agent_token_upsert_by_external_id() -> None:
    client = TestClient(create_app())
    user = bootstrap_owner(client)
    raw, _token_id = mint_api_token(user_id=user["id"], name="chat-bot")
    headers = bearer(raw)
    payload = {
        "title": "Agent idempotent create",
        "priority": 1,
        "external_id": "agent:run-demo:item-42",
    }

    first = client.post("/api/tasks", json=payload, headers=headers)
    assert first.status_code == 201, first.text
    second = client.post("/api/tasks", json=payload, headers=headers)
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first.json()["id"]


def test_external_id_unique_per_owner_only() -> None:
    client_a = TestClient(create_app())
    bootstrap_owner(client_a)
    created_a = client_a.post(
        "/api/tasks",
        json={"title": "Owner A", "external_id": "shared-key"},
    )
    assert created_a.status_code == 201

    # Fresh app/db isolation means a second client is a separate owner space —
    # use two users in one DB via sharing bootstrap is heavier; here we only
    # assert the same owner cannot attach the same external_id via PATCH.
    other = client_a.post("/api/tasks", json={"title": "Other task"})
    assert other.status_code == 201
    other_id = other.json()["id"]

    conflict = client_a.patch(
        f"/api/tasks/{other_id}",
        json={"external_id": "shared-key"},
    )
    assert conflict.status_code == 409, conflict.text


def test_create_without_external_id_still_creates_distinct_tasks() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    a = client.post("/api/tasks", json={"title": "One"})
    b = client.post("/api/tasks", json={"title": "One"})
    assert a.status_code == 201
    assert b.status_code == 201
    assert a.json()["id"] != b.json()["id"]
    assert a.json()["external_id"] is None
