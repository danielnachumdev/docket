import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from docket import __version__
from docket.version_check.github_releases_gateway import GithubReleasesGateway
from docket.version_check.version_compare import is_newer, normalize_version


@dataclass(frozen=True)
class VersionStatus:
    version: str
    latest_version: str | None
    update_available: bool
    release_url: str | None


@dataclass
class _CacheEntry:
    status: VersionStatus
    expires_at: float


class VersionCheckService:
    """Resolve running vs GitHub latest release, with a short in-memory cache."""

    def __init__(
        self,
        gateway: GithubReleasesGateway,
        *,
        cache_ttl_seconds: float = 900.0,
        running_version: str | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._gateway = gateway
        self._cache_ttl_seconds = cache_ttl_seconds
        self._running_version = running_version or __version__
        self._clock = clock or time.monotonic
        self._lock = threading.Lock()
        self._cache: _CacheEntry | None = None

    def status(self) -> VersionStatus:
        now = self._clock()
        with self._lock:
            if self._cache is not None and self._cache.expires_at > now:
                return self._cache.status
            status = self._fetch_status()
            self._cache = _CacheEntry(
                status=status,
                expires_at=now + self._cache_ttl_seconds,
            )
            return status

    def clear_cache(self) -> None:
        with self._lock:
            self._cache = None

    def _fetch_status(self) -> VersionStatus:
        running = normalize_version(self._running_version)
        try:
            payload = self._gateway.get_latest_release()
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            return VersionStatus(
                version=running,
                latest_version=None,
                update_available=False,
                release_url=None,
            )
        tag = payload.get("tag_name")
        if not isinstance(tag, str) or not tag.strip():
            return VersionStatus(
                version=running,
                latest_version=None,
                update_available=False,
                release_url=None,
            )
        latest = normalize_version(tag)
        html_url = payload.get("html_url")
        release_url = html_url if isinstance(html_url, str) else None
        return VersionStatus(
            version=running,
            latest_version=latest,
            update_available=is_newer(latest, running),
            release_url=release_url,
        )
