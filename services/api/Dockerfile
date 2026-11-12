# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS build
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    uv sync --frozen --no-install-project --no-dev

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
COPY alembic ./alembic
COPY alembic.ini ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.12.10-slim-bookworm AS runtime
WORKDIR /app

RUN groupadd --system --gid 1000 docket \
    && useradd --system --uid 1000 --gid docket --home /app --shell /usr/sbin/nologin docket \
    && mkdir -p /data \
    && chown docket:docket /data

COPY --from=build --chown=docket:docket /app /app
COPY --chown=docket:docket entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PATH="/app/.venv/bin:$PATH" \
    DATABASE_URL=sqlite:////data/docket.db \
    PYTHONUNBUFFERED=1

USER docket
EXPOSE 8000
VOLUME ["/data"]
ENTRYPOINT ["/app/entrypoint.sh"]
