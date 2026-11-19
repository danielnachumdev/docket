import secrets
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from waymark.api.task_external_shares.task_external_share_gateway import (
    TaskExternalShareGateway,
)
from waymark.auth.principal import Principal
from waymark.auth.task_access_service import TaskAccessService
from waymark.models import Task, TaskExternalShare
from waymark.schemas.external_shares import (
    ExternalShareCreate,
    ExternalShareCreatedOut,
    ExternalShareOut,
    ExternalShareRotatedOut,
    ExternalShareUpdate,
)
from waymark.security import api_token_hasher

TOKEN_PREFIX = "wxs_"


class TaskExternalShareService:
    """Mint, list, update, revoke, and rotate named external share links."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._gateway = TaskExternalShareGateway(db)
        self._access = TaskAccessService(db)

    def list_shares(self, principal: Principal, task_ref: str) -> list[ExternalShareOut]:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        return [self._out(task, row) for row in self._gateway.list_for_task(task.id)]

    def create(self, principal: Principal, task_ref: str, body: ExternalShareCreate) -> ExternalShareCreatedOut:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        raw = self._mint_raw_token()
        row = TaskExternalShare(
            task_id=task.id,
            name=body.name.strip(),
            token_hash=api_token_hasher.hash(raw),
            created_by_user_id=principal.user_id,
            expires_at=body.expires_at,
        )
        self._gateway.add(row)
        self._gateway.commit()
        self._gateway.refresh(row)
        base = self._out(task, row)
        return ExternalShareCreatedOut(**base.model_dump(), token=raw)

    def update(self, principal: Principal, task_ref: str, share_id: int, body: ExternalShareUpdate) -> ExternalShareOut:
        task, row = self._writable_share(principal, task_ref, share_id)
        if body.name is not None:
            row.name = body.name.strip()
        if body.clear_expires_at:
            row.expires_at = None
        elif body.expires_at is not None:
            row.expires_at = body.expires_at
        self._gateway.commit()
        self._gateway.refresh(row)
        return self._out(task, row)

    def revoke(self, principal: Principal, task_ref: str, share_id: int) -> ExternalShareOut:
        task, row = self._writable_share(principal, task_ref, share_id)
        if row.revoked_at is None:
            row.revoked_at = datetime.now(UTC)
            self._gateway.commit()
            self._gateway.refresh(row)
        return self._out(task, row)

    def rotate(self, principal: Principal, task_ref: str, share_id: int) -> ExternalShareRotatedOut:
        task, row = self._writable_share(principal, task_ref, share_id)
        if row.revoked_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
        raw = self._mint_raw_token()
        row.token_hash = api_token_hasher.hash(raw)
        self._gateway.commit()
        self._gateway.refresh(row)
        base = self._out(task, row)
        return ExternalShareRotatedOut(**base.model_dump(), token=raw)

    def require_active_share(self, raw_token: str) -> tuple[TaskExternalShare, Task]:
        row = self._gateway.by_token_hash(api_token_hasher.hash(raw_token))
        if row is None or row.revoked_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
        if self._is_expired(row):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
        task = self._db.get(Task, row.task_id)
        if task is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
        return row, task

    def _writable_share(self, principal: Principal, task_ref: str, share_id: int) -> tuple[Task, TaskExternalShare]:
        task = self._access.get_task(principal, task_ref, "tasks:write")
        row = self._gateway.get_for_task(task.id, share_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
        return task, row

    @staticmethod
    def _mint_raw_token() -> str:
        return f"{TOKEN_PREFIX}{secrets.token_urlsafe(32)}"

    @staticmethod
    def _is_expired(row: TaskExternalShare) -> bool:
        if row.expires_at is None:
            return False
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        return expires <= datetime.now(UTC)

    @staticmethod
    def _out(task: Task, row: TaskExternalShare) -> ExternalShareOut:
        return ExternalShareOut(
            id=row.id,
            task_id=task.public_id,
            name=row.name,
            expires_at=row.expires_at,
            revoked_at=row.revoked_at,
            created_by_user_id=row.created_by_user_id,
            created_at=row.created_at,
        )
