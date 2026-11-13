from typing import Annotated

from fastapi import APIRouter, Depends, status

from docket.auth import Principal, RequirePermission
from docket.db import DbSession
from docket.models import WebhookSubscription
from docket.schemas.webhooks import (
    WebhookCreate,
    WebhookCreatedOut,
    WebhookOut,
    WebhookUpdate,
)
from docket.webhooks import WebhookSubscriptionService

CanManageWebhooks = Annotated[Principal, Depends(RequirePermission("webhooks:manage"))]


class WebhooksApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "",
            self.list_webhooks,
            methods=["GET"],
            response_model=list[WebhookOut],
        )
        self.router.add_api_route(
            "",
            self.create_webhook,
            methods=["POST"],
            response_model=WebhookCreatedOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{subscription_id}",
            self.update_webhook,
            methods=["PATCH"],
            response_model=WebhookOut,
        )
        self.router.add_api_route(
            "/{subscription_id}",
            self.delete_webhook,
            methods=["DELETE"],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    def list_webhooks(
        self, db: DbSession, principal: CanManageWebhooks
    ) -> list[WebhookOut]:
        service = WebhookSubscriptionService(db)
        rows = service.list_for_user(principal.user_id)
        return [self._out(service, row) for row in rows]

    def create_webhook(
        self, body: WebhookCreate, db: DbSession, principal: CanManageWebhooks
    ) -> WebhookCreatedOut:
        service = WebhookSubscriptionService(db)
        created = service.create(
            principal.user_id,
            name=body.name,
            url=body.url,
            event_types=body.event_types,
        )
        base = self._out(service, created.record)
        return WebhookCreatedOut(**base.model_dump(), secret=created.secret)

    def update_webhook(
        self,
        subscription_id: int,
        body: WebhookUpdate,
        db: DbSession,
        principal: CanManageWebhooks,
    ) -> WebhookOut:
        service = WebhookSubscriptionService(db)
        row = service.update(
            principal.user_id,
            subscription_id,
            name=body.name,
            url=body.url,
            event_types=body.event_types,
            enabled=body.enabled,
        )
        return self._out(service, row)

    def delete_webhook(
        self, subscription_id: int, db: DbSession, principal: CanManageWebhooks
    ) -> None:
        WebhookSubscriptionService(db).delete(principal.user_id, subscription_id)

    @staticmethod
    def _out(service: WebhookSubscriptionService, row: WebhookSubscription) -> WebhookOut:
        return WebhookOut(
            id=row.id,
            name=row.name,
            url=row.url,
            event_types=service.event_types_of(row),
            enabled=row.enabled,
            created_at=row.created_at,
            last_delivered_at=row.last_delivered_at,
            last_status_code=row.last_status_code,
            last_error=row.last_error,
        )


webhooks_api = WebhooksApi()
