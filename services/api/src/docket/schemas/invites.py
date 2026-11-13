from datetime import datetime

from pydantic import BaseModel, Field


class InviteCreate(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=320)


class InviteOut(BaseModel):
    id: int
    email: str | None
    expires_at: datetime
    consumed_at: datetime | None
    consumed_by_user_id: int | None
    created_at: datetime


class InviteCreatedOut(InviteOut):
    token: str
    register_path: str


class InvitePreviewOut(BaseModel):
    valid: bool
    email: str | None
    email_bound: bool
    expires_at: datetime


class RegisterIn(BaseModel):
    token: str = Field(min_length=8, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=200)
