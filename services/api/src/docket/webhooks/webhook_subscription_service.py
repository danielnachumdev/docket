import json
import secrets
from dataclasses import dataclass
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.models import WebhookSubscription
from docket.webhooks.webhook_event_types import (
    DEFAULT_WEBHOOK_EVENT_TYPES,
    WEBHOOK_EVENT_TYPES,
)
from docket.webhooks.webhook_gateway import WebhookGateway

_SECRET_PREFIX = "whsec_"


@dataclass(frozen=True)
class CreatedWebhook:
    record: WebhookSubscription
    secret: str


class WebhookSubscriptionService:
    """Create, list, update, and delete webhook subscriptions."""

    def __init__(self, db: Session) -> None:
        self._gateway = WebhookGateway(db)

    def list_for_user(self, user_id: int) -> list[WebhookSubscription]:
        return self._gateway.list_by_user_id(user_id)

    def create(
        self,
        user_id: int,
        *,
        name: str,
        url: str,
        event_types: list[str] | None = None,
    ) -> CreatedWebhook:
        cleaned_name = name.strip()
        if not cleaned_name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
        cleaned_url = self._validate_url(url)
        types = self._normalize_event_types(event_types)
        raw_secret = self._generate_secret()
        record = WebhookSubscription(
            user_id=user_id,
            name=cleaned_name,
            url=cleaned_url,
            secret=raw_secret,
            event_types_json=json.dumps(types),
            enabled=True,
        )
        self._gateway.add(record)
        self._gateway.commit()
        self._gateway.refresh(record)
        return CreatedWebhook(record=record, secret=raw_secret)

    def update(
        self,
        user_id: int,
        subscription_id: int,
        *,
        name: str | None = None,
        url: str | None = None,
        event_types: list[str] | None = None,
        enabled: bool | None = None,
    ) -> WebhookSubscription:
        row = self._owned(user_id, subscription_id)
        if name is not None:
            cleaned = name.strip()
            if not cleaned:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
            row.name = cleaned
        if url is not None:
            row.url = self._validate_url(url)
        if event_types is not None:
            row.event_types_json = json.dumps(self._normalize_event_types(event_types))
        if enabled is not None:
            row.enabled = enabled
        self._gateway.commit()
        self._gateway.refresh(row)
        return row

    def delete(self, user_id: int, subscription_id: int) -> None:
        row = self._owned(user_id, subscription_id)
        self._gateway.delete(row)
        self._gateway.commit()

    def event_types_of(self, row: WebhookSubscription) -> list[str]:
        try:
            raw = json.loads(row.event_types_json)
        except json.JSONDecodeError:
            return []
        if not isinstance(raw, list):
            return []
        return [str(item) for item in raw]

    def _owned(self, user_id: int, subscription_id: int) -> WebhookSubscription:
        row = self._gateway.get(subscription_id)
        if row is None or row.user_id != user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Webhook not found")
        return row

    @staticmethod
    def _validate_url(url: str) -> str:
        cleaned = url.strip()
        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "URL must be an absolute http(s) URL",
            )
        return cleaned

    @staticmethod
    def _normalize_event_types(event_types: list[str] | None) -> list[str]:
        if not event_types:
            return list(DEFAULT_WEBHOOK_EVENT_TYPES)
        normalized = sorted({item.strip() for item in event_types if item.strip()})
        unknown = [item for item in normalized if item not in WEBHOOK_EVENT_TYPES]
        if unknown:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unknown event types: {', '.join(unknown)}",
            )
        if not normalized:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "At least one event type is required",
            )
        return normalized

    @staticmethod
    def _generate_secret() -> str:
        return f"{_SECRET_PREFIX}{secrets.token_urlsafe(32)}"
