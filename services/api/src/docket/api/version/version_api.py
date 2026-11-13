from fastapi import APIRouter

from docket.config import get_settings
from docket.schemas import VersionStatusOut
from docket.version_check import GithubReleasesGateway, VersionCheckService


class VersionApi:
    def __init__(self, service: VersionCheckService | None = None) -> None:
        self._service = service
        self.router = APIRouter(prefix="/api", tags=["version"])
        self._register_routes()

    def _register_routes(self) -> None:
        self.router.add_api_route(
            "/version",
            self.version_status,
            methods=["GET"],
            response_model=VersionStatusOut,
        )

    def version_status(self) -> VersionStatusOut:
        status = self._get_service().status()
        return VersionStatusOut(
            version=status.version,
            latest_version=status.latest_version,
            update_available=status.update_available,
            release_url=status.release_url,
        )

    def _get_service(self) -> VersionCheckService:
        if self._service is None:
            settings = get_settings()
            gateway = GithubReleasesGateway(
                owner=settings.github_repo_owner,
                repo=settings.github_repo_name,
            )
            self._service = VersionCheckService(
                gateway,
                running_version=settings.running_version,
                cache_ttl_seconds=settings.version_check_cache_ttl_seconds,
            )
        return self._service


version_api = VersionApi()
