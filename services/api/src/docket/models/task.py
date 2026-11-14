from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from docket.db import Base
from docket.models.task_public_id import PUBLIC_ID_LENGTH, new_task_public_id


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint(
            "owner_user_id",
            "external_id",
            name="uq_task_owner_external_id",
        ),
        UniqueConstraint("public_id", name="uq_task_public_id"),
        UniqueConstraint(
            "owner_user_id",
            "owner_task_number",
            name="uq_task_owner_number",
        ),
    )

    # Internal PK for SQLite FKs only — not the public/API identity.
    id: Mapped[int] = mapped_column(primary_key=True)
    # Globally unique short SOT for fetch/share/link/API/URL identity.
    public_id: Mapped[str] = mapped_column(
        String(PUBLIC_ID_LENGTH), default=new_task_public_id, nullable=False
    )
    # Per-owner display enumeration ("my task #N"); not globally unique.
    owner_task_number: Mapped[int] = mapped_column(Integer, nullable=False)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    parent_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    # Agent/chat idempotency key; unique per owner when set.
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str] = mapped_column(String(500))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # backlog | in_progress | blocked | on_hold | failed | done | cancelled
    status: Mapped[str] = mapped_column(String(32), default="backlog")
    priority: Mapped[int] = mapped_column(Integer, default=3)
    rank: Mapped[float] = mapped_column(Float, default=0.0)
    # whatsapp | ui | api
    source: Mapped[str] = mapped_column(String(32), default="ui")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_by_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True
    )
    claim_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Last claim/release/heartbeat conflict or agent-reported failure message.
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True
    )
    require_artifact_on_done: Mapped[bool] = mapped_column(Boolean, default=False)
    # JSON Schema (object) for structured completion payload; null = not required.
    outcome_schema_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Validated outcome JSON recorded when status → done.
    outcome_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Shared (user-independent) unread indicator for the task list.
    unread: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    parent: Mapped["Task | None"] = relationship(remote_side=[id], backref="children")
    events: Mapped[list["TaskEvent"]] = relationship(back_populates="task")
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="task")
    comments: Mapped[list["TaskComment"]] = relationship(back_populates="task")
    claimed_by_token: Mapped["ApiToken | None"] = relationship(
        foreign_keys=[claimed_by_token_id]
    )

    @property
    def claimed_by_token_name(self) -> str | None:
        if self.claimed_by_token is None:
            return None
        return self.claimed_by_token.name
