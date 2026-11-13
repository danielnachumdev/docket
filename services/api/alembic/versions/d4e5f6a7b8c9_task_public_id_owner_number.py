"""task public_id and per-owner number

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-13 22:30:00.000000

"""

from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.add_column(sa.Column("public_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("owner_task_number", sa.Integer(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, owner_user_id FROM tasks "
            "ORDER BY owner_user_id ASC, created_at ASC, id ASC"
        )
    ).fetchall()

    counters: dict[int, int] = {}
    for task_id, owner_user_id in rows:
        owner = int(owner_user_id)
        counters[owner] = counters.get(owner, 0) + 1
        conn.execute(
            sa.text(
                "UPDATE tasks SET public_id = :public_id, "
                "owner_task_number = :owner_task_number WHERE id = :id"
            ),
            {
                "public_id": str(uuid4()),
                "owner_task_number": counters[owner],
                "id": int(task_id),
            },
        )

    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.alter_column("public_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.alter_column(
            "owner_task_number", existing_type=sa.Integer(), nullable=False
        )
        batch_op.create_unique_constraint("uq_task_public_id", ["public_id"])
        batch_op.create_unique_constraint(
            "uq_task_owner_number", ["owner_user_id", "owner_task_number"]
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.drop_constraint("uq_task_owner_number", type_="unique")
        batch_op.drop_constraint("uq_task_public_id", type_="unique")
        batch_op.drop_column("owner_task_number")
        batch_op.drop_column("public_id")
