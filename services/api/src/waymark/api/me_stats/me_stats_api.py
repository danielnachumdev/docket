from typing import Annotated

from fastapi import APIRouter, Depends, Query

from waymark.api.me_stats.me_stats_service import MeStatsService
from waymark.auth import Principal, RequirePermission
from waymark.db import DbSession
from waymark.schemas.user_stats import UserStatsOut

CanReadTasks = Annotated[Principal, Depends(RequirePermission("tasks:read"))]


class MeStatsApi:
    def __init__(self) -> None:
        self.router = APIRouter(prefix="/api/me", tags=["stats"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/stats",
            self.get_stats,
            methods=["GET"],
            response_model=UserStatsOut,
        )

    def get_stats(
        self,
        db: DbSession,
        principal: CanReadTasks,
        window_days: Annotated[int, Query(ge=1, le=90)] = 7,
    ) -> UserStatsOut:
        return MeStatsService(db).build(principal.user_id, window_days=window_days)


me_stats_api = MeStatsApi()
