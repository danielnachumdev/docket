from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from docket.db import Base


class ContactNickname(Base):
    """Per-viewer private alias on a contact edge (viewer → contact user)."""

    __tablename__ = "contact_nicknames"
    __table_args__ = (
        UniqueConstraint(
            "viewer_user_id",
            "contact_user_id",
            name="uq_contact_nickname_edge",
        ),
        UniqueConstraint(
            "viewer_user_id",
            "nickname_normalized",
            name="uq_contact_nickname_viewer",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    viewer_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    contact_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    nickname: Mapped[str] = mapped_column(String(32))
    nickname_normalized: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
