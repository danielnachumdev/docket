from pydantic import BaseModel


class VersionStatusOut(BaseModel):
    version: str
    latest_version: str | None = None
    update_available: bool = False
    release_url: str | None = None
