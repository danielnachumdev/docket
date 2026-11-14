"""backfill distinct sibling ranks for manual queue order

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-11-14 02:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RANK_GAP = 1000.0


def upgrade() -> None:
    conn = op.get_bind()
    tasks = sa.table(
        "tasks",
        sa.column("id", sa.Integer),
        sa.column("parent_task_id", sa.Integer),
        sa.column("priority", sa.Integer),
        sa.column("rank", sa.Float),
    )
    rows = list(
        conn.execute(
            sa.select(
                tasks.c.id,
                tasks.c.parent_task_id,
                tasks.c.priority,
                tasks.c.rank,
            )
        )
    )
    rows.sort(
        key=lambda row: (
            row.parent_task_id is not None,
            row.parent_task_id if row.parent_task_id is not None else 0,
            row.priority,
            row.rank,
            row.id,
        )
    )

    groups: dict[int | None, list[int]] = {}
    for row in rows:
        groups.setdefault(row.parent_task_id, []).append(row.id)

    for task_ids in groups.values():
        for index, task_id in enumerate(task_ids):
            conn.execute(
                sa.update(tasks)
                .where(tasks.c.id == task_id)
                .values(rank=_RANK_GAP * (index + 1))
            )


def downgrade() -> None:
    # Irreversible data backfill; ranks remain valid floats.
    pass
