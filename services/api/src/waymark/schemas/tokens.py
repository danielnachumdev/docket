from datetime import datetime
from typing import Literal

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


class TokenUsageBucketOut(BaseModel):
    bucket: datetime
    count: int


class TokenUsageStatusOut(BaseModel):
    status_class: Literal["2xx", "3xx", "4xx", "5xx", "other"]
    count: int


class TokenUsagePathOut(BaseModel):
    path: str
    count: int


class TokenUsageOut(BaseModel):
    window_days: int
    generated_at: datetime
    granularity: Literal["hour", "day"]
    total_requests: int
    requests_by_bucket: list[TokenUsageBucketOut]
    status_mix: list[TokenUsageStatusOut]
    top_paths: list[TokenUsagePathOut]


class TokenRequestLogOut(BaseModel):
    id: int
    created_at: datetime
    method: str
    path: str
    status_code: int
    client_ip: str | None
    user_agent: str | None


class TokenRequestPageOut(BaseModel):
    total: int
    offset: int
    limit: int
    has_more: bool
    items: list[TokenRequestLogOut]
