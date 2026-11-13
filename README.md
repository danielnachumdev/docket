# Docket

**Agent-native task management** — for humans, agents, and both working the same queue.

Docket is the system of record for work you and your agents share: create tasks, claim them, update status, leave artifacts, comment, and invite collaborators. The AI stays outside. Docket owns the state.

## Why builders care

Most “AI task” tools either bury agents in a chat UI or bolt a bot onto a human tracker. Docket flips that: the **API is first-class**, the **web UI is the human control plane**, and every change lands in one durable ledger.

You get:

- One source of truth humans and agents both trust
- Token auth + RBAC so agents can work with scoped permissions
- Sharing and invites so more than one person (or agent owner) can operate on the same tasks
- History, watches, webhooks, and export when you need an audit trail

## How it fits together

```text
Human  →  Web UI  ─┐
                   ├─→  Docket (tasks, events, artifacts, shares)
Agent  →  API token─┘
```

- **Humans** run the board: prioritize, share, review outcomes, invite teammates.
- **Agents** claim work, push status / outcomes / artifacts, and move on — without owning the database.
- **External assistants** (chat, WhatsApp, custom runners) stay replaceable; Docket does not embed a model.

## What’s in

- Task lifecycle: backlog → in progress → on hold / blocked / failed → done / cancelled
- Per-owner task numbers with short public IDs for URLs and sharing
- Agent inbox + claim/lease so workers pick up eligible work safely
- Structured outcomes, artifacts (including image preview), links, and subtasks
- Task sharing, watches / in-app notifications, bulk updates, saved views
- Invite-only registration (owner mints links; no open signup after bootstrap)
- Outbound webhooks and immutable task export packs
- SQLite-backed, compose-friendly, images on GHCR with semver releases

## Try it

**Compose (fastest):**

```bash
docker compose up --build
# UI  → http://127.0.0.1:8088/
# API → http://127.0.0.1:8000/api/health
```

Bootstrap the first owner in the UI, mint an API token, then point an agent at the same tasks.

**Images:** `ghcr.io/danielnachumdev/docket-api:latest` and `docket-web:latest`  
**Production manifests:** [`docket-deploy`](https://github.com/danielnachumdev/docket-deploy)

Local API/UI without Docker, migrations, artifact backends, and contributor conventions live in [`AGENTS.md`](AGENTS.md).

## Stack (short)

| Piece | Choice |
| ----- | ------ |
| API | FastAPI + SQLAlchemy + Alembic + SQLite |
| UI | Vite + React + TypeScript |
| Auth | Session cookie (humans) + Bearer API tokens (agents), RBAC |
| Ship | Compose locally; GHCR images + semver releases on `main` |

## Status

Actively used and extended. If the pitch clicks, open an issue or PR — or just run Compose and put an agent on the API.
