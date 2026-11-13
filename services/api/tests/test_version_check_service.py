import httpx

from docket.version_check import GithubReleasesGateway, VersionCheckService


class _FakeGateway(GithubReleasesGateway):
    def __init__(self, payload: dict | Exception) -> None:
        super().__init__(owner="demo", repo="docket")
        self._payload = payload
        self.calls = 0

    def get_latest_release(self) -> dict:
        self.calls += 1
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def test_update_available_when_latest_newer() -> None:
    gateway = _FakeGateway(
        {
            "tag_name": "v0.2.0",
            "html_url": "https://github.com/demo/docket/releases/tag/v0.2.0",
        }
    )
    service = VersionCheckService(gateway, running_version="0.1.0", cache_ttl_seconds=60)
    status = service.status()
    assert status.version == "0.1.0"
    assert status.latest_version == "0.2.0"
    assert status.update_available is True
    assert status.release_url.endswith("/v0.2.0")


def test_no_update_when_latest_equal() -> None:
    gateway = _FakeGateway({"tag_name": "v0.1.0", "html_url": "https://example.com/r"})
    service = VersionCheckService(gateway, running_version="0.1.0")
    status = service.status()
    assert status.update_available is False
    assert status.latest_version == "0.1.0"


def test_github_failure_fails_soft() -> None:
    gateway = _FakeGateway(httpx.ConnectError("offline"))
    service = VersionCheckService(gateway, running_version="0.1.0")
    status = service.status()
    assert status.version == "0.1.0"
    assert status.latest_version is None
    assert status.update_available is False
    assert status.release_url is None


def test_cache_avoids_repeat_fetch() -> None:
    clock = {"now": 100.0}
    gateway = _FakeGateway({"tag_name": "v0.3.0", "html_url": "https://example.com/r"})
    service = VersionCheckService(
        gateway,
        running_version="0.1.0",
        cache_ttl_seconds=30,
        clock=lambda: clock["now"],
    )
    first = service.status()
    clock["now"] = 120.0
    second = service.status()
    assert gateway.calls == 1
    assert first == second
    clock["now"] = 131.0
    service.status()
    assert gateway.calls == 2
