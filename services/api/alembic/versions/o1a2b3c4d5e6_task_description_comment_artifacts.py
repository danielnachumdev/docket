"""rename tasks.body to description; comment_artifacts link table

Revision ID: o1a2b3c4d5e6
Revises: n1a2b3c4d5e6
Create Date: 2026-11-16 18:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "n1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))
    op.execute(sa.text("UPDATE tasks SET description = body"))
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("body")

    op.create_table(
        "comment_artifacts",
        sa.Column("comment_id", sa.Integer(), nullable=False),
        sa.Column("artifact_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["artifact_id"],
            ["artifacts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["comment_id"],
            ["task_comments.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("comment_id", "artifact_id"),
        sa.UniqueConstraint("artifact_id", name="uq_comment_artifacts_artifact_id"),
    )


def downgrade() -> None:
    op.drop_table("comment_artifacts")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("body", sa.Text(), nullable=True))
    op.execute(sa.text("UPDATE tasks SET body = description"))
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("description")
