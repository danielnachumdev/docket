import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

_NICKNAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str | None
    display_name: str
    nickname: str | None = None


class ContactNicknamePatch(BaseModel):
    """Set or clear the caller's private nickname for a contact."""

    nickname: str | None = Field(default=...)

    @field_validator("nickname", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return None
        nickname = value.strip()
        if len(nickname) < 1 or len(nickname) > 32:
            raise ValueError("Nickname must be 1–32 characters")
        if not _NICKNAME_RE.fullmatch(nickname):
            raise ValueError(
                "Nickname may only contain letters, digits, and . _ -"
            )
        return nickname
