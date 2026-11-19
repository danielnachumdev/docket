import json
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from waymark.activity.actor_label import actor_label
from waymark.activity.task_activity_service import TaskActivityService
from waymark.api.task_external_shares.task_external_share_service import (
    TaskExternalShareService,
)
from waymark.api.tasks.task_gateway import TaskGateway
from waymark.api.tasks.task_response_mapper import TaskResponseMapper
from waymark.artifacts.artifact_gateway import ArtifactGateway
from waymark.artifacts.artifact_service import ArtifactContent, ArtifactService
from waymark.models import ApiToken, Artifact, CommentArtifact, Task, TaskComment, TaskLink, User
from waymark.notifications.mention_resolver import mention_resolver
from waymark.schemas.activity import ActivityFeedOut
from waymark.schemas.external_shares import ExternalShareDetailOut
from waymark.schemas.notifications import TaskCommentOut
from waymark.schemas.tasks import ArtifactOut, TaskOut


class PublicExternalShareService:
    """Guest read of a single task via an external share token."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._shares = TaskExternalShareService(db)
        self._tasks = TaskGateway(db)
        self._artifacts = ArtifactGateway(db)
        self._artifact_service = ArtifactService(db)
        self._mapper = TaskResponseMapper(db)
        self._activity = TaskActivityService(db)

    def get_detail(self, raw_token: str) -> ExternalShareDetailOut:
        _share, task = self._shares.require_active_share(raw_token)
        self._mapper.remember([task])
        children = self._tasks.list_children(task.id)
        events = self._tasks.list_events(task.id)
        artifacts = self._artifacts.list_for_task(task.id)
        self._artifact_service.ensure_byte_sizes(artifacts)
        links = self._list_links(task.id)
        comments = self._list_comments(task)
        return ExternalShareDetailOut(
            task=self._guest_task_out(task),
            events=[self._mapper.event_out(event) for event in events],
            artifacts=[
                self._mapper.artifact_out(
                    artifact, can_modify=False, task_title=task.title, task_number=task.owner_task_number
                )
                for artifact in artifacts
            ],
            children=[self._guest_task_out(child) for child in children],
            links=[self._mapper.link_out(link) for link in links],
            comments=comments,
        )

    def get_artifact_content(self, raw_token: str, artifact_id: int) -> ArtifactContent:
        _share, task = self._shares.require_active_share(raw_token)
        artifact = self._artifacts.get_for_task(task.id, artifact_id)
        if artifact is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Artifact not found")
        return self._artifact_service.read_content(artifact)

    def list_activity(
        self, raw_token: str, *, order: Literal["asc", "desc"] = "desc"
    ) -> ActivityFeedOut:
        _share, task = self._shares.require_active_share(raw_token)
        comments = self._list_comments(task)
        return self._activity.build_feed(
            task,
            comments=comments,
            order=order,
            viewer_user_id=None,
        )

    def _list_links(self, task_id: int) -> list[TaskLink]:
        stmt = (
            select(TaskLink)
            .where(or_(TaskLink.from_task_id == task_id, TaskLink.to_task_id == task_id))
            .order_by(TaskLink.id.asc())
        )
        return list(self._db.scalars(stmt).all())

    def _list_comments(self, task: Task) -> list[TaskCommentOut]:
        rows = list(
            self._db.scalars(
                select(TaskComment)
                .where(TaskComment.task_id == task.id)
                .options(selectinload(TaskComment.artifact_links))
                .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
            ).all()
        )
        authors = self._authors_by_id(rows)
        tokens = self._tokens_by_id(rows)
        attachments = self._attachments_by_comment(rows)
        return [
            self._comment_out(
                row, task, authors.get(row.author_user_id),
                tokens.get(row.author_token_id) if row.author_token_id else None,
                attachments=attachments.get(row.id, []),
            )
            for row in rows
        ]

    def _comment_out(self, comment, task, author, token, *, attachments):
        refs = self._guest_refs(self._load_refs(comment.refs_json), task.public_id)
        mentioned = mention_resolver.resolve_user_ids_from_refs(refs)
        label = actor_label.label(
            user=author, user_id=comment.author_user_id, token=token,
            token_name=token.name if token is not None else None,
        )
        return TaskCommentOut(
            id=comment.id, task_id=task.public_id, body=comment.body, refs=refs,
            mentioned_user_ids=mentioned, author_user_id=comment.author_user_id,
            author_token_id=comment.author_token_id,
            author_token_name=token.name if token is not None else None,
            author_display_name=(author.display_name if author else f"User #{comment.author_user_id}"),
            author_email=author.email if author else None, author_label=label,
            attachments=attachments, created_at=comment.created_at,
            updated_at=comment.updated_at, can_edit=False,
        )

    def _attachments_by_comment(self, rows):
        comment_ids = [row.id for row in rows]
        if not comment_ids:
            return {}
        links = self._db.scalars(select(CommentArtifact).where(CommentArtifact.comment_id.in_(comment_ids))).all()
        if not links:
            return {}
        artifact_ids = [link.artifact_id for link in links]
        artifacts = {row.id: row for row in self._db.scalars(select(Artifact).where(Artifact.id.in_(artifact_ids))).all()}
        by_comment = {cid: [] for cid in comment_ids}
        self._mapper.prefetch(a.task_id for a in artifacts.values())
        for link in links:
            artifact = artifacts.get(link.artifact_id)
            if artifact is None:
                continue
            by_comment.setdefault(link.comment_id, []).append(self._mapper.artifact_out(artifact, can_modify=False))
        return by_comment

    def _authors_by_id(self, rows):
        ids = {row.author_user_id for row in rows}
        if not ids:
            return {}
        return {user.id: user for user in self._db.scalars(select(User).where(User.id.in_(ids))).all()}

    def _tokens_by_id(self, rows):
        ids = {row.author_token_id for row in rows if row.author_token_id is not None}
        if not ids:
            return {}
        return {token.id: token for token in self._db.scalars(select(ApiToken).where(ApiToken.id.in_(ids))).all()}

    def _guest_task_out(self, task: Task) -> TaskOut:
        out = self._mapper.task_out(task, viewer_user_id=None)
        return out.model_copy(update={
            "unread": False, "shared": False, "claimed_by_token_id": None,
            "claimed_by_token_name": None, "claim_expires_at": None,
        })

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
    def _guest_refs(
        refs: list[dict[str, Any]], shared_task_public_id: str
    ) -> list[dict[str, Any]]:
        """Mark task refs outside this share as inaccessible (Slack-style private)."""
        out: list[dict[str, Any]] = []
        for ref in refs:
            if not isinstance(ref, dict) or ref.get("kind") != "task":
                out.append(ref)
                continue
            task_id = ref.get("task_id")
            accessible = task_id == shared_task_public_id
            out.append({**ref, "accessible": accessible})
        return out
