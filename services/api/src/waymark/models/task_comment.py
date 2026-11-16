from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from waymark.db import Base

if TYPE_CHECKING:
    from waymark.models.comment_artifact import CommentArtifact
    from waymark.models.task import Task
    from waymark.models.user import User


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    author_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text)
    refs_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    task: Mapped["Task"] = relationship(back_populates="comments")
    author: Mapped["User"] = relationship()
    artifact_links: Mapped[list["CommentArtifact"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan"
    )
