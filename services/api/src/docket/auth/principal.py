from __future__ import annotations

from dataclasses import dataclass

from docket.models import ApiToken, User


@dataclass(frozen=True)
class Principal:
    """Authenticated actor: a user, optionally via an API token."""

    user: User
    token: ApiToken | None = None

    @property
    def user_id(self) -> int:
        return self.user.id

    @property
    def token_id(self) -> int | None:
        return self.token.id if self.token else None
