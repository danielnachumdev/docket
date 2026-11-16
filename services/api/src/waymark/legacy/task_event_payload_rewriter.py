import json
from typing import Any


class TaskEventPayloadRewriter:
    """Rewrites legacy task field keys inside ``task_events.payload_json``."""

    def rename_key(self, payload_json: str, *, from_key: str, to_key: str) -> str | None:
        try:
            raw: Any = json.loads(payload_json)
        except (json.JSONDecodeError, TypeError):
            return None
        if not isinstance(raw, dict) or from_key not in raw:
            return None
        if to_key in raw:
            raw.pop(from_key, None)
        else:
            raw[to_key] = raw.pop(from_key)
        return json.dumps(raw, separators=(",", ":"))


task_event_payload_rewriter = TaskEventPayloadRewriter()
