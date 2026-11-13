from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import WebhookSubscription


class WebhookGateway:
    """Raw webhook_subscriptions table access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, subscription_id: int) -> WebhookSubscription | None:
        return self._db.get(WebhookSubscription, subscription_id)

    def add(self, row: WebhookSubscription) -> WebhookSubscription:
        self._db.add(row)
        self._db.flush()
        return row

    def delete(self, row: WebhookSubscription) -> None:
        self._db.delete(row)

    def list_by_user_id(self, user_id: int) -> list[WebhookSubscription]:
        stmt = (
            select(WebhookSubscription)
            .where(WebhookSubscription.user_id == user_id)
            .order_by(WebhookSubscription.created_at.desc(), WebhookSubscription.id.desc())
        )
        return list(self._db.scalars(stmt).all())

    def list_enabled_for_owner(self, owner_user_id: int) -> list[WebhookSubscription]:
        stmt = select(WebhookSubscription).where(
            WebhookSubscription.user_id == owner_user_id,
            WebhookSubscription.enabled.is_(True),
        )
        return list(self._db.scalars(stmt).all())

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, obj: object) -> None:
        self._db.refresh(obj)
