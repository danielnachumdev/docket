"""reassign task ranks into one owner-wide work-queue sequence

Revision ID: m1a2b3c4d5e6
Revises: l1a2b3c4d5e6
Create Date: 2026-11-15 12:00:00.000000

Strategy
--------
Previously ``rank`` was sibling-scoped (per ``parent_task_id``). After this
revision, ``rank`` is owner-global: lower = do first across the whole owned
queue; ``parent_task_id`` is hierarchy only.

For each ``owner_user_id``, build a total order by depth-first walk of the
current sibling-scoped trees:

1. Collect all tasks for the owner (archived and active).
2. Treat rows whose parent is missing or outside the owner set as roots.
3. Sort each sibling group by existing ``rank`` then ``id``.
4. DFS: emit parent, then children in that sibling order.
5. Pack dense fractional ranks ``1000, 2000, …`` in walk order.

Relative sibling order and “parent before its children” from the old trees
are preserved; cross-branch interleaving becomes a defined DFS sequence.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "m1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "l1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RANK_GAP = 1000.0


def upgrade() -> None:
    conn = op.get_bind()
    tasks = sa.table(
        "tasks",
        sa.column("id", sa.Integer),
        sa.column("owner_user_id", sa.Integer),
        sa.column("parent_task_id", sa.Integer),
        sa.column("rank", sa.Float),
    )
    rows = list(
        conn.execute(
            sa.select(
                tasks.c.id,
                tasks.c.owner_user_id,
                tasks.c.parent_task_id,
                tasks.c.rank,
            )
        )
    )

    by_owner: dict[int, list] = {}
    for row in rows:
        by_owner.setdefault(row.owner_user_id, []).append(row)

    for owner_rows in by_owner.values():
        ordered_ids = _depth_first_order(owner_rows)
        for index, task_id in enumerate(ordered_ids):
            conn.execute(
                sa.update(tasks)
                .where(tasks.c.id == task_id)
                .values(rank=_RANK_GAP * (index + 1))
            )


def _depth_first_order(owner_rows: list) -> list[int]:
    by_id = {row.id: row for row in owner_rows}
    children: dict[int | None, list] = {}
    for row in owner_rows:
        parent_id = row.parent_task_id
        if parent_id is not None and parent_id not in by_id:
            parent_id = None
        children.setdefault(parent_id, []).append(row)

    for group in children.values():
        group.sort(key=lambda row: (float(row.rank), row.id))

    ordered: list[int] = []

    def visit(parent_id: int | None) -> None:
        for row in children.get(parent_id, []):
            ordered.append(row.id)
            visit(row.id)

    visit(None)
    return ordered


def downgrade() -> None:
    # Irreversible data rewrite; ranks remain valid floats but not sibling-scoped.
    pass
