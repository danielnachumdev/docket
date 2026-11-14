from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TaskWatchOut(BaseModel):
    watching: bool


class TaskCommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class TaskCommentOut(BaseModel):
    id: int
    event_id: int | None = None
    task_id: str
    body: str
    refs: list[dict[str, Any]] = []
    mentioned_user_ids: list[int]
    author_user_id: int
    author_display_name: str
    author_email: str | None = None
    created_at: datetime
    updated_at: datetime
    can_edit: bool = False


class MentionableUserOut(BaseModel):
    user_id: int
    email: str | None
    display_name: str
    handle: str
    nickname: str | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    task_id: str | None
    kind: str
    title: str
    body: str | None
    payload_json: str | None
    actor_user_id: int
    read_at: datetime | None
    created_at: datetime


class UnreadCountOut(BaseModel):
    count: int
