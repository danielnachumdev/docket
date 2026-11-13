"""short base62 task public_ids

Revision ID: e7f8a9b0c1d2
Revises: e6f7a8b9c0d1
Create Date: 2026-11-13 22:55:00.000000

"""

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_PUBLIC_ID_LENGTH = 12


def _new_public_id(seen: set[str]) -> str:
    while True:
        value = "".join(secrets.choice(_ALPHABET) for _ in range(_PUBLIC_ID_LENGTH))
        if value not in seen:
            seen.add(value)
            return value


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM tasks ORDER BY id ASC")).fetchall()
    seen: set[str] = set()
    for (task_id,) in rows:
        conn.execute(
            sa.text("UPDATE tasks SET public_id = :public_id WHERE id = :id"),
            {"public_id": _new_public_id(seen), "id": int(task_id)},
        )

    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.alter_column(
            "public_id",
            existing_type=sa.String(length=36),
            type_=sa.String(length=_PUBLIC_ID_LENGTH),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.alter_column(
            "public_id",
            existing_type=sa.String(length=_PUBLIC_ID_LENGTH),
            type_=sa.String(length=36),
            existing_nullable=False,
        )
