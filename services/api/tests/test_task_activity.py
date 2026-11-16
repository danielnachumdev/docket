"""Unified activity feed + comment artifact attachments."""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from tests.helpers import bootstrap_owner
from waymark.main import create_app


def test_description_field_and_activity_feed() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post(
        "/api/tasks",
        json={"title": "Activity demo", "description": "Primary notes"},
    )
    assert created.status_code == 201
    task = created.json()
    assert task["description"] == "Primary notes"
    assert "body" not in task

    patched = client.patch(
        f"/api/tasks/{task['id']}",
        json={"description": "Updated notes"},
    )
    assert patched.status_code == 200
    assert patched.json()["description"] == "Updated notes"

    comment = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"body": "Hello timeline"},
    )
    assert comment.status_code == 201
    assert comment.json()["author_label"]
    assert comment.json()["attachments"] == []

    feed = client.get(
        f"/api/tasks/{task['id']}/activity",
        params={"order": "desc"},
    )
    assert feed.status_code == 200
    body = feed.json()
    assert body["order"] == "desc"
    kinds = [item["kind"] for item in body["items"]]
    assert "comment" in kinds
    assert "event" in kinds
    assert all(item["actor"]["label"] for item in body["items"])
    event_types = [
        item["event"]["type"]
        for item in body["items"]
        if item["kind"] == "event" and item["event"]
    ]
    assert "commented" not in event_types

    asc = client.get(
        f"/api/tasks/{task['id']}/activity",
        params={"order": "asc"},
    )
    assert asc.status_code == 200
    assert asc.json()["order"] == "asc"
    assert [i["id"] for i in asc.json()["items"]] == list(
        reversed([i["id"] for i in body["items"]])
    )


def test_comment_artifact_attachment_inline() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    task = client.post("/api/tasks", json={"title": "Attach demo"}).json()
    payload = base64.b64encode(b"hello-file").decode("ascii")
    created = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={
            "body": "See file",
            "attachments": [
                {
                    "kind": "file",
                    "title": "note.txt",
                    "content_base64": payload,
                    "content_type": "text/plain",
                }
            ],
        },
    )
    assert created.status_code == 201
    comment = created.json()
    assert len(comment["attachments"]) == 1
    assert comment["attachments"][0]["title"] == "note.txt"

    feed = client.get(f"/api/tasks/{task['id']}/activity").json()
    comment_rows = [i for i in feed["items"] if i["kind"] == "comment"]
    assert len(comment_rows) == 1
    assert len(comment_rows[0]["comment"]["attachments"]) == 1
    event_types = [
        i["event"]["type"] for i in feed["items"] if i["kind"] == "event" and i["event"]
    ]
    assert "artifact_added" not in event_types

    multi = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={
            "body": "",
            "attachments": [
                {
                    "kind": "file",
                    "title": "a.txt",
                    "content_base64": payload,
                    "content_type": "text/plain",
                },
                {
                    "kind": "file",
                    "title": "b.txt",
                    "content_base64": payload,
                    "content_type": "text/plain",
                },
            ],
        },
    )
    assert multi.status_code == 201
    assert len(multi.json()["attachments"]) == 2
    assert multi.json()["body"] == ""

    empty = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"body": "", "attachments": []},
    )
    assert empty.status_code == 422

    standalone = client.post(
        f"/api/tasks/{task['id']}/artifacts",
        json={"kind": "text", "title": "Loose note", "content_text": "hi"},
    )
    assert standalone.status_code == 201
    feed2 = client.get(f"/api/tasks/{task['id']}/activity").json()
    event_types2 = [
        i["event"]["type"] for i in feed2["items"] if i["kind"] == "event" and i["event"]
    ]
    assert "artifact_added" in event_types2
