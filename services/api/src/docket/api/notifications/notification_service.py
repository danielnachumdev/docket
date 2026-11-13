from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from docket.api.tasks.task_response_mapper import TaskResponseMapper
from docket.auth.principal import Principal
from docket.models import Notification
from docket.schemas.notifications import NotificationOut, UnreadCountOut


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
    ) -> list[NotificationOut]:
        stmt = (
            select(Notification)
            .where(Notification.user_id == principal.user_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
        )
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))
        rows = list(self._db.scalars(stmt).all())
        self._mapper.prefetch([r.task_id for r in rows])
        return [self._mapper.notification_out(r) for r in rows]

    def unread_count(self, principal: Principal) -> UnreadCountOut:
        count = self._db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == principal.user_id,
                Notification.read_at.is_(None),
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

    def mark_all_read(self, principal: Principal) -> UnreadCountOut:
        now = datetime.now(UTC)
        rows = self._db.scalars(
            select(Notification).where(
                Notification.user_id == principal.user_id,
                Notification.read_at.is_(None),
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
