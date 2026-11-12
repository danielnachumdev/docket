from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.models import TaskEvent, User


def record_event(
    db: Session,
    *,
    task_id: int,
    event_type: str,
    actor: Principal | User,
    payload: dict[str, Any] | None = None,
) -> TaskEvent:
    if isinstance(actor, Principal):
        actor_user_id = actor.user_id
        actor_token_id = actor.token_id
    else:
        actor_user_id = actor.id
        actor_token_id = None
    event = TaskEvent(
        task_id=task_id,
        type=event_type,
        actor_user_id=actor_user_id,
        actor_token_id=actor_token_id,
        payload_json=json.dumps(payload) if payload is not None else None,
    )
    db.add(event)
    return event
