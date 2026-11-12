from fastapi.testclient import TestClient

from docket.main import create_app


def test_health() -> None:
    client = TestClient(create_app())
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "version" in body
