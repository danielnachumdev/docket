from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from docket.models import TaskEvent, User


def record_event(
    db: Session,
    *,
    task_id: int,
    event_type: str,
    actor: User,
    payload: dict[str, Any] | None = None,
) -> TaskEvent:
    event = TaskEvent(
        task_id=task_id,
        type=event_type,
        actor_user_id=actor.id,
        actor_token_id=None,
        payload_json=json.dumps(payload) if payload is not None else None,
    )
    db.add(event)
    return event
