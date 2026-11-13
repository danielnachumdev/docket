import json
from typing import Any

from fastapi import HTTPException, status

from docket.models import Task
from docket.task_outcomes.outcome_schema_validator import OutcomeSchemaValidator


class DoneOutcomeEnforcer:
    """Enforce optional artifact + structured outcome requirements on status→done."""

    def __init__(self, validator: OutcomeSchemaValidator | None = None) -> None:
        self._validator = validator or OutcomeSchemaValidator()

    def enforce(
        self,
        task: Task,
        *,
        outcome: dict[str, Any] | None,
        artifact_count: int,
    ) -> str | None:
        self._enforce_artifact(task, artifact_count)
        return self._enforce_outcome(task, outcome)

    def _enforce_artifact(self, task: Task, artifact_count: int) -> None:
        if not task.require_artifact_on_done:
            return
        if artifact_count < 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Artifact required to mark this task done",
            )

    def _enforce_outcome(
        self, task: Task, outcome: dict[str, Any] | None
    ) -> str | None:
        schema_raw = task.outcome_schema_json
        if not schema_raw:
            if outcome is None:
                return None
            return self._dump(outcome)
        if outcome is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Outcome required to mark this task done",
            )
        try:
            schema = json.loads(schema_raw)
            self._validator.validate(schema, outcome)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Outcome does not match schema: {exc}",
            ) from exc
        return self._dump(outcome)

    def _dump(self, outcome: dict[str, Any]) -> str:
        return json.dumps(outcome, separators=(",", ":"), sort_keys=True)
