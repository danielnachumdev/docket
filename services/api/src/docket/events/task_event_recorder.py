import json
from typing import Any

from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.models import Task, TaskEvent, User

# Activity that should surface a shared unread indicator on the task list.
_UNREAD_EVENT_TYPES = frozenset(
    {
        "updated",
        "status_changed",
        "commented",
        "comment_updated",
        "comment_deleted",
        "artifact_added",
        "artifact_updated",
        "artifact_deleted",
        "linked",
        "unlinked",
        "archived",
        "unarchived",
        "shared",
        "unshared",
    }
)


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
        self._mark_unread_if_needed(db, task_id=task_id, event_type=event_type)
        return event

    def _mark_unread_if_needed(
        self, db: Session, *, task_id: int, event_type: str
    ) -> None:
        if event_type not in _UNREAD_EVENT_TYPES:
            return
        task = db.get(Task, task_id)
        if task is None or task.unread:
            return
        task.unread = True

    def _actor_ids(self, actor: Principal | User) -> tuple[int, int | None]:
        if isinstance(actor, Principal):
            return actor.user_id, actor.token_id
        return actor.id, None


task_event_recorder = TaskEventRecorder()
