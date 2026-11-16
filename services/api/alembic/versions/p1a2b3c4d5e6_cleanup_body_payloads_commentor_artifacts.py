"""Normalize updated-event payloads body→description; grant commentor artifacts:write.

Revision ID: p1a2b3c4d5e6
Revises: o1a2b3c4d5e6
Create Date: 2026-11-16 21:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from waymark.legacy.task_event_payload_rewriter import task_event_payload_rewriter

revision: str = "p1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "o1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    _rewrite_updated_event_keys(from_key="body", to_key="description")
    _ensure_commentor_artifacts_write()


def downgrade() -> None:
    _rewrite_updated_event_keys(from_key="description", to_key="body")


def _rewrite_updated_event_keys(*, from_key: str, to_key: str) -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, payload_json FROM task_events "
            "WHERE type = 'updated' AND payload_json IS NOT NULL"
        )
    ).fetchall()
    for event_id, payload_json in rows:
        rewritten = task_event_payload_rewriter.rename_key(
            payload_json, from_key=from_key, to_key=to_key
        )
        if rewritten is None:
            continue
        conn.execute(
            sa.text("UPDATE task_events SET payload_json = :payload WHERE id = :id"),
            {"payload": rewritten, "id": event_id},
        )


def _ensure_commentor_artifacts_write() -> None:
    conn = op.get_bind()
    role_id = conn.execute(
        sa.text("SELECT id FROM roles WHERE name = 'commentor'")
    ).scalar()
    perm_id = conn.execute(
        sa.text("SELECT id FROM permissions WHERE code = 'artifacts:write'")
    ).scalar()
    if role_id is None or perm_id is None:
        return
    exists = conn.execute(
        sa.text(
            "SELECT 1 FROM role_permissions "
            "WHERE role_id = :role_id AND permission_id = :perm_id"
        ),
        {"role_id": role_id, "perm_id": perm_id},
    ).scalar()
    if exists:
        return
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "VALUES (:role_id, :perm_id)"
        ),
        {"role_id": role_id, "perm_id": perm_id},
    )
