# AGENTS.md

Orientation for coding agents and contributors working in **docket**.

Product pitch for humans: [`README.md`](README.md). Keep marketing and “why try this” there — this file is the map.

---

## Orientation

| Question | Answer |
| -------- | ------ |
| What is this? | Agent-native task management: FastAPI + SQLite API, Vite/React/TS SPA; humans + agents share one ledger via API tokens + RBAC |
| Services | `services/api` (FastAPI), `services/web` (SPA + nginx) |
| API entry | `services/api` — `uv run docket` / image entrypoint runs Alembic then uvicorn |
| Migrations | `cd services/api && uv run alembic upgrade head` |
| SPA | `services/web` — Vite React TS; Compose nginx proxies `/api` → `api:8000` |
| Compose | Root [`compose.yml`](compose.yml) for local multi-service run |
| CI hub | Shared reusable workflows pinned `@latest` |
| Thin orchestrator | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| CAPA | [`capabilities.yaml`](capabilities.yaml) — run `capa install` (do not hand-edit generated `.cursor/` / `.claude/`) |
| Semver | PR labels `bumpPatch` / `bumpMinor` / `bumpMajor` / `noBump`; CD creates GitHub Releases + retags `latest` |
| Images | CD on `main` pushes `ghcr.io/danielnachumdev/docket-api` + `docket-web` (`:latest`, `:main`, `:<sha>`) |
| VPS deploy | [`danielnachumdev/docket-deploy`](https://github.com/danielnachumdev/docket-deploy) — Raft manifests only (not this repo) |
| Secrets | Never commit tokens, keys, live DB, or operator inventory; use dummy data in fixtures/PRs |

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

Compose: `docker compose up --build` → UI `http://127.0.0.1:8088/`. SQLite persists in the `docket-data` volume. Override `TOKEN_PEPPER` / `SESSION_SECRET` for non-dev use.

## Artifact storage

Blob-backed artifacts (`kind=file`) use a pluggable storage backend. Metadata stays in SQLite (`storage_key`, `content_type`); bytes live in storage.

| Env | Default | Meaning |
| --- | ------- | ------- |
| `ARTIFACT_STORAGE` | `local` | `local` or `gcs` |
| `ARTIFACT_LOCAL_ROOT` | `services/api/data/artifacts` | Root directory for local blobs |
| `ARTIFACT_MAX_BYTES` | `10485760` (10 MiB) | Max decoded `content_base64` payload; Compose nginx `client_max_body_size 10m` matches |
| `GCS_BUCKET` | _(empty)_ | Required when `ARTIFACT_STORAGE=gcs` |
| `GCS_PREFIX` | `artifacts` | Object key prefix in the bucket |

```bash
cd services/api
uv sync --extra gcs --group dev
export ARTIFACT_STORAGE=gcs
export GCS_BUCKET=your-bucket
```

Create file artifacts via JSON with `content_base64`. Content streams through `GET /api/tasks/{id}/artifacts/{artifact_id}/content`.

## Auth model

- **Authn:** `AuthnMiddleware` resolves session cookie or `Authorization: Bearer` into `request.state.principal`
- **Authz:** route `Depends(require("tasks:write"))` (etc.) checks RBAC for that principal
- **Invites:** after bootstrap, registration is invite-only (`users:admin` mints links)

## Conventions

- Prefer SQLite-lean schema; avoid heavyweight deps without need.
- Task history goes in `task_events`; relationships via `parent_task_id` + `task_links`.
- Public task identity is short `public_id` (API/URLs/sharing); `owner_task_number` is per-owner display `#N`.
- Authorization is RBAC (`permissions` / `roles` / `memberships`); API tokens may downscope via `role_id`.
- Each service owns its Dockerfile and runtime files under `services/<name>/`.
- Raft / host / TLS / live env live in **docket-deploy**; this repo ships product + GHCR images.

## After template bootstrap

1. Language lanes: `services/api/pyproject.toml` + `services/web/package.json` — keep `allow-empty` **off**.
2. Soft-protect `main`: require **`CI`** and **`Semver / Semver`**; Dependabot auto-merge per actions hub HOW-TO-USE.
3. Every PR needs exactly one of `bumpPatch` \| `bumpMinor` \| `bumpMajor` \| `noBump` (Dependabot gets `noBump`).
