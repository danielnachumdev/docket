# Docket

System of record for **human + agent** tasks. Humans use the web UI (and often WhatsApp via an external assistant); agents talk to the same state over a token-authenticated API. Docket owns the data — the AI stays external.

## Stack

- **API:** FastAPI + SQLAlchemy + Alembic + SQLite
- **UI:** Vite + React + TypeScript (`web/`)

## Local development

```bash
# API
uv sync --group dev
uv run alembic upgrade head
uv run docket
# → http://127.0.0.1:8000/api/health

# UI (separate terminal)
cd web && npm install && npm run dev
# → http://127.0.0.1:5173/  (proxies /api → :8000)
```

Copy `.env.example` to `.env` if you need to override defaults.

## Layout

| Path | Role |
|------|------|
| `src/docket/` | FastAPI app, models, RBAC seed |
| `alembic/` | Schema migrations |
| `web/` | SPA |
| `data/` | Local SQLite DB (gitignored) |

## Status

Scaffold + initial schema + RBAC seed. Auth, task API, and real UI come next.
