from pydantic import BaseModel, Field


class BackupImportResultOut(BaseModel):
    """Summary returned after a destructive instance restore."""

    exported_at: str
    artifacts_restored: int
    artifact_bytes: int
    artifacts_missing: int = 0
    message: str = Field(
        default=(
            "Instance data was replaced from the backup. "
            "Active sessions may need to re-authenticate if user ids changed."
        )
    )
