# AGENTS.md

Orientation for coding agents working in **docket**.

Product pitch: [`README.md`](README.md).

---

## Orientation

| Question | Answer |
| -------- | ------ |
| What is this? | Task system of record: FastAPI + SQLite API, Vite/React/TS SPA; agents via API tokens + RBAC |
| API package | `src/docket/` — entry `docket.main:app` / `uv run docket` |
| Migrations | Alembic (`uv run alembic upgrade head`) |
| SPA | `web/` — Vite React TS; proxy `/api` → API in dev |
| CI hub | Shared reusable workflows pinned `@latest` |
| Thin orchestrator | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| CAPA | [`capabilities.yaml`](capabilities.yaml) — run `capa install` (do not hand-edit generated `.cursor/` / `.claude/`) |
| Semver | **Omitted** until the repo publishes releases |
| Secrets | Never commit tokens, keys, live DB, or operator inventory; use dummy data in fixtures/PRs |

## Conventions

- Prefer SQLite-lean schema; avoid heavyweight deps without need.
- Task history goes in `task_events`; relationships via `parent_task_id` + `task_links`.
- Authorization is RBAC (`permissions` / `roles` / `memberships`); API tokens may downscope via `role_id`.
- Deploy wiring lives in a **private** deploy repo later — not here.

## After template bootstrap

1. Language lanes are real (`pyproject.toml` + `web/package.json`) — keep `allow-empty` **off** in `ci.yml`.
2. Soft-protect `main`: require **`CI / CI`**; Dependabot auto-merge settings per actions hub HOW-TO-USE.
