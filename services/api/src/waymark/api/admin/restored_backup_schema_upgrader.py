"""Bring a restored SQLite backup onto the live Alembic head schema."""

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config

from waymark.legacy.task_event_payload_rewriter import task_event_payload_rewriter


class RestoredBackupSchemaUpgrader:
    """Normalize legacy body columns/payloads, then Alembic upgrade or stamp.

    Test DBs (and some ad-hoc restores) ship tables via ``create_all`` with
    no ``alembic_version`` row — ``upgrade`` from base would recreate tables
    and fail. Those get stamped at head after ad-hoc normalization. Real
    backups that tracked a revision run ``upgrade head``.
    """

    def __init__(self, *, db_path: Path, database_url: str, api_root: Path) -> None:
        self._db_path = db_path
        self._database_url = database_url
        self._api_root = api_root

    def upgrade_to_head(self) -> None:
        self._normalize_legacy_body_schema()
        cfg = Config(str(self._api_root / "alembic.ini"))
        cfg.set_main_option("script_location", str(self._api_root / "alembic"))
        cfg.set_main_option("sqlalchemy.url", self._database_url)
        if self._alembic_current_revision():
            command.upgrade(cfg, "head")
        else:
            command.stamp(cfg, "head")

    def _alembic_current_revision(self) -> str | None:
        conn = sqlite3.connect(str(self._db_path))
        try:
            row = conn.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='alembic_version'"
            ).fetchone()
            if row is None:
                return None
            version = conn.execute(
                "SELECT version_num FROM alembic_version LIMIT 1"
            ).fetchone()
            if version is None or not version[0]:
                return None
            return str(version[0])
        finally:
            conn.close()

    def _normalize_legacy_body_schema(self) -> None:
        conn = sqlite3.connect(str(self._db_path))
        try:
            self._rename_tasks_body_column(conn)
            self._rewrite_updated_event_payloads(conn)
            self._ensure_commentor_artifacts_write(conn)
            conn.commit()
        finally:
            conn.close()

    def _rename_tasks_body_column(self, conn: sqlite3.Connection) -> None:
        task_cols = {
            row[1] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()
        }
        if "body" in task_cols and "description" not in task_cols:
            conn.execute("ALTER TABLE tasks RENAME COLUMN body TO description")
            return
        if "body" not in task_cols or "description" not in task_cols:
            return
        conn.execute(
            "UPDATE tasks SET description = body "
            "WHERE (description IS NULL OR description = '') "
            "AND body IS NOT NULL"
        )
        conn.execute("ALTER TABLE tasks DROP COLUMN body")

    def _rewrite_updated_event_payloads(self, conn: sqlite3.Connection) -> None:
        events = conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='task_events'"
        ).fetchone()
        if events is None:
            return
        rows = conn.execute(
            "SELECT id, payload_json FROM task_events "
            "WHERE type = 'updated' AND payload_json IS NOT NULL"
        ).fetchall()
        for event_id, payload_json in rows:
            rewritten = task_event_payload_rewriter.rename_key(
                payload_json, from_key="body", to_key="description"
            )
            if rewritten is None:
                continue
            conn.execute(
                "UPDATE task_events SET payload_json = ? WHERE id = ?",
                (rewritten, event_id),
            )

    def _ensure_commentor_artifacts_write(self, conn: sqlite3.Connection) -> None:
        role_id = conn.execute(
            "SELECT id FROM roles WHERE name = 'commentor'"
        ).fetchone()
        perm_id = conn.execute(
            "SELECT id FROM permissions WHERE code = 'artifacts:write'"
        ).fetchone()
        if role_id is None or perm_id is None:
            return
        exists = conn.execute(
            "SELECT 1 FROM role_permissions "
            "WHERE role_id = ? AND permission_id = ?",
            (role_id[0], perm_id[0]),
        ).fetchone()
        if exists:
            return
        conn.execute(
            "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
            (role_id[0], perm_id[0]),
        )
