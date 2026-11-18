# AGENTS.md — scripts/pr_screenshots

PII-safe local seed + `agent-browser` SPA screenshots for **UI PR Proof**. Dummy data only (`*@example.com`, fabricated titles). Never point these helpers at prod or a live operator DB.

## Agent rule (required)

**Do not capture or attach every demo route.** Choose only the SPA surfaces this PR changes (or that prove the bugfix). A new page → `--shots that-page` (and `--extra` if it is not in the built-in catalog yet). A small UI tweak on task detail → `--shots task-detail`, not the whole app.

Attach those selected PNGs into the **PR description** Proof section via `attach_to_pr.sh` (`gh pr edit --attach`). **Never** use `gh pr comment --attach` for Proof screenshots.

## Flow

```bash
# 1) Local API + Vite (or Compose UI on :8088)
cd services/api && uv run waymark          # :8000
cd services/web && npm run dev             # :5173

# 2) Seed deterministic demo users/tasks/artifacts
python3 scripts/pr_screenshots/seed_demo.py
# → writes /tmp/waymark-pr-demo/state.json (detail_task_id, etc.)

# 3) Capture ONLY the shots this PR needs (light + dark by default)
scripts/pr_screenshots/screenshots.sh /tmp/waymark-pr-shots --shots progress
# New route not in the catalog yet:
# scripts/pr_screenshots/screenshots.sh /tmp/waymark-pr-shots \
#   --shots my-page --extra my-page:/my-page

# 4) Attach those files into the PR body Proof (not comments)
scripts/pr_screenshots/attach_to_pr.sh <PR_NUMBER> \
  /tmp/waymark-pr-shots/progress-light.png#Progress\ light \
  /tmp/waymark-pr-shots/progress-dark.png#Progress\ dark
```

## Built-in `--shots` names

`login` · `tasks` · `notifications` · `artifacts` · `collaborators` · `account` · `storage` · `progress` · `task-detail` (needs seed `detail_task_id` or `WAYMARK_DEMO_TASK_ID`)

Add permanent catalog entries in `screenshots.sh` when a page ships on `main`. Until then use `--extra name:/path` (or `WAYMARK_EXTRA_SHOTS`).

## Notes

- **Auth:** session cookie. Seed bootstraps `ops@example.com` / `password1234` when the API is empty; otherwise logs in. Invitee `alex@example.com` is created via invite when missing. Override with `WAYMARK_DEMO_*` env vars.
- **Themes:** `WAYMARK_THEMES` or `--themes light dark`. SPA key `localStorage['waymark.theme']`; shots also `PATCH /api/me/preferences`.
- **WSL / agent-browser:** `screenshots.sh` rewrites unwritable `XDG_RUNTIME_DIR` to `/tmp/waymark-ab-runtime`.
- **Compose UI:** `WAYMARK_WEB_URL=http://127.0.0.1:8088`.
- If login fails on an already-bootstrapped DB, use matching demo credentials or a throwaway SQLite — do not wipe prod.
