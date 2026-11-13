from fastapi.testclient import TestClient

from docket.api.version.version_api import version_api
from docket.main import create_app
from docket.version_check import VersionStatus


class _StubService:
    def __init__(self, status: VersionStatus) -> None:
        self._fixed = status

    def status(self) -> VersionStatus:
        return self._fixed


def _with_stub(status: VersionStatus):
    previous = version_api._service
    version_api._service = _StubService(status)  # type: ignore[assignment]
    try:
        yield TestClient(create_app())
    finally:
        version_api._service = previous


def test_version_endpoint_returns_status() -> None:
    status = VersionStatus(
        version="0.1.0",
        latest_version="0.2.0",
        update_available=True,
        release_url="https://github.com/demo/docket/releases/tag/v0.2.0",
    )
    gen = _with_stub(status)
    client = next(gen)
    try:
        res = client.get("/api/version")
        assert res.status_code == 200
        assert res.json() == {
            "version": "0.1.0",
            "latest_version": "0.2.0",
            "update_available": True,
            "release_url": "https://github.com/demo/docket/releases/tag/v0.2.0",
        }
    finally:
        gen.close()


def test_version_endpoint_fails_soft_when_latest_unknown() -> None:
    status = VersionStatus(
        version="0.1.0",
        latest_version=None,
        update_available=False,
        release_url=None,
    )
    gen = _with_stub(status)
    client = next(gen)
    try:
        res = client.get("/api/version")
        assert res.status_code == 200
        body = res.json()
        assert body["version"] == "0.1.0"
        assert body["update_available"] is False
        assert body["latest_version"] is None
    finally:
        gen.close()
