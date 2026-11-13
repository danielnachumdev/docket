from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from docket.db import Base


class TaskEvent(Base):
    __tablename__ = "task_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    # created | updated | status_changed | claimed | released | claim_renewed |
    # claim_failed | release_failed | heartbeat_failed | commented |
    # artifact_added | archived | linked | ...
    type: Mapped[str] = mapped_column(String(64))
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    actor_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True
    )
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    task: Mapped["Task"] = relationship(back_populates="events")
    actor_token: Mapped["ApiToken | None"] = relationship()

    @property
    def actor_token_name(self) -> str | None:
        return self.actor_token.name if self.actor_token is not None else None

    @property
    def actor_role_name(self) -> str | None:
        if self.actor_token is None or self.actor_token.role is None:
            return None
        return self.actor_token.role.name
