"""contact nicknames (per-viewer aliases)

Revision ID: i1a2b3c4d5e6
Revises: h1a2b3c4d5e6
Create Date: 2026-11-14 13:10:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "h1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contact_nicknames",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("viewer_user_id", sa.Integer(), nullable=False),
        sa.Column("contact_user_id", sa.Integer(), nullable=False),
        sa.Column("nickname", sa.String(length=32), nullable=False),
        sa.Column("nickname_normalized", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["viewer_user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["contact_user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "viewer_user_id",
            "contact_user_id",
            name="uq_contact_nickname_edge",
        ),
        sa.UniqueConstraint(
            "viewer_user_id",
            "nickname_normalized",
            name="uq_contact_nickname_viewer",
        ),
    )


def downgrade() -> None:
    op.drop_table("contact_nicknames")
