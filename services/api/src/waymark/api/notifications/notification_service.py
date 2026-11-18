from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import false, func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import ColumnElement

from waymark.api.tasks.task_response_mapper import TaskResponseMapper
from waymark.auth.principal import Principal
from waymark.models import Notification
from waymark.schemas.notifications import (
    ALLOWED_NOTIFICATION_KINDS,
    NotificationOut,
    NotificationSort,
    UnreadCountOut,
)


class NotificationService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._mapper = TaskResponseMapper(db)

    def list_for_user(
        self,
        principal: Principal,
        *,
        unread_only: bool,
        limit: int,
        kinds: list[str] | None = None,
        sort: NotificationSort = "newest",
    ) -> list[NotificationOut]:
        stmt = (
            select(Notification)
            .where(Notification.user_id == principal.user_id)
            .where(*self._kind_filters(kinds))
            .limit(limit)
        )
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))
        stmt = stmt.order_by(*self._order_clauses(sort))
        rows = list(self._db.scalars(stmt).all())
        self._mapper.prefetch([r.task_id for r in rows])
        return [self._mapper.notification_out(r) for r in rows]

    def unread_count(
        self,
        principal: Principal,
        *,
        kinds: list[str] | None = None,
    ) -> UnreadCountOut:
        count = self._db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == principal.user_id,
                Notification.read_at.is_(None),
                *self._kind_filters(kinds),
            )
        )
        return UnreadCountOut(count=int(count or 0))

    def mark_read(self, principal: Principal, notification_id: int) -> NotificationOut:
        row = self._require_own(principal, notification_id)
        if row.read_at is None:
            row.read_at = datetime.now(UTC)
            self._db.commit()
            self._db.refresh(row)
        return self._mapper.notification_out(row)

    def mark_all_read(
        self,
        principal: Principal,
        *,
        kinds: list[str] | None = None,
    ) -> UnreadCountOut:
        now = datetime.now(UTC)
        rows = self._db.scalars(
            select(Notification).where(
                Notification.user_id == principal.user_id,
                Notification.read_at.is_(None),
                *self._kind_filters(kinds),
            )
        ).all()
        for row in rows:
            row.read_at = now
        self._db.commit()
        return UnreadCountOut(count=0)

    def _require_own(
        self, principal: Principal, notification_id: int
    ) -> Notification:
        row = self._db.get(Notification, notification_id)
        if row is None or row.user_id != principal.user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
        return row

    @staticmethod
    def _order_clauses(sort: NotificationSort) -> tuple[ColumnElement[object], ...]:
        if sort == "oldest":
            return (Notification.created_at.asc(), Notification.id.asc())
        return (Notification.created_at.desc(), Notification.id.desc())

    @staticmethod
    def _kind_filters(kinds: list[str] | None) -> list[ColumnElement[bool]]:
        """None = no kind filter. Empty list = match nothing."""
        if kinds is None:
            return []
        cleaned: list[str] = []
        seen: set[str] = set()
        for kind in kinds:
            if kind not in ALLOWED_NOTIFICATION_KINDS or kind in seen:
                continue
            seen.add(kind)
            cleaned.append(kind)
        if not cleaned:
            return [false()]
        return [Notification.kind.in_(cleaned)]
