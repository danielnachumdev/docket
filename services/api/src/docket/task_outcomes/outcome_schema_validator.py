"""Lean JSON Schema subset validator for completion outcomes."""

from typing import Any


class OutcomeSchemaValidator:
    """Validate instances against a practical JSON Schema object subset.

    Supported keywords: type, properties, required, additionalProperties,
    items, enum, minLength, maxLength, minimum, maximum.
    """

    def validate(self, schema: dict[str, Any], instance: Any) -> None:
        if not isinstance(schema, dict):
            raise TypeError("Outcome schema must be a JSON object")
        self._check(schema, instance, path="$")

    def validate_schema_document(self, schema: dict[str, Any]) -> None:
        """Ensure a configured schema is usable before persisting it."""
        if not isinstance(schema, dict):
            raise TypeError("Outcome schema must be a JSON object")
        schema_type = schema.get("type", "object")
        if schema_type != "object":
            raise ValueError("Outcome schema type must be 'object'")
        properties = schema.get("properties")
        if properties is not None and not isinstance(properties, dict):
            raise ValueError("Outcome schema properties must be an object")
        required = schema.get("required")
        if required is not None and (
            not isinstance(required, list)
            or not all(isinstance(name, str) for name in required)
        ):
            raise ValueError("Outcome schema required must be a list of strings")

    def _check(self, schema: dict[str, Any], instance: Any, path: str) -> None:
        if "enum" in schema and instance not in schema["enum"]:
            raise ValueError(f"{path}: value not in enum")
        expected = schema.get("type")
        if expected is not None:
            self._check_type(expected, instance, path)
        if isinstance(instance, dict):
            self._check_object(schema, instance, path)
        elif isinstance(instance, list):
            self._check_array(schema, instance, path)
        elif isinstance(instance, str):
            self._check_string(schema, instance, path)
        elif isinstance(instance, (int, float)) and not isinstance(instance, bool):
            self._check_number(schema, instance, path)

    def _check_type(self, expected: str | list[str], instance: Any, path: str) -> None:
        allowed = expected if isinstance(expected, list) else [expected]
        if not any(self._matches_type(name, instance) for name in allowed):
            raise ValueError(f"{path}: expected type {expected}")

    def _matches_type(self, name: str, instance: Any) -> bool:
        if name == "object":
            return isinstance(instance, dict)
        if name == "array":
            return isinstance(instance, list)
        if name == "string":
            return isinstance(instance, str)
        if name == "boolean":
            return isinstance(instance, bool)
        if name == "null":
            return instance is None
        if name == "integer":
            return isinstance(instance, int) and not isinstance(instance, bool)
        if name == "number":
            return isinstance(instance, (int, float)) and not isinstance(instance, bool)
        return False

    def _check_object(
        self, schema: dict[str, Any], instance: dict[str, Any], path: str
    ) -> None:
        properties = schema.get("properties") or {}
        required = schema.get("required") or []
        for name in required:
            if name not in instance:
                raise ValueError(f"{path}: missing required property '{name}'")
        additional = schema.get("additionalProperties", True)
        for key, value in instance.items():
            if key in properties:
                self._check(properties[key], value, f"{path}.{key}")
            elif additional is False:
                raise ValueError(f"{path}: unexpected property '{key}'")
            elif isinstance(additional, dict):
                self._check(additional, value, f"{path}.{key}")

    def _check_array(
        self, schema: dict[str, Any], instance: list[Any], path: str
    ) -> None:
        items = schema.get("items")
        if not isinstance(items, dict):
            return
        for index, value in enumerate(instance):
            self._check(items, value, f"{path}[{index}]")

    def _check_string(self, schema: dict[str, Any], instance: str, path: str) -> None:
        if "minLength" in schema and len(instance) < schema["minLength"]:
            raise ValueError(f"{path}: shorter than minLength")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            raise ValueError(f"{path}: longer than maxLength")

    def _check_number(self, schema: dict[str, Any], instance: float, path: str) -> None:
        if "minimum" in schema and instance < schema["minimum"]:
            raise ValueError(f"{path}: below minimum")
        if "maximum" in schema and instance > schema["maximum"]:
            raise ValueError(f"{path}: above maximum")
