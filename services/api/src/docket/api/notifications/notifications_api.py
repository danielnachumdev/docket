from typing import Annotated

from fastapi import APIRouter, Depends, Query

from docket.api.notifications.notification_service import NotificationService
from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.schemas.notifications import NotificationOut, UnreadCountOut

CanRead = Annotated[Principal, Depends(RequirePermission("tasks:read"))]


class NotificationsApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/notifications", tags=["notifications"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "",
            self.list_notifications,
            methods=["GET"],
            response_model=list[NotificationOut],
        )
        self.router.add_api_route(
            "/unread-count",
            self.unread_count,
            methods=["GET"],
            response_model=UnreadCountOut,
        )
        self.router.add_api_route(
            "/read-all",
            self.mark_all_read,
            methods=["POST"],
            response_model=UnreadCountOut,
        )
        self.router.add_api_route(
            "/{notification_id}/read",
            self.mark_read,
            methods=["POST"],
            response_model=NotificationOut,
        )

    def list_notifications(
        self,
        db: DbSession,
        principal: CanRead,
        unread_only: bool = Query(False),
        limit: int = Query(50, ge=1, le=200),
    ) -> list[NotificationOut]:
        return NotificationService(db).list_for_user(
            principal, unread_only=unread_only, limit=limit
        )

    def unread_count(
        self, db: DbSession, principal: CanRead
    ) -> UnreadCountOut:
        return NotificationService(db).unread_count(principal)

    def mark_read(
        self, notification_id: int, db: DbSession, principal: CanRead
    ) -> NotificationOut:
        return NotificationService(db).mark_read(principal, notification_id)

    def mark_all_read(
        self, db: DbSession, principal: CanRead
    ) -> UnreadCountOut:
        return NotificationService(db).mark_all_read(principal)


notifications_api = NotificationsApi()
