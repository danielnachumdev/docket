from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from waymark.db import Base


class CommentArtifact(Base):
    """Links a task comment to an artifact attached inline on that comment."""

    __tablename__ = "comment_artifacts"
    __table_args__ = (
        UniqueConstraint("artifact_id", name="uq_comment_artifacts_artifact_id"),
    )

    comment_id: Mapped[int] = mapped_column(
        ForeignKey("task_comments.id", ondelete="CASCADE"), primary_key=True
    )
    artifact_id: Mapped[int] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), primary_key=True
    )

    comment: Mapped["TaskComment"] = relationship(back_populates="artifact_links")
    artifact: Mapped["Artifact"] = relationship()
