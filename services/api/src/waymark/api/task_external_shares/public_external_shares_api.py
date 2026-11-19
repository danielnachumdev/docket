from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Query, Response

from waymark.api.task_external_shares.public_external_share_service import (
    PublicExternalShareService,
)
from waymark.db import DbSession
from waymark.schemas.activity import ActivityFeedOut
from waymark.schemas.external_shares import ExternalShareDetailOut


class PublicExternalSharesApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/public/shares", tags=["public-external-shares"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/{token}",
            self.get_detail,
            methods=["GET"],
            response_model=ExternalShareDetailOut,
        )
        self.router.add_api_route(
            "/{token}/activity",
            self.list_activity,
            methods=["GET"],
            response_model=ActivityFeedOut,
        )
        self.router.add_api_route(
            "/{token}/artifacts/{artifact_id}/content",
            self.get_artifact_content,
            methods=["GET"],
        )

    def get_detail(self, token: str, db: DbSession) -> ExternalShareDetailOut:
        return PublicExternalShareService(db).get_detail(token)

    def list_activity(
        self,
        token: str,
        db: DbSession,
        order: Literal["asc", "desc"] = Query(default="desc"),
    ) -> ActivityFeedOut:
        return PublicExternalShareService(db).list_activity(token, order=order)

    def get_artifact_content(self, token: str, artifact_id: int, db: DbSession) -> Response:
        content = PublicExternalShareService(db).get_artifact_content(token, artifact_id)
        kind = "inline" if content.is_image else "attachment"
        disposition = f"{kind}; filename*=UTF-8''{quote(content.filename)}"
        return Response(
            content=content.data,
            media_type=content.response_media_type,
            headers={"Content-Disposition": disposition},
        )


public_external_shares_api = PublicExternalSharesApi()
