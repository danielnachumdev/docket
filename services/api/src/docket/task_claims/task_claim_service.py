"""Task claim / lease rules for agent workers.

Ownership of an active lease is keyed by ``claimed_by_token_id`` (Bearer API
token). Session users (no token) do not take claims; they may release or
override any lease on tasks they own — the human control-plane escape hatch.
"""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.events import task_event_recorder
from docket.models import Task, TaskEvent

DEFAULT_LEASE_SECONDS = 900
MAX_LEASE_SECONDS = 86_400


class TaskClaimService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def claim(
        self,
        task: Task,
        principal: Principal,
        *,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> TaskEvent:
        token_id = self._require_token_principal(principal)
        seconds = self._normalize_lease_seconds(lease_seconds)
        holder = self._active_holder_token_id(task)
        if holder is not None and holder != token_id:
            self._record_ops_failure_and_raise(
                task,
                principal,
                operation="claim",
                detail="Task is claimed by another agent",
                code=status.HTTP_409_CONFLICT,
            )
        expires = self._utcnow() + timedelta(seconds=seconds)
        task.claimed_by_token_id = token_id
        task.claimed_by_token = principal.token
        task.claim_expires_at = expires
        task.last_error = None
        return task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="claimed",
            actor=principal,
            payload={
                "claimed_by_token_id": token_id,
                "claim_expires_at": expires.isoformat(),
                "lease_seconds": seconds,
            },
        )

    def release(self, task: Task, principal: Principal) -> TaskEvent | None:
        if not self._has_claim(task):
            return None
        self._assert_may_release(task, principal)
        previous = task.claimed_by_token_id
        task.claimed_by_token_id = None
        task.claimed_by_token = None
        task.claim_expires_at = None
        return task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="released",
            actor=principal,
            payload={"previous_claimed_by_token_id": previous},
        )

    def renew(
        self,
        task: Task,
        principal: Principal,
        *,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> TaskEvent:
        token_id = self._require_token_principal(principal)
        seconds = self._normalize_lease_seconds(lease_seconds)
        holder = self._active_holder_token_id(task)
        if holder is None:
            self._record_ops_failure_and_raise(
                task,
                principal,
                operation="heartbeat",
                detail="No active claim to renew",
                code=status.HTTP_409_CONFLICT,
            )
        if holder != token_id:
            self._record_ops_failure_and_raise(
                task,
                principal,
                operation="heartbeat",
                detail="Task is claimed by another agent",
                code=status.HTTP_409_CONFLICT,
            )
        expires = self._utcnow() + timedelta(seconds=seconds)
        task.claim_expires_at = expires
        return task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="claim_renewed",
            actor=principal,
            payload={
                "claimed_by_token_id": token_id,
                "claim_expires_at": expires.isoformat(),
                "lease_seconds": seconds,
            },
        )

    def _assert_may_release(self, task: Task, principal: Principal) -> None:
        # Session owner: may override any lease. Token: only its own active lease.
        if principal.token is None:
            return
        holder = self._active_holder_token_id(task)
        if holder is not None and holder != principal.token_id:
            self._record_ops_failure_and_raise(
                task,
                principal,
                operation="release",
                detail="Task is claimed by another agent",
                code=status.HTTP_409_CONFLICT,
            )

    def _record_ops_failure_and_raise(
        self,
        task: Task,
        principal: Principal,
        *,
        operation: str,
        detail: str,
        code: int,
    ) -> None:
        task.last_error = detail
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type=f"{operation}_failed",
            actor=principal,
            payload={"error": detail, "operation": operation},
        )
        self._db.commit()
        raise HTTPException(code, detail)

    def _require_token_principal(self, principal: Principal) -> int:
        if principal.token_id is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Claim/renew requires a Bearer API token principal",
            )
        return principal.token_id

    def _active_holder_token_id(self, task: Task) -> int | None:
        if not self._lease_is_active(task):
            return None
        return task.claimed_by_token_id

    def _has_claim(self, task: Task) -> bool:
        return task.claimed_by_token_id is not None or task.claim_expires_at is not None

    def _lease_is_active(self, task: Task) -> bool:
        if task.claimed_by_token_id is None or task.claim_expires_at is None:
            return False
        return self._as_utc(task.claim_expires_at) > self._utcnow()

    @staticmethod
    def _normalize_lease_seconds(lease_seconds: int) -> int:
        if lease_seconds < 1 or lease_seconds > MAX_LEASE_SECONDS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"lease_seconds must be between 1 and {MAX_LEASE_SECONDS}",
            )
        return lease_seconds

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(UTC)

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
