import json
from typing import Any

from fastapi import HTTPException, status

from docket.task_outcomes.outcome_schema_validator import OutcomeSchemaValidator


class OutcomeSchemaCodec:
    """Encode/decode persisted outcome schema JSON with validation."""

    def __init__(self, validator: OutcomeSchemaValidator | None = None) -> None:
        self._validator = validator or OutcomeSchemaValidator()

    def encode(self, schema: dict[str, Any]) -> str:
        try:
            self._validator.validate_schema_document(schema)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        return json.dumps(schema, separators=(",", ":"), sort_keys=True)
