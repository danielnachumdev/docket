# AGENTS.md

Orientation for coding agents working in **docket**.

Product pitch: [`README.md`](README.md).

---

## Orientation

| Question | Answer |
| -------- | ------ |
| What is this? | Task system of record: FastAPI + SQLite API, Vite/React/TS SPA; agents via API tokens + RBAC |
| Services | `services/api` (FastAPI), `services/web` (SPA + nginx) |
| API entry | `services/api` — `uv run docket` / image entrypoint runs Alembic then uvicorn |
| Migrations | `cd services/api && uv run alembic upgrade head` |
| SPA | `services/web` — Vite React TS; Compose nginx proxies `/api` → `api:8000` |
| Compose | Root [`compose.yml`](compose.yml) for local multi-service run |
| CI hub | Shared reusable workflows pinned `@latest` |
| Thin orchestrator | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| CAPA | [`capabilities.yaml`](capabilities.yaml) — run `capa install` (do not hand-edit generated `.cursor/` / `.claude/`) |
| Semver | **Omitted** until the repo publishes releases |
| Images | CD on `main` pushes `ghcr.io/danielnachumdev/docket-api` + `docket-web` (`:main` and `:<sha>`) |
| VPS deploy | [`danielnachumdev/docket-deploy`](https://github.com/danielnachumdev/docket-deploy) — Raft manifests only (not this repo) |
| Secrets | Never commit tokens, keys, live DB, or operator inventory; use dummy data in fixtures/PRs |

## Conventions

- Prefer SQLite-lean schema; avoid heavyweight deps without need.
- Task history goes in `task_events`; relationships via `parent_task_id` + `task_links`.
- Authorization is RBAC (`permissions` / `roles` / `memberships`); API tokens may downscope via `role_id`.
- Each service owns its Dockerfile and runtime files under `services/<name>/`.
- Raft / host / TLS / live env live in **docket-deploy**; this repo ships product + GHCR images.

## After template bootstrap

1. Language lanes: `services/api/pyproject.toml` + `services/web/package.json` — keep `allow-empty` **off**.
2. Soft-protect `main`: require **`CI`**; Dependabot auto-merge per actions hub HOW-TO-USE.
