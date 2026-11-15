"""membership viewer_task_number for sharee-local #

Revision ID: k1a2b3c4d5e6
Revises: j1a2b3c4d5e6
Create Date: 2026-11-15 10:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "j1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("memberships") as batch:
        batch.add_column(sa.Column("viewer_task_number", sa.Integer(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT m.id, m.user_id
            FROM memberships m
            WHERE m.scope_type = 'task' AND m.scope_task_id IS NOT NULL
            ORDER BY m.user_id ASC, m.id ASC
            """
        )
    ).fetchall()

    counters: dict[int, int] = {}
    for membership_id, user_id in rows:
        user_id = int(user_id)
        if user_id not in counters:
            owned_max = conn.execute(
                sa.text(
                    "SELECT COALESCE(MAX(owner_task_number), 0) FROM tasks "
                    "WHERE owner_user_id = :uid"
                ),
                {"uid": user_id},
            ).scalar()
            counters[user_id] = int(owned_max or 0)
        counters[user_id] += 1
        conn.execute(
            sa.text(
                "UPDATE memberships SET viewer_task_number = :n WHERE id = :id"
            ),
            {"n": counters[user_id], "id": int(membership_id)},
        )

    with op.batch_alter_table("memberships") as batch:
        batch.create_unique_constraint(
            "uq_membership_viewer_task_number",
            ["user_id", "viewer_task_number"],
        )


def downgrade() -> None:
    with op.batch_alter_table("memberships") as batch:
        batch.drop_constraint("uq_membership_viewer_task_number", type_="unique")
        batch.drop_column("viewer_task_number")
