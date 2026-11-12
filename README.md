# Docket

System of record for **human + agent** tasks. Humans use the web UI (and often WhatsApp via an external assistant); agents talk to the same state over a token-authenticated API. Docket owns the data — the AI stays external.

## Stack

- **API:** FastAPI + SQLAlchemy + Alembic + SQLite (`services/api`)
- **UI:** Vite + React + TypeScript (`services/web`)
- **Local deploy:** `compose.yml` (API + nginx SPA)
- **Images (CD on `main`):** `ghcr.io/danielnachumdev/docket-api` + `docket-web`
- **VPS:** Raft manifests in [`docket-deploy`](https://github.com/danielnachumdev/docket-deploy) (`docket.danielnachum.com`)

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

## Artifact storage

Blob-backed artifacts (`kind=file`) use a pluggable storage backend. Metadata stays in SQLite (`storage_key`, `content_type`); bytes live in storage.

| Env | Default | Meaning |
| --- | ------- | ------- |
| `ARTIFACT_STORAGE` | `local` | `local` or `gcs` |
| `ARTIFACT_LOCAL_ROOT` | `services/api/data/artifacts` | Root directory for local blobs |
| `GCS_BUCKET` | _(empty)_ | Required when `ARTIFACT_STORAGE=gcs` |
| `GCS_PREFIX` | `artifacts` | Object key prefix in the bucket |

Local (default) needs no extra deps. GCS needs the optional extra and ADC/credentials as usual:

```bash
cd services/api
uv sync --extra gcs --group dev
export ARTIFACT_STORAGE=gcs
export GCS_BUCKET=your-bucket
# optional: GCS_PREFIX=artifacts
```

Create file artifacts via JSON with `content_base64` (SPA encodes the chosen file). Content is always streamed through `GET /api/tasks/{id}/artifacts/{artifact_id}/content` (local and GCS).

## Auth model

- **Authn:** `AuthnMiddleware` resolves session cookie or `Authorization: Bearer` into `request.state.principal`
- **Authz:** route `Depends(require("tasks:write"))` (etc.) checks RBAC for that principal

## Status

Human UI + task API + authn/authz + API token mint/list/revoke (`tokens:manage`) are in.
Next: claim/lease, links, and Instinct/agent docs.
