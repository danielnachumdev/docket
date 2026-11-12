import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from docket.api.tokens.api_token_gateway import ApiTokenGateway
from docket.auth.rbac.rbac_gateway import RbacGateway
from docket.models import ApiToken, Role
from docket.security import api_token_hasher

_TOKEN_PREFIX = "dkt_"


@dataclass(frozen=True)
class MintedApiToken:
    record: ApiToken
    raw_token: str


class ApiTokenService:
    """Create, list, and revoke API tokens for a user."""

    def __init__(self, db: Session) -> None:
        self._gateway = ApiTokenGateway(db)
        self._rbac = RbacGateway(db)

    def list_for_user(
        self, user_id: int, *, include_revoked: bool = False
    ) -> list[ApiToken]:
        return self._gateway.list_by_user_id(user_id, include_revoked=include_revoked)

    def list_assignable_roles(self, user_id: int) -> list[Role]:
        user_perms = self._rbac.permission_codes_for_user(user_id)
        return [
            role
            for role in self._gateway.list_roles()
            if self._role_is_assignable(role.id, user_perms)
        ]

    def mint(
        self, user_id: int, *, name: str, role_id: int | None = None
    ) -> MintedApiToken:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
        if role_id is not None:
            self._require_assignable_role(user_id, role_id)

        raw = self._generate_raw_token()
        record = ApiToken(
            user_id=user_id,
            name=cleaned,
            token_hash=api_token_hasher.hash(raw),
            role_id=role_id,
        )
        self._gateway.add(record)
        self._gateway.commit()
        self._gateway.refresh(record)
        return MintedApiToken(record=record, raw_token=raw)

    def revoke(self, user_id: int, token_id: int) -> ApiToken:
        token = self._owned_token(user_id, token_id)
        if token.revoked_at is None:
            token.revoked_at = datetime.now(timezone.utc)
            self._gateway.commit()
            self._gateway.refresh(token)
        return token

    def role_name(self, role_id: int | None) -> str | None:
        if role_id is None:
            return None
        role = self._gateway.get_role(role_id)
        return role.name if role else None

    def _owned_token(self, user_id: int, token_id: int) -> ApiToken:
        token = self._gateway.get(token_id)
        if token is None or token.user_id != user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
        return token

    def _require_assignable_role(self, user_id: int, role_id: int) -> None:
        role = self._gateway.get_role(role_id)
        if role is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown role_id")
        user_perms = self._rbac.permission_codes_for_user(user_id)
        if not self._role_is_assignable(role_id, user_perms):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Role is not assignable for this user",
            )

    def _role_is_assignable(self, role_id: int, user_perms: set[str]) -> bool:
        return self._rbac.permission_codes_for_role(role_id) <= user_perms

    @staticmethod
    def _generate_raw_token() -> str:
        return f"{_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"
