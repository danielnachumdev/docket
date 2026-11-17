from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import TimeoutError as SATimeoutError

from waymark.config import get_settings
from waymark.db import database, pool_timeout_handler
from waymark.db.pool_timeout_handler import PoolTimeoutHandler
from waymark.main import create_app
from tests.helpers import bootstrap_owner


def test_pool_settings_defaults() -> None:
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.db_pool_size == 15
    assert settings.db_pool_max_overflow == 30
    assert settings.db_pool_timeout_seconds == 5.0
    assert settings.db_pool_recycle_seconds == 1800


def test_pool_settings_from_env(monkeypatch) -> None:
    monkeypatch.setenv("DB_POOL_SIZE", "8")
    monkeypatch.setenv("DB_POOL_MAX_OVERFLOW", "12")
    monkeypatch.setenv("DB_POOL_TIMEOUT_SECONDS", "3.5")
    monkeypatch.setenv("DB_POOL_RECYCLE_SECONDS", "900")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.db_pool_size == 8
    assert settings.db_pool_max_overflow == 12
    assert settings.db_pool_timeout_seconds == 3.5
    assert settings.db_pool_recycle_seconds == 900
    get_settings.cache_clear()


def test_engine_applies_pool_settings(monkeypatch) -> None:
    monkeypatch.setenv("DB_POOL_SIZE", "7")
    monkeypatch.setenv("DB_POOL_MAX_OVERFLOW", "11")
    monkeypatch.setenv("DB_POOL_TIMEOUT_SECONDS", "4")
    get_settings.cache_clear()
    database.rebind()
    assert database.engine.pool.size() == 7
    assert database.engine.pool._max_overflow == 11
    assert database.engine.pool._timeout == 4.0
    get_settings.cache_clear()
    database.rebind()


def test_pool_timeout_maps_to_http_503() -> None:
    app = FastAPI()
    pool_timeout_handler.register(app)

    @app.get("/boom")
    def boom() -> None:
        raise SATimeoutError(
            "QueuePool limit of size 5 overflow 10 reached, "
            "connection timed out, timeout 30.00"
        )

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/boom")
    assert res.status_code == 503
    assert res.json() == {"detail": PoolTimeoutHandler.DETAIL}


def test_app_registers_pool_timeout_handler() -> None:
    client = TestClient(create_app())
    bootstrap_owner(client)
    # Smoke: normal DB path still works after handler registration.
    assert client.get("/api/tasks").status_code == 200
