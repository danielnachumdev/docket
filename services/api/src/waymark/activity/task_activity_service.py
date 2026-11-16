import json
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from waymark.activity.actor_label import actor_label
from waymark.api.task_comments.task_comment_service import TaskCommentService
from waymark.api.tasks.task_response_mapper import TaskResponseMapper
from waymark.auth.principal import Principal
from waymark.auth.task_access_service import TaskAccessService
from waymark.models import ApiToken, TaskEvent, User
from waymark.schemas.activity import ActivityActorOut, ActivityFeedOut, ActivityItemOut


_SKIP_EVENT_TYPES = frozenset({"commented"})


class TaskActivityService:
    """Builds a unified chronological activity feed for a task."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._access = TaskAccessService(db)
        self._mapper = TaskResponseMapper(db)
        self._comments = TaskCommentService(db)

    def list_feed(
        self,
        principal: Principal,
        task_ref: str,
        *,
        order: Literal["asc", "desc"] = "desc",
    ) -> ActivityFeedOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        comments = self._comments.list_comments(principal, task.public_id)
        events = self._db.scalars(
            select(TaskEvent)
            .where(TaskEvent.task_id == task.id)
            .options(selectinload(TaskEvent.actor_token))
            .order_by(TaskEvent.created_at.asc(), TaskEvent.id.asc())
        ).all()
        users = self._users_for(comments, events)
        tokens = self._tokens_for(events)

        items: list[ActivityItemOut] = []
        for comment in comments:
            user = users.get(comment.author_user_id)
            token = (
                tokens.get(comment.author_token_id)
                if comment.author_token_id is not None
                else None
            )
            items.append(
                ActivityItemOut(
                    id=f"comment:{comment.id}",
                    kind="comment",
                    created_at=comment.created_at,
                    actor=self._actor(
                        user_id=comment.author_user_id,
                        token_id=comment.author_token_id,
                        user=user,
                        token=token,
                        token_name=comment.author_token_name,
                    ),
                    comment=comment,
                )
            )

        for event in events:
            if not self._include_event(event):
                continue
            user = users.get(event.actor_user_id)
            token = (
                tokens.get(event.actor_token_id)
                if event.actor_token_id is not None
                else event.actor_token
            )
            items.append(
                ActivityItemOut(
                    id=f"event:{event.id}",
                    kind="event",
                    created_at=event.created_at,
                    actor=self._actor(
                        user_id=event.actor_user_id,
                        token_id=event.actor_token_id,
                        user=user,
                        token=token,
                        token_name=event.actor_token_name,
                    ),
                    event=self._mapper.event_out(event),
                )
            )

        items.sort(
            key=lambda item: (item.created_at, item.id),
            reverse=(order == "desc"),
        )
        return ActivityFeedOut(items=items, order=order)

    def _include_event(self, event: TaskEvent) -> bool:
        if event.type in _SKIP_EVENT_TYPES:
            return False
        if event.type == "artifact_added" and self._payload_comment_id(event) is not None:
            return False
        return True

    def _payload_comment_id(self, event: TaskEvent) -> int | None:
        if not event.payload_json:
            return None
        try:
            raw: Any = json.loads(event.payload_json)
        except json.JSONDecodeError:
            return None
        if not isinstance(raw, dict):
            return None
        value = raw.get("comment_id")
        return int(value) if isinstance(value, int) else None

    def _actor(
        self,
        *,
        user_id: int,
        token_id: int | None,
        user: User | None,
        token: ApiToken | None,
        token_name: str | None,
    ) -> ActivityActorOut:
        return ActivityActorOut(
            user_id=user_id,
            token_id=token_id,
            label=actor_label.label(
                user=user, user_id=user_id, token=token, token_name=token_name
            ),
            display_name=user.display_name if user else None,
            email=user.email if user else None,
            token_name=token_name or (token.name if token is not None else None),
        )

    def _users_for(
        self, comments: list, events: list[TaskEvent]
    ) -> dict[int, User]:
        ids = {c.author_user_id for c in comments} | {e.actor_user_id for e in events}
        if not ids:
            return {}
        rows = self._db.scalars(select(User).where(User.id.in_(ids))).all()
        return {row.id: row for row in rows}

    def _tokens_for(self, events: list[TaskEvent]) -> dict[int, ApiToken]:
        ids = {e.actor_token_id for e in events if e.actor_token_id is not None}
        if not ids:
            return {}
        rows = self._db.scalars(select(ApiToken).where(ApiToken.id.in_(ids))).all()
        return {row.id: row for row in rows}
