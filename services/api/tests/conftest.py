from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_path = tmp_path / "test.db"
    artifact_root = tmp_path / "artifacts"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("ARTIFACT_STORAGE", "local")
    monkeypatch.setenv("ARTIFACT_LOCAL_ROOT", str(artifact_root))
    from docket.config import get_settings
    from docket.db import Base, database
    import docket.models  # noqa: F401
    from docket.seed import rbac_seeder

    get_settings.cache_clear()
    database.rebind()
    Base.metadata.create_all(bind=database.engine)
    session = database.session()
    try:
        rbac_seeder.seed(session)
    finally:
        session.close()
    yield
    get_settings.cache_clear()
