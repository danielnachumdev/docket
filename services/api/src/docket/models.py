from __future__ import annotations

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


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    tokens: Mapped[list[ApiToken]] = relationship(back_populates="user")
    memberships: Mapped[list[Membership]] = relationship(back_populates="user")


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(String(255), default="")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(String(255), default="")
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"))
    permission_id: Mapped[int] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE")
    )


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role_id: Mapped[int | None] = mapped_column(
        ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="tokens")
    role: Mapped[Role | None] = relationship()


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    parent_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(500))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # open | in_progress | blocked | done | cancelled
    status: Mapped[str] = mapped_column(String(32), default="open")
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
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    parent: Mapped[Task | None] = relationship(remote_side=[id], backref="children")
    events: Mapped[list[TaskEvent]] = relationship(back_populates="task")
    artifacts: Mapped[list[Artifact]] = relationship(back_populates="task")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "role_id",
            "scope_type",
            "scope_task_id",
            name="uq_membership_scope",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"))
    # global | task
    scope_type: Mapped[str] = mapped_column(String(20), default="global")
    scope_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="memberships")
    role: Mapped[Role] = relationship()


class TaskLink(Base):
    __tablename__ = "task_links"
    __table_args__ = (
        UniqueConstraint("from_task_id", "to_task_id", "kind", name="uq_task_link"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    from_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    to_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    # blocks | related | duplicate_of | ...
    kind: Mapped[str] = mapped_column(String(32))
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TaskEvent(Base):
    __tablename__ = "task_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    # created | updated | status_changed | claimed | released | commented |
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

    task: Mapped[Task] = relationship(back_populates="events")


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    # link | text | file | json
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(300))
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    task: Mapped[Task] = relationship(back_populates="artifacts")
