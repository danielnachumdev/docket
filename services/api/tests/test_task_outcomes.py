from fastapi.testclient import TestClient

from docket.main import create_app
from docket.task_outcomes import OutcomeSchemaValidator
from tests.helpers import bootstrap_owner

DEMO_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "minLength": 1},
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
    },
    "required": ["summary", "score"],
    "additionalProperties": False,
}


def test_outcome_schema_validator_accepts_valid_instance() -> None:
    OutcomeSchemaValidator().validate(
        DEMO_SCHEMA, {"summary": "shipped demo-api", "score": 90}
    )


def test_outcome_schema_validator_rejects_missing_required() -> None:
    try:
        OutcomeSchemaValidator().validate(DEMO_SCHEMA, {"summary": "incomplete"})
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "score" in str(exc)


def test_done_requires_artifact_when_configured() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post(
        "/api/tasks",
        json={
            "title": "Needs artifact",
            "require_artifact_on_done": True,
        },
    )
    assert created.status_code == 201
    task_id = created.json()["id"]
    assert created.json()["require_artifact_on_done"] is True

    missing = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert missing.status_code == 400
    assert "Artifact required" in missing.json()["detail"]

    art = client.post(
        f"/api/tasks/{task_id}/artifacts",
        json={"kind": "text", "title": "Demo note", "content_text": "finished"},
    )
    assert art.status_code == 201

    ok = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "done"


def test_done_requires_outcome_matching_schema() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post(
        "/api/tasks",
        json={
            "title": "Needs structured outcome",
            "outcome_schema": DEMO_SCHEMA,
        },
    )
    assert created.status_code == 201
    task_id = created.json()["id"]
    assert created.json()["outcome_schema_json"] is not None

    missing = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert missing.status_code == 400
    assert "Outcome required" in missing.json()["detail"]

    invalid = client.post(
        f"/api/tasks/{task_id}/status",
        json={"status": "done", "outcome": {"summary": "only"}},
    )
    assert invalid.status_code == 400
    assert "Outcome does not match schema" in invalid.json()["detail"]

    ok = client.post(
        f"/api/tasks/{task_id}/status",
        json={
            "status": "done",
            "outcome": {"summary": "demo-api deployed", "score": 88},
        },
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["status"] == "done"
    assert body["outcome_json"] is not None
    assert "demo-api deployed" in body["outcome_json"]
    assert '"score":88' in body["outcome_json"]


def test_outcome_config_update_and_clear() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/tasks", json={"title": "Configure later"})
    assert created.status_code == 201
    task_id = created.json()["id"]

    patched = client.patch(
        f"/api/tasks/{task_id}",
        json={
            "require_artifact_on_done": True,
            "outcome_schema": DEMO_SCHEMA,
        },
    )
    assert patched.status_code == 200
    assert patched.json()["require_artifact_on_done"] is True
    assert patched.json()["outcome_schema_json"] is not None

    cleared = client.patch(
        f"/api/tasks/{task_id}",
        json={"clear_outcome_schema": True, "require_artifact_on_done": False},
    )
    assert cleared.status_code == 200
    assert cleared.json()["require_artifact_on_done"] is False
    assert cleared.json()["outcome_schema_json"] is None


def test_done_without_requirements_still_works() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    created = client.post("/api/tasks", json={"title": "Simple done"})
    task_id = created.json()["id"]
    ok = client.post(f"/api/tasks/{task_id}/status", json={"status": "done"})
    assert ok.status_code == 200
    assert ok.json()["outcome_json"] is None
