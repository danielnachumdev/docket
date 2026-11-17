import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Unicode letters/digits (handles Hebrew etc.) plus . _ - ; no spaces (mention handle).
_NICKNAME_RE = re.compile(r"^[\w.-]+$", re.UNICODE)


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
        nickname = value.strip().lstrip("@")
        if len(nickname) < 1 or len(nickname) > 32:
            raise ValueError("Nickname must be 1–32 characters")
        if not _NICKNAME_RE.fullmatch(nickname):
            raise ValueError(
                "Nickname may use letters (any language), digits, and . _ - "
                "(no spaces)"
            )
        return nickname
