from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from waymark.db import Base


class ApiTokenRequestLog(Base):
    """Per-request usage row for an API token (no secrets / Authorization)."""

    __tablename__ = "api_token_request_logs"
    __table_args__ = (
        Index("ix_api_token_request_logs_token_created", "token_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    token_id: Mapped[int] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    method: Mapped[str] = mapped_column(String(16))
    path: Mapped[str] = mapped_column(String(512))
    status_code: Mapped[int] = mapped_column(Integer)
    client_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(256), nullable=True)

    token: Mapped["ApiToken"] = relationship()
