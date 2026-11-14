import json
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.api.tasks.task_response_mapper import TaskResponseMapper
from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService
from docket.events import task_event_recorder
from docket.models import Task, TaskComment, TaskEvent, User
from docket.notifications import notification_dispatcher
from docket.notifications.comment_ref_resolver import CommentRefResolver
from docket.notifications.mention_resolver import mention_resolver
from docket.schemas.notifications import (
    MentionableUserOut,
    TaskCommentIn,
    TaskCommentOut,
)
from docket.webhooks import WebhookDeliveryService


class TaskCommentService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._access = TaskAccessService(db)
        self._refs = CommentRefResolver(db)
        self._mapper = TaskResponseMapper(db)

    def list_comments(
        self, principal: Principal, task_ref: str
    ) -> list[TaskCommentOut]:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        rows = self._db.scalars(
            select(TaskComment)
            .where(TaskComment.task_id == task.id)
            .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
        ).all()
        authors = self._authors_by_id(rows)
        return [
            self._comment_out(row, task, authors.get(row.author_user_id), principal)
            for row in rows
        ]

    def list_mentionables(
        self, principal: Principal, task_ref: str
    ) -> list[MentionableUserOut]:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        people = self._refs.mentionable_users(task)
        nicknames = self._refs.nicknames_for_viewer(
            principal.user_id, {user.id for user in people}
        )
        return [
            MentionableUserOut(
                user_id=user.id,
                email=user.email,
                display_name=user.display_name,
                handle=self._mention_handle(user, nicknames.get(user.id)),
                nickname=nicknames.get(user.id),
            )
            for user in people
        ]

    def create(
        self, principal: Principal, task_ref: str, body: TaskCommentIn
    ) -> TaskCommentOut:
        task = self._access.get_task(principal, task_ref, "tasks:comment")
        text = body.body.strip()
        if not text:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Comment cannot be empty")
        refs = self._refs.resolve(principal=principal, task=task, text=text)
        mentioned = [
            user_id
            for user_id in mention_resolver.resolve_user_ids_from_refs(refs)
            if user_id != principal.user_id
        ]
        comment = TaskComment(
            task_id=task.id,
            author_user_id=principal.user_id,
            author_token_id=principal.token_id,
            body=text,
            refs_json=json.dumps(refs),
        )
        self._db.add(comment)
        self._db.flush()
        payload = {
            "comment_id": comment.id,
            "body": text,
            "refs": refs,
            "mentioned_user_ids": mentioned,
        }
        event = task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="commented",
            actor=principal,
            payload=payload,
        )
        self._notify_create(task, principal, text, mentioned, payload)
        self._commit_event(task, event, payload)
        author = self._db.get(User, principal.user_id)
        return self._comment_out(comment, task, author, principal, event_id=event.id)

    def update(
        self,
        principal: Principal,
        task_ref: str,
        comment_id: int,
        body: TaskCommentIn,
    ) -> TaskCommentOut:
        task, comment = self._author_comment(principal, task_ref, comment_id)
        text = body.body.strip()
        if not text:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Comment cannot be empty")
        refs = self._refs.resolve(principal=principal, task=task, text=text)
        mentioned = [
            user_id
            for user_id in mention_resolver.resolve_user_ids_from_refs(refs)
            if user_id != principal.user_id
        ]
        comment.body = text
        comment.refs_json = json.dumps(refs)
        comment.updated_at = datetime.now(UTC)
        payload = {
            "comment_id": comment.id,
            "body": text,
            "refs": refs,
            "mentioned_user_ids": mentioned,
        }
        event = task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="comment_updated",
            actor=principal,
            payload=payload,
        )
        self._notify_mentions(task, principal, text, mentioned)
        self._db.commit()
        self._db.refresh(comment)
        author = self._db.get(User, comment.author_user_id)
        return self._comment_out(comment, task, author, principal, event_id=event.id)

    def delete(
        self, principal: Principal, task_ref: str, comment_id: int
    ) -> None:
        task, comment = self._author_comment(principal, task_ref, comment_id)
        payload = {"comment_id": comment.id, "body": comment.body}
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="comment_deleted",
            actor=principal,
            payload=payload,
        )
        self._db.delete(comment)
        self._db.commit()

    def _author_comment(
        self, principal: Principal, task_ref: str, comment_id: int
    ) -> tuple[Task, TaskComment]:
        task = self._access.get_task(principal, task_ref, "tasks:comment")
        comment = self._db.get(TaskComment, comment_id)
        if comment is None or comment.task_id != task.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
        if comment.author_user_id != principal.user_id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Only the author can modify this comment"
            )
        return task, comment

    def _notify_create(
        self,
        task: Task,
        principal: Principal,
        text: str,
        mentioned: list[int],
        payload: dict[str, Any],
    ) -> None:
        self._notify_mentions(task, principal, text, mentioned)
        notification_dispatcher(self._db).notify_watchers(
            task=task,
            actor=principal,
            kind="commented",
            title=f"Comment on “{task.title}”",
            body=text,
            payload={"body": text, "comment_id": payload.get("comment_id")},
            exclude_user_ids=set(mentioned),
        )

    def _notify_mentions(
        self,
        task: Task,
        principal: Principal,
        text: str,
        mentioned: list[int],
    ) -> None:
        if not mentioned:
            return
        notification_dispatcher(self._db).notify_users(
            user_ids=mentioned,
            task=task,
            actor=principal,
            kind="mentioned",
            title=f"Mentioned on “{task.title}”",
            body=text,
            payload={"body": text},
        )

    def _commit_event(
        self, task: Task, event: TaskEvent, payload: dict[str, Any]
    ) -> None:
        self._db.commit()
        self._db.refresh(task)
        self._db.refresh(event)
        WebhookDeliveryService(self._db).deliver_for_event(
            task=task, event=event, data=payload
        )

    def _authors_by_id(self, rows: list[TaskComment]) -> dict[int, User]:
        ids = {row.author_user_id for row in rows}
        if not ids:
            return {}
        users = self._db.scalars(select(User).where(User.id.in_(ids))).all()
        return {user.id: user for user in users}

    def _comment_out(
        self,
        comment: TaskComment,
        task: Task,
        author: User | None,
        principal: Principal,
        *,
        event_id: int | None = None,
    ) -> TaskCommentOut:
        refs = self._load_refs(comment.refs_json)
        mentioned = mention_resolver.resolve_user_ids_from_refs(refs)
        self._mapper.remember([task])
        return TaskCommentOut(
            id=comment.id,
            event_id=event_id,
            task_id=task.public_id,
            body=comment.body,
            refs=refs,
            mentioned_user_ids=mentioned,
            author_user_id=comment.author_user_id,
            author_display_name=author.display_name if author else f"User #{comment.author_user_id}",
            author_email=author.email if author else None,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            can_edit=comment.author_user_id == principal.user_id,
        )

    @staticmethod
    def _load_refs(refs_json: str | None) -> list[dict[str, Any]]:
        if not refs_json:
            return []
        try:
            raw = json.loads(refs_json)
        except json.JSONDecodeError:
            return []
        return raw if isinstance(raw, list) else []

    @staticmethod
    def _mention_handle(user: User, nickname: str | None) -> str:
        if nickname:
            return nickname
        if user.email:
            return user.email
        cleaned = "".join(
            ch if ch.isalnum() or ch in "._-" else "" for ch in user.display_name
        )
        return cleaned or user.display_name
