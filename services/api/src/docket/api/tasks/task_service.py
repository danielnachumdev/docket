import json
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from docket.api.task_watches.task_watch_service import TaskWatchService
from docket.api.tasks.owner_task_number_allocator import OwnerTaskNumberAllocator
from docket.api.tasks.sibling_rank_allocator import SiblingRankAllocator
from docket.api.tasks.task_gateway import TaskGateway
from docket.api.tasks.task_response_mapper import TaskResponseMapper
from docket.artifacts import ArtifactGateway, ArtifactService
from docket.auth.principal import Principal
from docket.auth.task_access_service import TaskAccessService
from docket.events import task_event_recorder
from docket.models import Membership, Task, TaskEvent
from docket.models.task_public_id import new_task_public_id
from docket.notifications import mention_resolver, notification_dispatcher
from docket.schemas import (
    TaskBulkUpdate,
    TaskClaimIn,
    TaskCommentIn,
    TaskCommentOut,
    TaskCreate,
    TaskDetailOut,
    TaskOut,
    TaskReorder,
    TaskStatusIn,
    TaskUpdate,
)
from docket.task_claims import TaskClaimService
from docket.task_links import TaskLinkService
from docket.task_outcomes import DoneOutcomeEnforcer, OutcomeSchemaCodec
from docket.webhooks import WebhookDeliveryService


class TaskService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._gateway = TaskGateway(db)
        self._artifacts = ArtifactGateway(db)
        self._claims = TaskClaimService(db)
        self._access = TaskAccessService(db)
        self._outcomes = DoneOutcomeEnforcer()
        self._schema_codec = OutcomeSchemaCodec()
        self._numbers = OwnerTaskNumberAllocator(db)
        self._ranks = SiblingRankAllocator()
        self._mapper = TaskResponseMapper(db)

    def list_tasks(
        self,
        principal: Principal,
        *,
        archived: bool,
        parent_task_id: str | None,
        roots_only: bool,
    ) -> list[TaskOut]:
        parent_internal = self._resolve_parent_filter(principal, parent_task_id)
        tasks = self._gateway.list_visible(
            self._access.accessible_task_ids_select(principal.user_id),
            archived=archived,
            parent_task_id=parent_internal,
            roots_only=roots_only,
        )
        return self._mapper.tasks_out(tasks)

    def list_inbox(
        self,
        principal: Principal,
        *,
        priority: int | None,
        due_before: datetime | None,
        limit: int,
    ) -> list[TaskOut]:
        tasks = self._gateway.list_claimable(
            self._access.accessible_task_ids_select(principal.user_id),
            now=self._utcnow(),
            priority=priority,
            due_before=due_before,
            limit=limit,
        )
        return self._mapper.tasks_out(tasks)

    def create(self, principal: Principal, body: TaskCreate) -> tuple[TaskOut, bool]:
        """Create a task, or return the existing one when external_id matches.

        Returns (task, created) where created is False on idempotent external_id hit.
        """
        external_id = self._normalize_external_id(body.external_id)
        if external_id is not None:
            existing = self._gateway.get_by_owner_external_id(
                principal.user_id, external_id
            )
            if existing is not None:
                return self._mapper.task_out(existing), False

        parent_internal = None
        if body.parent_task_id is not None:
            parent = self._access.get_task(
                principal, body.parent_task_id, "tasks:write"
            )
            if parent.archived_at is not None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent is archived")
            parent_internal = parent.id

        task = self._build_new_task(
            principal, body, external_id=external_id, parent_internal=parent_internal
        )
        try:
            self._gateway.add(task)
            task_event_recorder.record(
                self._db,
                task_id=task.id,
                event_type="created",
                actor=principal,
                payload={
                    "title": task.title,
                    "priority": task.priority,
                    "external_id": task.external_id,
                },
            )
            self._gateway.commit()
        except IntegrityError:
            return self._recover_create_race(principal.user_id, external_id)
        self._gateway.refresh(task)
        return self._mapper.task_out(task), True

    def get_detail(self, principal: Principal, task_ref: str) -> TaskDetailOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        self._mapper.remember([task])
        links = TaskLinkService(self._db).list_for_task(
            user_id=principal.user_id, task_id=task.id
        )
        watching = TaskWatchService(self._db).is_watching(
            principal.user_id, task.id
        )
        children = self._gateway.list_children(task.id)
        events = self._gateway.list_events(task.id)
        artifacts = self._artifacts.list_for_task(task.id)
        artifact_service = ArtifactService(self._db)
        return TaskDetailOut(
            task=self._mapper.task_out(task),
            events=[self._mapper.event_out(e) for e in events],
            artifacts=[
                self._mapper.artifact_out(
                    a,
                    can_modify=artifact_service.can_modify(principal, a, task),
                    task_title=task.title,
                    task_number=task.owner_task_number,
                )
                for a in artifacts
            ],
            children=self._mapper.tasks_out(children),
            links=[self._mapper.link_out(link) for link in links],
            watching=watching,
        )

    def update(self, principal: Principal, task_ref: str, body: TaskUpdate) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        changes = self._apply_update(task, principal, body)
        if changes:
            task_event_recorder.record(
                self._db,
                task_id=task.id,
                event_type="updated",
                actor=principal,
                payload=changes,
            )
        try:
            self._gateway.commit()
        except IntegrityError as exc:
            self._gateway.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "external_id already used by another task for this owner",
            ) from exc
        self._gateway.refresh(task)
        return self._mapper.task_out(task)

    def reorder(
        self, principal: Principal, task_ref: str, body: TaskReorder
    ) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        siblings = self._gateway.list_siblings(
            task.parent_task_id, owner_user_id=task.owner_user_id
        )
        others = [row for row in siblings if row.id != task.id]
        insert_at = self._reorder_insert_index(principal, task, body, others)
        self._apply_reorder_rank(task, others, insert_at)
        payload: dict[str, Any] = {"rank": task.rank}
        if body.before_task_id is not None:
            payload["before_task_id"] = body.before_task_id
        if body.after_task_id is not None:
            payload["after_task_id"] = body.after_task_id
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="reordered",
            actor=principal,
            payload=payload,
        )
        self._gateway.commit()
        self._gateway.refresh(task)
        return self._mapper.task_out(task)

    def set_status(
        self, principal: Principal, task_ref: str, body: TaskStatusIn
    ) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        old = task.status
        if body.status == "done":
            self._apply_done(task, body.outcome)
        else:
            task.outcome_json = None
        task.status = body.status
        self._apply_status_timestamps(task, body.status)
        self._apply_status_last_error(task, old=old, body=body)
        payload: dict[str, Any] = {"from": old, "to": body.status}
        if task.last_error is not None and body.status == "failed":
            payload["last_error"] = task.last_error
        if task.outcome_json is not None and body.status == "done":
            payload["outcome"] = True
        event = task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="status_changed",
            actor=principal,
            payload=payload,
        )
        notification_dispatcher(self._db).notify_watchers(
            task=task,
            actor=principal,
            kind="status_changed",
            title=f"Status → {body.status}",
            body=f"“{task.title}” moved from {old} to {body.status}",
            payload=payload,
        )
        return self._commit_and_dispatch(task, event, payload)

    def add_comment(
        self,
        principal: Principal,
        task_ref: str,
        body: TaskCommentIn,
    ) -> TaskCommentOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        text = body.body.strip()
        if not text:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Comment cannot be empty")
        mentioned = self._accessible_mention_ids(principal, task, text)
        payload: dict[str, Any] = {
            "body": text,
            "mentioned_user_ids": mentioned,
        }
        event = task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="commented",
            actor=principal,
            payload=payload,
        )
        dispatcher = notification_dispatcher(self._db)
        mentioned_set = set(mentioned)
        dispatcher.notify_users(
            user_ids=mentioned,
            task=task,
            actor=principal,
            kind="mentioned",
            title=f"Mentioned on “{task.title}”",
            body=text,
            payload={"body": text},
        )
        dispatcher.notify_watchers(
            task=task,
            actor=principal,
            kind="commented",
            title=f"Comment on “{task.title}”",
            body=text,
            payload={"body": text},
            exclude_user_ids=mentioned_set,
        )
        self._commit_and_dispatch(task, event, payload)
        return self._mapper.comment_out(
            event_id=event.id,
            task=task,
            body=text,
            mentioned_user_ids=mentioned,
        )

    def bulk_update(
        self, principal: Principal, body: TaskBulkUpdate
    ) -> list[TaskOut]:
        tasks = [
            self._access.get_task(principal, task_ref, "tasks:write")
            for task_ref in self._unique_refs(body.task_ids)
        ]
        for task in tasks:
            if body.status is not None:
                self._change_status(task, principal, body.status)
            if body.priority is not None and task.priority != body.priority:
                task.priority = body.priority
                task_event_recorder.record(
                    self._db,
                    task_id=task.id,
                    event_type="updated",
                    actor=principal,
                    payload={"priority": task.priority},
                )
        self._gateway.commit()
        for task in tasks:
            self._gateway.refresh(task)
        return self._mapper.tasks_out(tasks)

    def claim(
        self,
        principal: Principal,
        task_ref: str,
        body: TaskClaimIn | None = None,
    ) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:claim")
        lease_seconds = (body or TaskClaimIn()).lease_seconds
        event = self._claims.claim(task, principal, lease_seconds=lease_seconds)
        return self._commit_and_dispatch(task, event)

    def release(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:claim")
        event = self._claims.release(task, principal)
        if event is None:
            self._gateway.commit()
            self._gateway.refresh(task)
            return self._mapper.task_out(task)
        return self._commit_and_dispatch(task, event)

    def heartbeat(
        self,
        principal: Principal,
        task_ref: str,
        body: TaskClaimIn | None = None,
    ) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:claim")
        lease_seconds = (body or TaskClaimIn()).lease_seconds
        self._claims.renew(task, principal, lease_seconds=lease_seconds)
        self._gateway.commit()
        self._gateway.refresh(task)
        return self._mapper.task_out(task)

    def archive(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        if task.archived_at is None:
            task.archived_at = self._utcnow()
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="archived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task)

    def unarchive(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        if task.archived_at is not None:
            task.archived_at = None
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="unarchived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task)

    def delete(self, principal: Principal, task_ref: str) -> None:
        task = self._access.require_owner(principal, task_ref)
        self._gateway.delete(task)
        self._gateway.commit()

    def mark_read(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        if task.unread:
            task.unread = False
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task)

    def mark_unread(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        if not task.unread:
            task.unread = True
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task)

    def _build_new_task(
        self,
        principal: Principal,
        body: TaskCreate,
        *,
        external_id: str | None,
        parent_internal: int | None,
    ) -> Task:
        return Task(
            public_id=new_task_public_id(),
            owner_task_number=self._numbers.next_number(principal.user_id),
            owner_user_id=principal.user_id,
            parent_task_id=parent_internal,
            external_id=external_id,
            title=body.title.strip(),
            body=body.body,
            priority=body.priority,
            rank=self._ranks.append_rank(
                self._gateway.max_rank_for_parent(
                    parent_internal, owner_user_id=principal.user_id
                )
            ),
            due_at=body.due_at,
            source="api" if principal.token else "ui",
            created_by_user_id=principal.user_id,
            created_by_token_id=principal.token_id,
            require_artifact_on_done=body.require_artifact_on_done,
            outcome_schema_json=self._encode_schema(body.outcome_schema),
        )

    def _reorder_insert_index(
        self,
        principal: Principal,
        task: Task,
        body: TaskReorder,
        others: list[Task],
    ) -> int:
        if body.after_task_id is not None:
            anchor = self._reorder_anchor(principal, task, body.after_task_id)
            return self._sibling_index(others, anchor.id) + 1
        if body.before_task_id is not None:
            anchor = self._reorder_anchor(principal, task, body.before_task_id)
            return self._sibling_index(others, anchor.id)
        return len(others)

    @staticmethod
    def _sibling_index(siblings: list[Task], task_id: int) -> int:
        for index, row in enumerate(siblings):
            if row.id == task_id:
                return index
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Anchor is not in the sibling list"
        )

    def _reorder_anchor(
        self, principal: Principal, task: Task, anchor_ref: str
    ) -> Task:
        if anchor_ref == task.public_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Cannot reorder relative to itself"
            )
        anchor = self._access.get_task(principal, anchor_ref, "tasks:write")
        if anchor.parent_task_id != task.parent_task_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Anchor must be a sibling (same parent)",
            )
        if anchor.archived_at is not None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Anchor task is archived"
            )
        return anchor

    def _apply_reorder_rank(
        self, task: Task, others: list[Task], insert_at: int
    ) -> None:
        prev_rank = others[insert_at - 1].rank if insert_at > 0 else None
        next_rank = others[insert_at].rank if insert_at < len(others) else None
        new_rank = self._ranks.insert_rank(prev_rank, next_rank)
        if new_rank is not None:
            task.rank = new_rank
            return
        ordered = list(others)
        ordered.insert(insert_at, task)
        self._ranks.reindex(ordered)

    def _resolve_parent_filter(
        self, principal: Principal, parent_task_id: str | None
    ) -> int | None:
        if parent_task_id is None:
            return None
        parent = self._access.get_task(principal, parent_task_id, "tasks:read")
        return parent.id

    def _apply_done(self, task: Task, outcome: dict[str, Any] | None) -> None:
        artifact_count = len(self._artifacts.list_for_task(task.id))
        task.outcome_json = self._outcomes.enforce(
            task,
            outcome=outcome,
            artifact_count=artifact_count,
        )

    def _apply_update(
        self, task: Task, principal: Principal, body: TaskUpdate
    ) -> dict:
        changes: dict = {}
        if body.title is not None:
            task.title = body.title.strip()
            changes["title"] = task.title
        if body.body is not None:
            task.body = body.body
            changes["body"] = True
        if body.priority is not None:
            task.priority = body.priority
            changes["priority"] = task.priority
        if body.rank is not None:
            task.rank = body.rank
            changes["rank"] = task.rank
        self._apply_parent_change(task, principal, body, changes)
        self._apply_due_change(task, body, changes)
        self._apply_external_id_change(task, body, changes)
        self._apply_outcome_config(task, body, changes)
        return changes

    def _apply_external_id_change(
        self, task: Task, body: TaskUpdate, changes: dict
    ) -> None:
        if body.clear_external_id:
            task.external_id = None
            changes["external_id"] = None
        elif body.external_id is not None:
            task.external_id = self._normalize_external_id(body.external_id)
            changes["external_id"] = task.external_id

    def _normalize_external_id(self, external_id: str | None) -> str | None:
        if external_id is None:
            return None
        stripped = external_id.strip()
        return stripped or None

    def _recover_create_race(
        self, owner_user_id: int, external_id: str | None
    ) -> tuple[TaskOut, bool]:
        self._gateway.rollback()
        if external_id is not None:
            existing = self._gateway.get_by_owner_external_id(owner_user_id, external_id)
            if existing is not None:
                return self._mapper.task_out(existing), False
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create task")

    def _apply_outcome_config(
        self, task: Task, body: TaskUpdate, changes: dict
    ) -> None:
        if body.require_artifact_on_done is not None:
            task.require_artifact_on_done = body.require_artifact_on_done
            changes["require_artifact_on_done"] = task.require_artifact_on_done
        if body.clear_outcome_schema:
            task.outcome_schema_json = None
            changes["outcome_schema"] = None
        elif body.outcome_schema is not None:
            task.outcome_schema_json = self._encode_schema(body.outcome_schema)
            changes["outcome_schema"] = True

    def _apply_parent_change(
        self,
        task: Task,
        principal: Principal,
        body: TaskUpdate,
        changes: dict,
    ) -> None:
        if body.clear_parent:
            task.parent_task_id = None
            changes["parent_task_id"] = None
        elif body.parent_task_id is not None:
            parent = self._access.get_task(
                principal, body.parent_task_id, "tasks:write"
            )
            if parent.id == task.id:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "Cannot parent to self"
                )
            task.parent_task_id = parent.id
            changes["parent_task_id"] = parent.public_id

    def _apply_due_change(
        self, task: Task, body: TaskUpdate, changes: dict
    ) -> None:
        if body.clear_due_at:
            task.due_at = None
            changes["due_at"] = None
        elif body.due_at is not None:
            task.due_at = body.due_at
            changes["due_at"] = task.due_at.isoformat() if task.due_at else None

    def _change_status(
        self, task: Task, principal: Principal, new_status: str
    ) -> None:
        old = task.status
        if old == new_status:
            return
        if new_status == "done":
            self._apply_done(task, None)
        else:
            task.outcome_json = None
        task.status = new_status
        self._apply_status_timestamps(task, new_status)
        if new_status != "failed" and old == "failed":
            task.last_error = None
        payload: dict[str, Any] = {"from": old, "to": new_status}
        if task.outcome_json is not None and new_status == "done":
            payload["outcome"] = True
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="status_changed",
            actor=principal,
            payload=payload,
        )
        notification_dispatcher(self._db).notify_watchers(
            task=task,
            actor=principal,
            kind="status_changed",
            title=f"Status → {new_status}",
            body=f"“{task.title}” moved from {old} to {new_status}",
            payload=payload,
        )

    def _apply_status_timestamps(self, task: Task, new_status: str) -> None:
        if new_status == "done":
            task.completed_at = self._utcnow()
            task.cancelled_at = None
        elif new_status == "cancelled":
            task.cancelled_at = self._utcnow()
            task.completed_at = None
        else:
            task.completed_at = None
            task.cancelled_at = None

    def _apply_status_last_error(
        self, task: Task, *, old: str, body: TaskStatusIn
    ) -> None:
        if body.last_error is not None:
            text = body.last_error.strip()
            task.last_error = text or None
            return
        if body.status != "failed" and old == "failed":
            task.last_error = None

    def _accessible_mention_ids(
        self, principal: Principal, task: Task, text: str
    ) -> list[int]:
        resolved = mention_resolver.resolve_user_ids(self._db, text)
        return [
            user_id
            for user_id in resolved
            if user_id != principal.user_id and self._user_can_see_task(user_id, task)
        ]

    def _user_can_see_task(self, user_id: int, task: Task) -> bool:
        if task.owner_user_id == user_id:
            return True
        shared = self._db.scalar(
            select(Membership.id).where(
                Membership.user_id == user_id,
                Membership.scope_type == "task",
                Membership.scope_task_id == task.id,
            )
        )
        return shared is not None

    def _unique_refs(self, task_ids: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for task_id in task_ids:
            if task_id in seen:
                continue
            seen.add(task_id)
            ordered.append(task_id)
        return ordered

    def _encode_schema(self, schema: dict[str, Any] | None) -> str | None:
        if schema is None:
            return None
        return self._schema_codec.encode(schema)

    def _commit_and_dispatch(
        self,
        task: Task,
        event: TaskEvent,
        data: dict[str, Any] | None = None,
    ) -> TaskOut:
        self._gateway.commit()
        self._gateway.refresh(task)
        self._gateway.refresh(event)
        payload = data if data is not None else self._event_payload(event)
        WebhookDeliveryService(self._db).deliver_for_event(
            task=task, event=event, data=payload
        )
        return self._mapper.task_out(task)

    @staticmethod
    def _event_payload(event: TaskEvent) -> dict[str, Any]:
        if not event.payload_json:
            return {}
        try:
            raw = json.loads(event.payload_json)
        except json.JSONDecodeError:
            return {}
        return raw if isinstance(raw, dict) else {}

    def _utcnow(self) -> datetime:
        return datetime.now(UTC)
