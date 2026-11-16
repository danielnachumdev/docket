from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from waymark.schemas.notifications import TaskCommentOut
from waymark.schemas.tasks import TaskEventOut


class ActivityActorOut(BaseModel):
    user_id: int
    token_id: int | None = None
    label: str
    display_name: str | None = None
    email: str | None = None
    token_name: str | None = None


class ActivityItemOut(BaseModel):
    id: str
    kind: Literal["comment", "event"]
    created_at: datetime
    actor: ActivityActorOut
    comment: TaskCommentOut | None = None
    event: TaskEventOut | None = None


class ActivityFeedOut(BaseModel):
    items: list[ActivityItemOut]
    order: Literal["asc", "desc"] = "desc"
