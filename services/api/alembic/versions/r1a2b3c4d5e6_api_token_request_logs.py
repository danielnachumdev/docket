"""api token request usage logs

Revision ID: r1a2b3c4d5e6
Revises: q1a2b3c4d5e6
Create Date: 2026-11-18 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "q1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_token_request_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("client_ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=256), nullable=True),
        sa.ForeignKeyConstraint(
            ["token_id"], ["api_tokens.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_api_token_request_logs_token_id",
        "api_token_request_logs",
        ["token_id"],
    )
    op.create_index(
        "ix_api_token_request_logs_created_at",
        "api_token_request_logs",
        ["created_at"],
    )
    op.create_index(
        "ix_api_token_request_logs_token_created",
        "api_token_request_logs",
        ["token_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_api_token_request_logs_token_created",
        table_name="api_token_request_logs",
    )
    op.drop_index(
        "ix_api_token_request_logs_created_at",
        table_name="api_token_request_logs",
    )
    op.drop_index(
        "ix_api_token_request_logs_token_id",
        table_name="api_token_request_logs",
    )
    op.drop_table("api_token_request_logs")
