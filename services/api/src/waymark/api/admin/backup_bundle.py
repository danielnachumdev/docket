from dataclasses import dataclass


@dataclass(frozen=True)
class BackupBundle:
    """Point-in-time zip of the full instance (SQLite + artifact blobs)."""

    data: bytes
    filename: str
    content_type: str = "application/zip"
