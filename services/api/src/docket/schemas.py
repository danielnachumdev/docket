from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str | None
    display_name: str


class BootstrapIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: str
    password: str


class AuthStatusOut(BaseModel):
    bootstrapped: bool
    user: UserOut | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    body: str | None = None
    priority: int = Field(default=3, ge=1, le=4)
    parent_task_id: int | None = None
    due_at: datetime | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    body: str | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    rank: float | None = None
    parent_task_id: int | None = None
    due_at: datetime | None = None
    clear_due_at: bool = False
    clear_parent: bool = False


class TaskStatusIn(BaseModel):
    status: str = Field(pattern="^(open|in_progress|blocked|done|cancelled)$")


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: int
    parent_task_id: int | None
    title: str
    body: str | None
    status: str
    priority: int
    rank: float
    source: str
    due_at: datetime | None
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
    payload_json: str | None
    created_at: datetime


class ArtifactCreate(BaseModel):
    kind: str = Field(pattern="^(link|text|json)$")
    title: str = Field(min_length=1, max_length=300)
    content_text: str | None = None


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


class TaskDetailOut(BaseModel):
    task: TaskOut
    events: list[TaskEventOut]
    artifacts: list[ArtifactOut]
    children: list[TaskOut]
