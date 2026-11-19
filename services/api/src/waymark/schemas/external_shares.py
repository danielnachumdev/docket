from datetime import datetime

from pydantic import BaseModel, Field

from waymark.schemas.notifications import TaskCommentOut
from waymark.schemas.tasks import (
    ArtifactOut,
    TaskEventOut,
    TaskLinkOut,
    TaskOut,
)


class ExternalShareCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    expires_at: datetime | None = None


class ExternalShareUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    expires_at: datetime | None = None
    clear_expires_at: bool = False


class ExternalShareOut(BaseModel):
    id: int
    task_id: str
    name: str
    expires_at: datetime | None
    revoked_at: datetime | None
    created_by_user_id: int
    created_at: datetime


class ExternalShareCreatedOut(ExternalShareOut):
    token: str


class ExternalShareRotatedOut(ExternalShareOut):
    token: str


class ExternalShareDetailOut(BaseModel):
    task: TaskOut
    events: list[TaskEventOut]
    artifacts: list[ArtifactOut]
    children: list[TaskOut]
    links: list[TaskLinkOut]
    comments: list[TaskCommentOut]
