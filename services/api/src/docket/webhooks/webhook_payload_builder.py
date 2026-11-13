import json
from typing import Any

from docket.models import Task, TaskEvent


class WebhookPayloadBuilder:
    def build(self, *, task: Task, event: TaskEvent, data: dict[str, Any]) -> dict[str, Any]:
        created = event.created_at.isoformat() if event.created_at else None
        return {
            "event_id": event.id,
            "type": event.type,
            "created_at": created,
            "task": {
                "id": task.id,
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "owner_user_id": task.owner_user_id,
            },
            "actor": {
                "user_id": event.actor_user_id,
                "token_id": event.actor_token_id,
            },
            "data": data,
        }

    def dumps(self, payload: dict[str, Any]) -> bytes:
        return json.dumps(payload, separators=(",", ":"), default=str).encode()


webhook_payload_builder = WebhookPayloadBuilder()
