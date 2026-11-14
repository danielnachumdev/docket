from dataclasses import dataclass


@dataclass(frozen=True)
class TaskExportBundle:
    """Point-in-time zip audit pack for a single task."""

    data: bytes
    filename: str
    content_type: str = "application/zip"
