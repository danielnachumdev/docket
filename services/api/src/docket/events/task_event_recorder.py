import json
from typing import Any

from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.models import TaskEvent, User


class TaskEventRecorder:
    def record(
        self,
        db: Session,
        *,
        task_id: int,
        event_type: str,
        actor: Principal | User,
        payload: dict[str, Any] | None = None,
    ) -> TaskEvent:
        actor_user_id, actor_token_id = self._actor_ids(actor)
        event = TaskEvent(
            task_id=task_id,
            type=event_type,
            actor_user_id=actor_user_id,
            actor_token_id=actor_token_id,
            payload_json=json.dumps(payload) if payload is not None else None,
        )
        db.add(event)
        return event

    def _actor_ids(self, actor: Principal | User) -> tuple[int, int | None]:
        if isinstance(actor, Principal):
            return actor.user_id, actor.token_id
        return actor.id, None


task_event_recorder = TaskEventRecorder()
