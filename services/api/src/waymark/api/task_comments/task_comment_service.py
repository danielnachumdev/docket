import json
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from waymark.activity.actor_label import actor_label
from waymark.api.tasks.task_response_mapper import TaskResponseMapper
from waymark.artifacts.artifact_service import ArtifactService
from waymark.auth.principal import Principal
from waymark.auth.task_access_service import TaskAccessService
from waymark.events import task_event_recorder
from waymark.models import ApiToken, Artifact, CommentArtifact, Task, TaskComment, TaskEvent, User
from waymark.notifications import notification_dispatcher
from waymark.notifications.comment_ref_resolver import CommentRefResolver
from waymark.notifications.mention_resolver import mention_resolver
from waymark.schemas import ArtifactCreate, ArtifactOut
from waymark.schemas.notifications import (
    MentionableUserOut,
    TaskCommentIn,
    TaskCommentOut,
)
from waymark.webhooks import WebhookDeliveryService


class TaskCommentService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._access = TaskAccessService(db)
        self._refs = CommentRefResolver(db)
        self._mapper = TaskResponseMapper(db)
        self._artifacts = ArtifactService(db)

    def list_comments(
        self, principal: Principal, task_ref: str
    ) -> list[TaskCommentOut]:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        rows = self._db.scalars(
            select(TaskComment)
            .where(TaskComment.task_id == task.id)
            .options(selectinload(TaskComment.artifact_links))
            .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
        ).all()
        authors = self._authors_by_id(rows)
        tokens = self._tokens_by_id(rows)
        attachments = self._attachments_by_comment(rows)
        return [
            self._comment_out(
                row,
                task,
                authors.get(row.author_user_id),
                tokens.get(row.author_token_id) if row.author_token_id else None,
                principal,
                attachments=attachments.get(row.id, []),
            )
            for row in rows
        ]

    def list_mentionables(
        self, principal: Principal, task_ref: str
    ) -> list[MentionableUserOut]:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        people = self._refs.mentionable_users(principal, task)
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
        attachments_in = body.attachments or []
        if not text and not attachments_in:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Comment needs text and/or attachments"
            )
        if attachments_in:
            self._access.get_task(principal, task_ref, "artifacts:write")
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
        attached = self._create_attachments(
            principal, task.public_id, comment.id, attachments_in
        )
        self._notify_create(task, principal, text, mentioned, payload)
        self._commit_event(task, event, payload)
        author = self._db.get(User, principal.user_id)
        token = (
            self._db.get(ApiToken, principal.token_id)
            if principal.token_id is not None
            else None
        )
        return self._comment_out(
            comment,
            task,
            author,
            token,
            principal,
            event_id=event.id,
            attachments=attached,
        )

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
        token = (
            self._db.get(ApiToken, comment.author_token_id)
            if comment.author_token_id is not None
            else None
        )
        attachments = self._attachments_for_comment(comment.id)
        return self._comment_out(
            comment,
            task,
            author,
            token,
            principal,
            event_id=event.id,
            attachments=attachments,
        )

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

    def attach_artifact(
        self,
        principal: Principal,
        task_ref: str,
        comment_id: int,
        body: ArtifactCreate,
    ) -> ArtifactOut:
        task, comment = self._author_comment(principal, task_ref, comment_id)
        self._access.get_task(principal, task_ref, "artifacts:write")
        artifact = self._artifacts.create(
            principal, task.public_id, body, comment_id=comment.id
        )
        return self._artifact_out(artifact, principal, task)

    def _create_attachments(
        self,
        principal: Principal,
        task_ref: str,
        comment_id: int,
        attachments: list[ArtifactCreate],
    ) -> list[ArtifactOut]:
        if not attachments:
            return []
        task = self._access.get_task(principal, task_ref, "artifacts:write")
        outs: list[ArtifactOut] = []
        for item in attachments:
            artifact = self._artifacts.create(
                principal,
                task_ref,
                item,
                comment_id=comment_id,
                commit=False,
            )
            outs.append(self._artifact_out(artifact, principal, task))
        return outs

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

    def _tokens_by_id(self, rows: list[TaskComment]) -> dict[int, ApiToken]:
        ids = {row.author_token_id for row in rows if row.author_token_id is not None}
        if not ids:
            return {}
        tokens = self._db.scalars(select(ApiToken).where(ApiToken.id.in_(ids))).all()
        return {token.id: token for token in tokens}

    def _attachments_by_comment(
        self, rows: list[TaskComment]
    ) -> dict[int, list[ArtifactOut]]:
        comment_ids = [row.id for row in rows]
        if not comment_ids:
            return {}
        links = self._db.scalars(
            select(CommentArtifact).where(CommentArtifact.comment_id.in_(comment_ids))
        ).all()
        if not links:
            return {}
        artifact_ids = [link.artifact_id for link in links]
        artifacts = {
            row.id: row
            for row in self._db.scalars(
                select(Artifact).where(Artifact.id.in_(artifact_ids))
            ).all()
        }
        by_comment: dict[int, list[ArtifactOut]] = {cid: [] for cid in comment_ids}
        self._mapper.prefetch(a.task_id for a in artifacts.values())
        for link in links:
            artifact = artifacts.get(link.artifact_id)
            if artifact is None:
                continue
            by_comment.setdefault(link.comment_id, []).append(
                self._mapper.artifact_out(artifact)
            )
        return by_comment

    def _attachments_for_comment(self, comment_id: int) -> list[ArtifactOut]:
        links = self._db.scalars(
            select(CommentArtifact).where(CommentArtifact.comment_id == comment_id)
        ).all()
        if not links:
            return []
        artifact_ids = [link.artifact_id for link in links]
        artifacts = self._db.scalars(
            select(Artifact).where(Artifact.id.in_(artifact_ids))
        ).all()
        self._mapper.prefetch(a.task_id for a in artifacts)
        return [self._mapper.artifact_out(artifact) for artifact in artifacts]

    def _artifact_out(
        self, artifact: Artifact, principal: Principal, task: Task
    ) -> ArtifactOut:
        self._mapper.remember([task])
        return self._mapper.artifact_out(
            artifact,
            can_modify=self._artifacts.can_modify(principal, artifact, task),
            task_title=task.title,
            task_number=task.owner_task_number,
        )

    def _comment_out(
        self,
        comment: TaskComment,
        task: Task,
        author: User | None,
        token: ApiToken | None,
        principal: Principal,
        *,
        event_id: int | None = None,
        attachments: list[ArtifactOut] | None = None,
    ) -> TaskCommentOut:
        refs = self._refs.project_for_viewer(
            principal, self._load_refs(comment.refs_json)
        )
        mentioned = mention_resolver.resolve_user_ids_from_refs(refs)
        self._mapper.remember([task])
        label = actor_label.label(
            user=author,
            user_id=comment.author_user_id,
            token=token,
            token_name=token.name if token is not None else None,
        )
        return TaskCommentOut(
            id=comment.id,
            event_id=event_id,
            task_id=task.public_id,
            body=comment.body,
            refs=refs,
            mentioned_user_ids=mentioned,
            author_user_id=comment.author_user_id,
            author_token_id=comment.author_token_id,
            author_token_name=token.name if token is not None else None,
            author_display_name=(
                author.display_name if author else f"User #{comment.author_user_id}"
            ),
            author_email=author.email if author else None,
            author_label=label,
            attachments=attachments or [],
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
