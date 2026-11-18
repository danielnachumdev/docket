import json
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from waymark.api.task_watches.task_watch_service import TaskWatchService
from waymark.api.tasks.personal_task_number_allocator import (
    PersonalTaskNumberAllocator,
)
from waymark.api.tasks.owner_rank_allocator import OwnerRankAllocator
from waymark.api.tasks.task_gateway import TaskGateway
from waymark.api.tasks.task_response_mapper import TaskResponseMapper
from waymark.artifacts import ArtifactGateway, ArtifactService
from waymark.auth.principal import Principal
from waymark.auth.task_access_service import TaskAccessService
from waymark.events import task_event_recorder
from waymark.models import Task, TaskEvent
from waymark.models.task_public_id import new_task_public_id
from waymark.notifications import notification_dispatcher
from waymark.schemas import (
    TaskBulkUpdate,
    TaskClaimIn,
    TaskCreate,
    TaskDetailOut,
    TaskOut,
    TaskReorder,
    TaskStatusIn,
    TaskUpdate,
)
from waymark.schemas.tasks import PAUSE_STATUSES
from waymark.task_claims import TaskClaimService
from waymark.task_links import TaskLinkService
from waymark.task_outcomes import DoneOutcomeEnforcer, OutcomeSchemaCodec
from waymark.webhooks import WebhookDeliveryService


class TaskService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._gateway = TaskGateway(db)
        self._artifacts = ArtifactGateway(db)
        self._claims = TaskClaimService(db)
        self._access = TaskAccessService(db)
        self._outcomes = DoneOutcomeEnforcer()
        self._schema_codec = OutcomeSchemaCodec()
        self._numbers = PersonalTaskNumberAllocator(db)
        self._ranks = OwnerRankAllocator()
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
        return self._mapper.tasks_out(tasks, viewer_user_id=principal.user_id)

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
        return self._mapper.tasks_out(tasks, viewer_user_id=principal.user_id)

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
                return self._mapper.task_out(existing, viewer_user_id=principal.user_id), False

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
        return self._mapper.task_out(task, viewer_user_id=principal.user_id), True

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
        artifact_service = ArtifactService(self._db)
        artifacts = artifact_service.list_artifacts(principal, task_ref)
        return TaskDetailOut(
            task=self._mapper.task_out(task, viewer_user_id=principal.user_id),
            events=[self._mapper.event_out(e) for e in events],
            artifacts=[
                self._mapper.artifact_out(
                    a,
                    can_modify=artifact_service.can_modify(principal, a, task),
                    task_title=task.title,
                    task_number=self._mapper.number_for(task, viewer_user_id=principal.user_id),
                )
                for a in artifacts
            ],
            children=self._mapper.tasks_out(children, viewer_user_id=principal.user_id),
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
            self._notify_task_updated(task, principal, changes)
        try:
            self._gateway.commit()
        except IntegrityError as exc:
            self._gateway.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "external_id already used by another task for this owner",
            ) from exc
        self._gateway.refresh(task)
        return self._mapper.task_out(task, viewer_user_id=principal.user_id)

    def reorder(
        self, principal: Principal, task_ref: str, body: TaskReorder
    ) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        queue = self._gateway.list_owned_queue(owner_user_id=task.owner_user_id)
        others = [row for row in queue if row.id != task.id]
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
        return self._mapper.task_out(task, viewer_user_id=principal.user_id)

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
        self._apply_status_reason(task, body=body)
        payload: dict[str, Any] = {"from": old, "to": body.status}
        if task.last_error is not None and body.status == "failed":
            payload["last_error"] = task.last_error
        if task.status_reason is not None and body.status in PAUSE_STATUSES:
            payload["reason"] = task.status_reason
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
        return self._commit_and_dispatch(
            task, event, payload, viewer_user_id=principal.user_id
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
            if body.unread is not None:
                self._apply_unread(task, unread=body.unread)
        self._gateway.commit()
        for task in tasks:
            self._gateway.refresh(task)
        return self._mapper.tasks_out(tasks, viewer_user_id=principal.user_id)

    def claim(
        self,
        principal: Principal,
        task_ref: str,
        body: TaskClaimIn | None = None,
    ) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:claim")
        lease_seconds = (body or TaskClaimIn()).lease_seconds
        event = self._claims.claim(task, principal, lease_seconds=lease_seconds)
        notification_dispatcher(self._db).notify_watchers(
            task=task,
            actor=principal,
            kind="claimed",
            title=f"Claimed “{task.title}”",
            body="An agent claimed this task",
            payload={"event": "claimed"},
        )
        return self._commit_and_dispatch(
            task, event, viewer_user_id=principal.user_id
        )

    def release(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:claim")
        event = self._claims.release(task, principal)
        if event is None:
            self._gateway.commit()
            self._gateway.refresh(task)
            return self._mapper.task_out(task, viewer_user_id=principal.user_id)
        notification_dispatcher(self._db).notify_watchers(
            task=task,
            actor=principal,
            kind="released",
            title=f"Released “{task.title}”",
            body="The claim on this task was released",
            payload={"event": "released"},
        )
        return self._commit_and_dispatch(
            task, event, viewer_user_id=principal.user_id
        )

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
        return self._mapper.task_out(task, viewer_user_id=principal.user_id)

    def archive(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        if task.archived_at is None:
            task.archived_at = self._utcnow()
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="archived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task, viewer_user_id=principal.user_id)

    def unarchive(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        if task.archived_at is not None:
            task.archived_at = None
            task_event_recorder.record(
                self._db, task_id=task.id, event_type="unarchived", actor=principal
            )
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task, viewer_user_id=principal.user_id)

    def delete(self, principal: Principal, task_ref: str) -> None:
        task = self._access.require_owner(principal, task_ref)
        self._gateway.delete(task)
        self._gateway.commit()

    def mark_read(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        if self._apply_unread(task, unread=False):
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task, viewer_user_id=principal.user_id)

    def mark_unread(self, principal: Principal, task_ref: str) -> TaskOut:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        if self._apply_unread(task, unread=True):
            self._gateway.commit()
            self._gateway.refresh(task)
        return self._mapper.task_out(task, viewer_user_id=principal.user_id)

    def _apply_unread(self, task: Task, *, unread: bool) -> bool:
        """Set shared unread bit; clear viewer exclusion. True when mutated."""
        if task.unread == unread and task.unread_except_user_id is None:
            return False
        task.unread = unread
        task.unread_except_user_id = None
        return True

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
            description=body.description,
            priority=body.priority,
            rank=self._ranks.append_rank(
                self._gateway.max_rank_for_owner(owner_user_id=principal.user_id)
            ),
            due_at=body.due_at,
            due_horizon=self._due_horizon_for_create(body),
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
            return self._queue_index(others, anchor.id) + 1
        if body.before_task_id is not None:
            anchor = self._reorder_anchor(principal, task, body.before_task_id)
            return self._queue_index(others, anchor.id)
        return len(others)

    @staticmethod
    def _queue_index(queue: list[Task], task_id: int) -> int:
        for index, row in enumerate(queue):
            if row.id == task_id:
                return index
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Anchor is not in the owner work queue"
        )

    def _reorder_anchor(
        self, principal: Principal, task: Task, anchor_ref: str
    ) -> Task:
        if anchor_ref == task.public_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Cannot reorder relative to itself"
            )
        anchor = self._access.get_task(principal, anchor_ref, "tasks:write")
        if anchor.owner_user_id != task.owner_user_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Anchor must belong to the same owner",
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

    _NOTIFY_UPDATE_KEYS = frozenset(
        {
            "title",
            "description",
            "priority",
            "due_at",
            "due_horizon",
            "parent_task_id",
        }
    )

    def _notify_task_updated(
        self, task: Task, principal: Principal, changes: dict
    ) -> None:
        keys = [key for key in changes if key in self._NOTIFY_UPDATE_KEYS]
        if not keys:
            return
        notification_dispatcher(self._db).notify_watchers(
            task=task,
            actor=principal,
            kind="task_updated",
            title=f"Updated “{task.title}”",
            body=", ".join(keys),
            payload={key: changes[key] for key in keys},
        )

    def _apply_update(
        self, task: Task, principal: Principal, body: TaskUpdate
    ) -> dict:
        changes: dict = {}
        if body.title is not None:
            task.title = body.title.strip()
            changes["title"] = task.title
        if body.description is not None:
            task.description = body.description
            changes["description"] = True
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
                return self._mapper.task_out(existing, viewer_user_id=principal.user_id), False
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
            task.due_horizon = None
            changes["due_at"] = None
            changes["due_horizon"] = None
            return
        if body.due_at is not None:
            task.due_at = body.due_at
            changes["due_at"] = task.due_at.isoformat() if task.due_at else None
            horizon = body.due_horizon if body.due_horizon is not None else "exact"
            task.due_horizon = horizon
            changes["due_horizon"] = horizon
            return
        if body.due_horizon is not None:
            task.due_horizon = body.due_horizon
            changes["due_horizon"] = body.due_horizon

    @staticmethod
    def _due_horizon_for_create(body: TaskCreate) -> str | None:
        if body.due_at is None:
            return None
        if body.due_horizon is not None:
            return body.due_horizon
        return "exact"

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
        if new_status not in PAUSE_STATUSES:
            task.status_reason = None
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

    def _apply_status_reason(self, task: Task, *, body: TaskStatusIn) -> None:
        if body.status not in PAUSE_STATUSES:
            task.status_reason = None
            return
        if body.reason is None:
            task.status_reason = None
            return
        text = body.reason.strip()
        task.status_reason = text or None

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
        *,
        viewer_user_id: int,
    ) -> TaskOut:
        self._gateway.commit()
        self._gateway.refresh(task)
        self._gateway.refresh(event)
        payload = data if data is not None else self._event_payload(event)
        WebhookDeliveryService(self._db).deliver_for_event(
            task=task, event=event, data=payload
        )
        return self._mapper.task_out(task, viewer_user_id=viewer_user_id)

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
