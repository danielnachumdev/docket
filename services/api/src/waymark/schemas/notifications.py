from datetime import datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from waymark.schemas.tasks import ArtifactCreate, ArtifactOut

# Emitted notification kinds (in-app feed). claim_renewed is intentionally never emitted.
NOTIFICATION_KINDS: tuple[str, ...] = (
    "status_changed",
    "commented",
    "mentioned",
    "shared",
    "invite_accepted",
    "artifact_added",
    "task_updated",
    "claimed",
    "released",
)
ALLOWED_NOTIFICATION_KINDS: frozenset[str] = frozenset(NOTIFICATION_KINDS)

# Sensible default: activity users care about; exclude claim/release lease noise.
DEFAULT_NOTIFICATION_KINDS: tuple[str, ...] = (
    "mentioned",
    "shared",
    "commented",
    "status_changed",
    "invite_accepted",
    "artifact_added",
    "task_updated",
)

NotificationSort = Literal["newest", "oldest"]
ALLOWED_NOTIFICATION_SORTS: frozenset[str] = frozenset({"newest", "oldest"})


class TaskWatchOut(BaseModel):
    watching: bool


class TaskCommentIn(BaseModel):
    """Text and/or attachments. Attachments alone are allowed (caption optional)."""

    body: str = Field(default="", max_length=8000)
    attachments: list[ArtifactCreate] | None = None

    @model_validator(mode="after")
    def require_body_or_attachments(self) -> Self:
        if not self.body.strip() and not (self.attachments or []):
            raise ValueError("Provide comment text and/or attachments")
        return self


class TaskCommentOut(BaseModel):
    id: int
    event_id: int | None = None
    task_id: str
    body: str
    refs: list[dict[str, Any]] = []
    mentioned_user_ids: list[int]
    author_user_id: int
    author_token_id: int | None = None
    author_token_name: str | None = None
    author_display_name: str
    author_email: str | None = None
    author_label: str
    attachments: list[ArtifactOut] = []
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
