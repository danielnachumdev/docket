from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str | None
    display_name: str


class UserUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("display_name must not be blank")
        return cleaned


class BootstrapIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=200)


class LoginIn(BaseModel):
    email: str
    password: str


class AuthStatusOut(BaseModel):
    bootstrapped: bool
    user: UserOut | None = None
    permissions: list[str] = []
