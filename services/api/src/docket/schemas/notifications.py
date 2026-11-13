from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskWatchOut(BaseModel):
    watching: bool


class TaskCommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class TaskCommentOut(BaseModel):
    event_id: int
    task_id: int
    body: str
    mentioned_user_ids: list[int]


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    task_id: int | None
    kind: str
    title: str
    body: str | None
    payload_json: str | None
    actor_user_id: int
    read_at: datetime | None
    created_at: datetime


class UnreadCountOut(BaseModel):
    count: int
