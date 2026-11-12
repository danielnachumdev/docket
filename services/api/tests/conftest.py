from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    # Settings and engine are cached / module-level — reset for each test.
    from docket.config import get_settings
    from docket import db as db_mod
    import docket.models  # noqa: F401

    get_settings.cache_clear()
    db_mod.engine = db_mod._make_engine()
    db_mod.SessionLocal = db_mod.sessionmaker(
        bind=db_mod.engine,
        autoflush=False,
        autocommit=False,
        future=True,
    )
    db_mod.Base.metadata.create_all(bind=db_mod.engine)
    from docket.seed import seed_rbac

    session = db_mod.SessionLocal()
    try:
        seed_rbac(session)
    finally:
        session.close()
    yield
    get_settings.cache_clear()
