from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from docket.config import get_settings
from docket.db import Base
import docket.models  # noqa: F401 — register metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


class AlembicMigrationRunner:
    def run(self) -> None:
        if context.is_offline_mode():
            self._run_offline()
        else:
            self._run_online()

    def _run_offline(self) -> None:
        url = config.get_main_option("sqlalchemy.url")
        context.configure(
            url=url,
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    def _run_online(self) -> None:
        connectable = engine_from_config(
            config.get_section(config.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
            )
            with context.begin_transaction():
                context.run_migrations()


AlembicMigrationRunner().run()
