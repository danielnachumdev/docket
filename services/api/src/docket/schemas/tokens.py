from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role_id: int | None = None


class ApiTokenOut(BaseModel):
    id: int
    name: str
    role_id: int | None
    role_name: str | None = None
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiTokenCreatedOut(ApiTokenOut):
    token: str
