import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from docket.models import Task, TaskEvent, WebhookSubscription
from docket.webhooks.webhook_gateway import WebhookGateway
from docket.webhooks.webhook_http_gateway import WebhookHttpGateway
from docket.webhooks.webhook_payload_builder import webhook_payload_builder
from docket.webhooks.webhook_signer import webhook_signer

logger = logging.getLogger(__name__)


class WebhookDeliveryService:
    """Best-effort outbound webhook delivery (never raises to callers)."""

    def __init__(
        self,
        db: Session,
        *,
        http: WebhookHttpGateway | None = None,
    ) -> None:
        self._gateway = WebhookGateway(db)
        self._http = http or WebhookHttpGateway()

    def deliver_for_event(
        self,
        *,
        task: Task,
        event: TaskEvent,
        data: dict[str, Any] | None = None,
    ) -> None:
        try:
            self._deliver(task=task, event=event, data=data or {})
        except Exception:
            logger.exception(
                "webhook dispatch failed event_id=%s type=%s task_id=%s",
                getattr(event, "id", None),
                event.type,
                task.id,
            )

    def _deliver(
        self,
        *,
        task: Task,
        event: TaskEvent,
        data: dict[str, Any],
    ) -> None:
        subscriptions = self._matching_subscriptions(task.owner_user_id, event.type)
        if not subscriptions:
            return
        payload = webhook_payload_builder.build(task=task, event=event, data=data)
        body = webhook_payload_builder.dumps(payload)
        for sub in subscriptions:
            self._post_one(sub, event_type=event.type, body=body, event_id=event.id)

    def _matching_subscriptions(
        self, owner_user_id: int, event_type: str
    ) -> list[WebhookSubscription]:
        matched: list[WebhookSubscription] = []
        for sub in self._gateway.list_enabled_for_owner(owner_user_id):
            if event_type in self._event_types(sub):
                matched.append(sub)
        return matched

    def _post_one(
        self,
        sub: WebhookSubscription,
        *,
        event_type: str,
        body: bytes,
        event_id: int,
    ) -> None:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "docket-webhooks/1",
            "X-Docket-Event": event_type,
            "X-Docket-Delivery-Id": f"{sub.id}:{event_id}",
            webhook_signer.header_name(): webhook_signer.sign(sub.secret, body),
        }
        try:
            result = self._http.post(sub.url, content=body, headers=headers)
        except Exception as exc:  # noqa: BLE001 — fail soft on any transport error
            self._record_failure(sub, error=str(exc)[:500])
            logger.warning(
                "webhook delivery error subscription_id=%s url=%s err=%s",
                sub.id,
                sub.url,
                exc,
            )
            return

        if 200 <= result.status_code < 300:
            self._record_success(sub, status_code=result.status_code)
            return

        snippet = (result.text or "")[:200]
        self._record_failure(
            sub,
            error=f"HTTP {result.status_code}: {snippet}"[:500],
            status_code=result.status_code,
        )
        logger.warning(
            "webhook delivery non-2xx subscription_id=%s status=%s",
            sub.id,
            result.status_code,
        )

    def _record_success(self, sub: WebhookSubscription, *, status_code: int) -> None:
        sub.last_delivered_at = datetime.now(UTC)
        sub.last_status_code = status_code
        sub.last_error = None
        self._gateway.commit()

    def _record_failure(
        self,
        sub: WebhookSubscription,
        *,
        error: str,
        status_code: int | None = None,
    ) -> None:
        sub.last_delivered_at = datetime.now(UTC)
        sub.last_status_code = status_code
        sub.last_error = error
        self._gateway.commit()

    @staticmethod
    def _event_types(sub: WebhookSubscription) -> set[str]:
        try:
            raw = json.loads(sub.event_types_json)
        except json.JSONDecodeError:
            return set()
        if not isinstance(raw, list):
            return set()
        return {str(item) for item in raw}
