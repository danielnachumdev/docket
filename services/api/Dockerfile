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

ARG WAYMARK_VERSION=

RUN groupadd --system --gid 1000 waymark \
    && useradd --system --uid 1000 --gid waymark --home /app --shell /usr/sbin/nologin waymark \
    && mkdir -p /data \
    && chown waymark:waymark /data

COPY --from=build --chown=waymark:waymark /app /app
COPY --chown=waymark:waymark entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PATH="/app/.venv/bin:$PATH" \
    DATABASE_URL=sqlite:////data/waymark.db \
    PYTHONUNBUFFERED=1 \
    WAYMARK_VERSION=${WAYMARK_VERSION}

USER waymark
EXPOSE 8000
VOLUME ["/data"]
ENTRYPOINT ["/app/entrypoint.sh"]
