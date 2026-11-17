from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from waymark.config import get_settings


class Database:
    """Engine and session factory; rebound when DATABASE_URL changes (tests)."""

    def __init__(self) -> None:
        self.engine: Engine
        self.SessionLocal: sessionmaker[Session]
        self.rebind()

    def rebind(self) -> None:
        previous = getattr(self, "engine", None)
        if previous is not None:
            previous.dispose()
        self.engine = self._make_engine()
        self.SessionLocal = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            future=True,
        )

    def rebind_after_file_replace(self, source: Path, dest: Path) -> None:
        """Dispose the engine, atomically replace ``dest`` with ``source``, rebind."""
        previous = getattr(self, "engine", None)
        if previous is not None:
            previous.dispose()
        dest.parent.mkdir(parents=True, exist_ok=True)
        source.replace(dest)
        self.engine = self._make_engine()
        self.SessionLocal = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            future=True,
        )

    def session(self) -> Session:
        return self.SessionLocal()

    def get_db(self) -> Generator[Session, None, None]:
        db = self.session()
        try:
            yield db
        finally:
            db.close()

    def _make_engine(self) -> Engine:
        settings = get_settings()
        connect_args = {}
        if settings.database_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        engine = create_engine(
            settings.database_url,
            connect_args=connect_args,
            future=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_pool_max_overflow,
            pool_timeout=settings.db_pool_timeout_seconds,
            pool_recycle=settings.db_pool_recycle_seconds,
            pool_pre_ping=True,
        )
        if settings.database_url.startswith("sqlite"):
            self._attach_sqlite_foreign_keys(engine)
        return engine

    def _attach_sqlite_foreign_keys(self, engine: Engine) -> None:
        @event.listens_for(engine, "connect")
        def _sqlite_pragma(dbapi_conn, _connection_record) -> None:  # noqa: ANN001
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()


database = Database()
