"""artifact byte_size

Revision ID: j1a2b3c4d5e6
Revises: i1a2b3c4d5e6
Create Date: 2026-11-14 13:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "i1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("artifacts") as batch:
        batch.add_column(
            sa.Column(
                "byte_size",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("artifacts") as batch:
        batch.drop_column("byte_size")
