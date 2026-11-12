# Docket

System of record for **human + agent** tasks. Humans use the web UI (and often WhatsApp via an external assistant); agents talk to the same state over a token-authenticated API. Docket owns the data — the AI stays external.

## Stack

- **API:** FastAPI + SQLAlchemy + Alembic + SQLite (`services/api`)
- **UI:** Vite + React + TypeScript (`services/web`)
- **Local deploy:** `compose.yml` (API + nginx SPA)

## Layout

```text
services/
  api/     FastAPI app, Alembic, Dockerfile
  web/     SPA, nginx Dockerfile
compose.yml
```

## Local development (without Docker)

```bash
# API
cd services/api
uv sync --group dev
uv run alembic upgrade head
uv run docket
# → http://127.0.0.1:8000/api/health

# UI (separate terminal)
cd services/web
npm install && npm run dev
# → http://127.0.0.1:5173/  (proxies /api → :8000)
```

## Local deployment (Compose)

```bash
docker compose up --build
# UI  → http://127.0.0.1:8088/
# API → http://127.0.0.1:8000/api/health
```

SQLite persists in the `docket-data` volume. Override `TOKEN_PEPPER` via env for non-dev use. Host port `8088` avoids common local `8080` clashes.

## Status

Human UI + session auth + task CRUD/status/archive/artifacts/history are in.
Next: authn middleware + `Depends(require("perm"))` refactor; agent API tokens.
