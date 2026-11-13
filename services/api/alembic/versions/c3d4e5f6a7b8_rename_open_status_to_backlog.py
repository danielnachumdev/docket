"""rename open status to backlog

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-13 21:50:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE tasks SET status = 'backlog' WHERE status = 'open'")
    op.execute("UPDATE saved_views SET filter_key = 'backlog' WHERE filter_key = 'open'")


def downgrade() -> None:
    op.execute("UPDATE tasks SET status = 'open' WHERE status = 'backlog'")
    op.execute("UPDATE saved_views SET filter_key = 'open' WHERE filter_key = 'backlog'")
