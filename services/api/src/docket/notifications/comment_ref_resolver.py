from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService
from docket.models import Artifact, ContactNickname, Membership, Task, TaskComment, User
from docket.notifications.comment_ref_parser import CommentRefParser, RawCommentToken


class CommentRefResolver:
    """Resolve and validate comment shorthand refs for a task."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._parser = CommentRefParser()
        self._access = TaskAccessService(db)

    def resolve(
        self, *, principal: Principal, task: Task, text: str
    ) -> list[dict[str, Any]]:
        tokens = self._parser.parse(text)
        if not tokens:
            return []
        people = self._people_on_task(task)
        nicknames = self._nicknames_for_viewer(
            principal.user_id, {user.id for user in people}
        )
        return [
            self._resolve_token(principal, task, people, nicknames, token)
            for token in tokens
        ]

    def mentionable_users(self, task: Task) -> list[User]:
        return self._people_on_task(task)

    def nicknames_for_viewer(
        self, viewer_user_id: int, user_ids: set[int]
    ) -> dict[int, str]:
        return self._nicknames_for_viewer(viewer_user_id, user_ids)

    def _resolve_token(
        self,
        principal: Principal,
        task: Task,
        people: list[User],
        nicknames: dict[int, str],
        token: RawCommentToken,
    ) -> dict[str, Any]:
        if token.kind == "user":
            return self._resolve_user(people, nicknames, token)
        if token.kind == "task":
            return self._resolve_task(principal, token)
        if token.kind == "artifact":
            return self._resolve_artifact(task, token)
        return self._resolve_comment(task, token)

    def _resolve_user(
        self,
        people: list[User],
        nicknames: dict[int, str],
        token: RawCommentToken,
    ) -> dict[str, Any]:
        user = self._match_person(people, nicknames, token.value)
        if user is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unknown or inaccessible mention {token.raw}",
            )
        return {
            "kind": "user",
            "raw": token.raw,
            "start": token.start,
            "end": token.end,
            "user_id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "nickname": nicknames.get(user.id),
            "label": user.display_name,
        }

    def _resolve_task(
        self, principal: Principal, token: RawCommentToken
    ) -> dict[str, Any]:
        target = self._lookup_task_ref(principal, token.value)
        if target is None or not self._access.may_access(
            principal, target, "tasks:read"
        ):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unknown or inaccessible task ref {token.raw}",
            )
        return {
            "kind": "task",
            "raw": token.raw,
            "start": token.start,
            "end": token.end,
            "task_id": target.public_id,
            "number": target.owner_task_number,
            "title": target.title,
            "label": f"#{target.owner_task_number}",
        }

    def _resolve_artifact(self, task: Task, token: RawCommentToken) -> dict[str, Any]:
        artifact_id = int(token.value)
        artifact = self._db.get(Artifact, artifact_id)
        if artifact is None or artifact.task_id != task.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unknown artifact ref {token.raw} on this task",
            )
        return {
            "kind": "artifact",
            "raw": token.raw,
            "start": token.start,
            "end": token.end,
            "artifact_id": artifact.id,
            "title": artifact.title,
            "label": artifact.title,
        }

    def _resolve_comment(self, task: Task, token: RawCommentToken) -> dict[str, Any]:
        comment_id = int(token.value)
        comment = self._db.get(TaskComment, comment_id)
        if comment is None or comment.task_id != task.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unknown comment ref {token.raw} on this task",
            )
        preview = comment.body.strip().splitlines()[0][:80] if comment.body else ""
        return {
            "kind": "comment",
            "raw": token.raw,
            "start": token.start,
            "end": token.end,
            "comment_id": comment.id,
            "label": preview or f"~{comment.id}",
        }

    def _lookup_task_ref(self, principal: Principal, value: str) -> Task | None:
        if value.isdigit():
            return self._db.scalar(
                select(Task).where(
                    Task.owner_user_id == principal.user_id,
                    Task.owner_task_number == int(value),
                )
            )
        return self._db.scalar(select(Task).where(Task.public_id == value))

    def _people_on_task(self, task: Task) -> list[User]:
        owner = self._db.get(User, task.owner_user_id)
        shared_ids = self._db.scalars(
            select(Membership.user_id).where(
                Membership.scope_type == "task",
                Membership.scope_task_id == task.id,
            )
        ).all()
        users = list(
            self._db.scalars(select(User).where(User.id.in_(shared_ids))).all()
        )
        if owner is not None:
            users = [owner, *[u for u in users if u.id != owner.id]]
        return users

    def _nicknames_for_viewer(
        self, viewer_user_id: int, user_ids: set[int]
    ) -> dict[int, str]:
        if not user_ids:
            return {}
        rows = self._db.scalars(
            select(ContactNickname).where(
                ContactNickname.viewer_user_id == viewer_user_id,
                ContactNickname.contact_user_id.in_(user_ids),
            )
        ).all()
        return {row.contact_user_id: row.nickname for row in rows}

    def _match_person(
        self,
        people: list[User],
        nicknames: dict[int, str],
        value: str,
    ) -> User | None:
        lowered = value.lower()
        nick_hits = [
            user
            for user in people
            if nicknames.get(user.id, "").lower() == lowered
        ]
        if len(nick_hits) == 1:
            return nick_hits[0]
        email_hits = [
            u for u in people if u.email is not None and u.email.lower() == lowered
        ]
        if email_hits:
            return email_hits[0]
        name_hits = [u for u in people if u.display_name.lower() == lowered]
        if len(name_hits) == 1:
            return name_hits[0]
        handle_hits = [
            u
            for u in people
            if self._handle(u.display_name) == lowered
            or (u.email is not None and u.email.split("@", 1)[0].lower() == lowered)
        ]
        if len(handle_hits) == 1:
            return handle_hits[0]
        return None

    @staticmethod
    def _handle(display_name: str) -> str:
        cleaned = "".join(
            ch if ch.isalnum() or ch in "._-" else "" for ch in display_name
        )
        return cleaned.lower()
