from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from docket.db import Base


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
