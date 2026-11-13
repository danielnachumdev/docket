from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

ALLOWED_FILTER_KEYS = frozenset(
    {
        "my_open",
        "due_soon",
        "on_hold_stale",
        "claimed",
        "active",
        "all",
        "open",
        "in_progress",
        "blocked",
        "on_hold",
        "done",
        "cancelled",
    }
)


class SavedViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    filter_key: str = Field(min_length=1, max_length=64)
    query: str = Field(default="", max_length=500)
    position: int = Field(default=0, ge=0, le=10_000)


class SavedViewUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    filter_key: str | None = Field(default=None, min_length=1, max_length=64)
    query: str | None = Field(default=None, max_length=500)
    position: int | None = Field(default=None, ge=0, le=10_000)


class SavedViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    filter_key: str
    query: str
    position: int
    created_at: datetime
    updated_at: datetime
