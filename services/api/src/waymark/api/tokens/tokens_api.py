from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from waymark.api.tokens.api_token_service import ApiTokenService
from waymark.api.tokens.api_token_usage_service import ApiTokenUsageService
from waymark.auth import Principal, RequirePermission
from waymark.db import DbSession
from waymark.models import ApiToken, Role
from waymark.schemas import (
    ApiTokenCreate,
    ApiTokenCreatedOut,
    ApiTokenOut,
    RoleOut,
    TokenRequestPageOut,
    TokenUsageOut,
)

CanManageTokens = Annotated[Principal, Depends(RequirePermission("tokens:manage"))]


class TokensApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/tokens", tags=["tokens"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "",
            self.list_tokens,
            methods=["GET"],
            response_model=list[ApiTokenOut],
        )
        self.router.add_api_route(
            "/roles",
            self.list_assignable_roles,
            methods=["GET"],
            response_model=list[RoleOut],
        )
        self.router.add_api_route(
            "",
            self.create_token,
            methods=["POST"],
            response_model=ApiTokenCreatedOut,
            status_code=status.HTTP_201_CREATED,
        )
        self.router.add_api_route(
            "/{token_id}/revoke",
            self.revoke_token,
            methods=["POST"],
            response_model=ApiTokenOut,
        )
        self.router.add_api_route(
            "/{token_id}/usage",
            self.token_usage,
            methods=["GET"],
            response_model=TokenUsageOut,
        )
        self.router.add_api_route(
            "/{token_id}/requests",
            self.token_requests,
            methods=["GET"],
            response_model=TokenRequestPageOut,
        )

    def list_tokens(
        self,
        db: DbSession,
        principal: CanManageTokens,
        include_revoked: bool = Query(False),
    ) -> list[ApiTokenOut]:
        service = ApiTokenService(db)
        tokens = service.list_for_user(
            principal.user_id, include_revoked=include_revoked
        )
        return [self._token_out(service, token) for token in tokens]

    def list_assignable_roles(
        self, db: DbSession, principal: CanManageTokens
    ) -> list[Role]:
        return ApiTokenService(db).list_assignable_roles(principal.user_id)

    def create_token(
        self, body: ApiTokenCreate, db: DbSession, principal: CanManageTokens
    ) -> ApiTokenCreatedOut:
        service = ApiTokenService(db)
        minted = service.mint(principal.user_id, name=body.name, role_id=body.role_id)
        base = self._token_out(service, minted.record)
        return ApiTokenCreatedOut(**base.model_dump(), token=minted.raw_token)

    def revoke_token(
        self, token_id: int, db: DbSession, principal: CanManageTokens
    ) -> ApiTokenOut:
        service = ApiTokenService(db)
        token = service.revoke(principal.user_id, token_id)
        return self._token_out(service, token)

    def token_usage(
        self,
        token_id: int,
        db: DbSession,
        principal: CanManageTokens,
        window_days: int = Query(7, ge=1, le=90),
    ) -> TokenUsageOut:
        return ApiTokenUsageService(db).usage(
            principal.user_id, token_id, window_days=window_days
        )

    def token_requests(
        self,
        token_id: int,
        db: DbSession,
        principal: CanManageTokens,
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        window_days: int | None = Query(None, ge=1, le=90),
    ) -> TokenRequestPageOut:
        return ApiTokenUsageService(db).list_requests(
            principal.user_id,
            token_id,
            offset=offset,
            limit=limit,
            window_days=window_days,
        )

    @staticmethod
    def _token_out(service: ApiTokenService, token: ApiToken) -> ApiTokenOut:
        return ApiTokenOut(
            id=token.id,
            name=token.name,
            role_id=token.role_id,
            role_name=service.role_name(token.role_id),
            created_at=token.created_at,
            last_used_at=token.last_used_at,
            revoked_at=token.revoked_at,
        )


tokens_api = TokensApi()
