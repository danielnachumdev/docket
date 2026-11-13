from datetime import datetime

from pydantic import BaseModel, Field


class WebhookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=2048)
    event_types: list[str] | None = None


class WebhookUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    url: str | None = Field(default=None, min_length=1, max_length=2048)
    event_types: list[str] | None = None
    enabled: bool | None = None


class WebhookOut(BaseModel):
    id: int
    name: str
    url: str
    event_types: list[str]
    enabled: bool
    created_at: datetime
    last_delivered_at: datetime | None
    last_status_code: int | None
    last_error: str | None


class WebhookCreatedOut(WebhookOut):
    secret: str
