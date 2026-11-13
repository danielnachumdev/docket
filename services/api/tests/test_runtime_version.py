import httpx
from fastapi.testclient import TestClient

from docket import __version__
from docket.api.version.version_api import version_api
from docket.config import get_settings
from docket.main import create_app
from docket.version_check import VersionCheckService


class _FailingGateway:
    def get_latest_release(self) -> dict:
        raise httpx.ConnectError("offline")


def test_running_version_falls_back_to_package() -> None:
    get_settings.cache_clear()
    assert get_settings().docket_version == ""
    assert get_settings().running_version == __version__


def test_running_version_prefers_baked_env(monkeypatch) -> None:
    monkeypatch.setenv("DOCKET_VERSION", "0.2.11")
    get_settings.cache_clear()
    assert get_settings().running_version == "0.2.11"


def test_health_reports_baked_version(monkeypatch) -> None:
    monkeypatch.setenv("DOCKET_VERSION", "0.2.11")
    get_settings.cache_clear()
    client = TestClient(create_app())
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "version": "0.2.11"}


def test_health_reports_package_version_without_bake() -> None:
    get_settings.cache_clear()
    client = TestClient(create_app())
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "version": __version__}


def test_version_api_reports_baked_running_version(monkeypatch) -> None:
    monkeypatch.setenv("DOCKET_VERSION", "0.2.11")
    get_settings.cache_clear()
    previous = version_api._service
    version_api._service = VersionCheckService(
        _FailingGateway(),  # type: ignore[arg-type]
        running_version=get_settings().running_version,
    )
    try:
        client = TestClient(create_app())
        res = client.get("/api/version")
        assert res.status_code == 200
        body = res.json()
        assert body["version"] == "0.2.11"
        assert body["update_available"] is False
        assert body["latest_version"] is None
    finally:
        version_api._service = previous
