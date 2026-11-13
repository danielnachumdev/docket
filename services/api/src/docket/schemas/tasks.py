from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    body: str | None = None
    priority: int = Field(default=3, ge=1, le=4)
    parent_task_id: int | None = None
    due_at: datetime | None = None
    external_id: str | None = Field(default=None, min_length=1, max_length=255)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    body: str | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    rank: float | None = None
    parent_task_id: int | None = None
    due_at: datetime | None = None
    clear_due_at: bool = False
    clear_parent: bool = False
    external_id: str | None = Field(default=None, min_length=1, max_length=255)
    clear_external_id: bool = False


class TaskStatusIn(BaseModel):
    status: str = Field(
        pattern="^(open|in_progress|blocked|on_hold|failed|done|cancelled)$"
    )
    last_error: str | None = Field(default=None, max_length=4000)


class TaskClaimIn(BaseModel):
    lease_seconds: int = Field(default=900, ge=1, le=86_400)


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: int
    parent_task_id: int | None
    external_id: str | None
    title: str
    body: str | None
    status: str
    priority: int
    rank: float
    source: str
    due_at: datetime | None
    claimed_by_token_id: int | None
    claimed_by_token_name: str | None = None
    claim_expires_at: datetime | None
    last_error: str | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    type: str
    actor_user_id: int
    actor_token_id: int | None
    actor_token_name: str | None = None
    actor_role_name: str | None = None
    payload_json: str | None
    created_at: datetime


class ArtifactCreate(BaseModel):
    kind: str = Field(pattern="^(link|text|file|json)$")
    title: str = Field(min_length=1, max_length=300)
    content_text: str | None = None
    # Base64-encoded bytes for kind=file (and optional blob replace on update).
    content_base64: str | None = None
    content_type: str | None = Field(default=None, max_length=120)


class ArtifactUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    content_text: str | None = None
    content_base64: str | None = None
    content_type: str | None = Field(default=None, max_length=120)


class ArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    kind: str
    title: str
    content_text: str | None
    storage_key: str | None
    content_type: str | None
    created_by_user_id: int
    created_at: datetime


class TaskLinkCreate(BaseModel):
    to_task_id: int
    kind: str = Field(
        min_length=1,
        max_length=32,
        pattern=r"^[a-z][a-z0-9_]*$",
        description="Extensible link kind, e.g. blocks, related, duplicate_of",
    )


class TaskLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_task_id: int
    to_task_id: int
    kind: str
    created_by_user_id: int
    created_by_token_id: int | None
    created_at: datetime


class TaskDetailOut(BaseModel):
    task: TaskOut
    events: list[TaskEventOut]
    artifacts: list[ArtifactOut]
    children: list[TaskOut]
    links: list[TaskLinkOut] = []
    watching: bool = False


class TaskShareCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(pattern="^(viewer|editor)$")


class TaskShareOut(BaseModel):
    id: int
    user_id: int
    email: str | None
    display_name: str
    role: str
    created_at: datetime
