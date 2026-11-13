"""task_completion_outcomes

Revision ID: a1cbf7fb8529
Revises: f1a2b3c4d5e6
Create Date: 2026-11-13 21:19:23.852885

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1cbf7fb8529"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(
            sa.Column(
                "require_artifact_on_done",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(sa.Column("outcome_schema_json", sa.Text(), nullable=True))
        batch.add_column(sa.Column("outcome_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("outcome_json")
        batch.drop_column("outcome_schema_json")
        batch.drop_column("require_artifact_on_done")
