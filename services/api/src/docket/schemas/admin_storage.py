from pydantic import BaseModel, Field


class StorageKindTotalOut(BaseModel):
    kind: str
    artifact_count: int
    stored_bytes: int


class StorageUploaderOut(BaseModel):
    user_id: int
    email: str | None
    display_name: str
    artifact_count: int
    stored_bytes: int


class StorageTaskOut(BaseModel):
    task_id: str
    task_number: int
    title: str
    artifact_count: int
    stored_bytes: int


class StorageOverviewOut(BaseModel):
    """Owner storage overview. stored_bytes = blob size for kind=file only."""

    size_note: str = Field(
        default=(
            "stored_bytes counts blob storage for kind=file artifacts; "
            "text, link, and json kinds contribute 0 (content lives in SQLite)."
        )
    )
    artifact_count: int
    stored_bytes: int
    by_kind: list[StorageKindTotalOut]
    by_uploader: list[StorageUploaderOut]
    top_tasks: list[StorageTaskOut]
