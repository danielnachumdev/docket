import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.models import Notification, Task, TaskWatch, User


class NotificationDispatcher:
    """Fan out in-app notifications to watchers and mentioned users."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def notify_watchers(
        self,
        *,
        task: Task,
        actor: Principal | User,
        kind: str,
        title: str,
        body: str | None = None,
        payload: dict[str, Any] | None = None,
        exclude_user_ids: set[int] | None = None,
    ) -> list[Notification]:
        actor_user_id = self._actor_user_id(actor)
        skip = set(exclude_user_ids or ())
        skip.add(actor_user_id)
        recipient_ids = [
            wid
            for wid in self._watcher_ids(task.id)
            if wid not in skip
        ]
        return self._create_many(
            recipient_ids,
            task_id=task.id,
            kind=kind,
            title=title,
            body=body,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    def notify_users(
        self,
        *,
        user_ids: list[int],
        task: Task,
        actor: Principal | User,
        kind: str,
        title: str,
        body: str | None = None,
        payload: dict[str, Any] | None = None,
        exclude_user_ids: set[int] | None = None,
    ) -> list[Notification]:
        actor_user_id = self._actor_user_id(actor)
        skip = set(exclude_user_ids or ())
        skip.add(actor_user_id)
        recipient_ids = [uid for uid in dict.fromkeys(user_ids) if uid not in skip]
        return self._create_many(
            recipient_ids,
            task_id=task.id,
            kind=kind,
            title=title,
            body=body,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    def notify_user(
        self,
        *,
        user_id: int,
        actor_user_id: int,
        kind: str,
        title: str,
        body: str | None = None,
        payload: dict[str, Any] | None = None,
        task_id: int | None = None,
    ) -> Notification | None:
        if user_id == actor_user_id:
            return None
        rows = self._create_many(
            [user_id],
            task_id=task_id,
            kind=kind,
            title=title,
            body=body,
            payload=payload,
            actor_user_id=actor_user_id,
        )
        return rows[0] if rows else None

    def _watcher_ids(self, task_id: int) -> list[int]:
        return list(
            self._db.scalars(
                select(TaskWatch.user_id).where(TaskWatch.task_id == task_id)
            ).all()
        )

    def _create_many(
        self,
        recipient_ids: list[int],
        *,
        task_id: int | None,
        kind: str,
        title: str,
        body: str | None,
        payload: dict[str, Any] | None,
        actor_user_id: int,
    ) -> list[Notification]:
        rows: list[Notification] = []
        payload_json = json.dumps(payload) if payload is not None else None
        for user_id in recipient_ids:
            row = Notification(
                user_id=user_id,
                task_id=task_id,
                kind=kind,
                title=title,
                body=body,
                payload_json=payload_json,
                actor_user_id=actor_user_id,
            )
            self._db.add(row)
            rows.append(row)
        return rows

    def _actor_user_id(self, actor: Principal | User) -> int:
        if isinstance(actor, Principal):
            return actor.user_id
        return actor.id


def notification_dispatcher(db: Session) -> NotificationDispatcher:
    return NotificationDispatcher(db)
