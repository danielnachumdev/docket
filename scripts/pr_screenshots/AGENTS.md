# AGENTS.md — scripts/pr_screenshots

PII-safe local seed + `agent-browser` SPA screenshots for **UI PR Proof**. Dummy data only (`*@example.com`, fabricated titles). Never point these helpers at prod or a live operator DB.

## Flow

```bash
# 1) Local API + Vite (or Compose UI on :8088)
cd services/api && uv run waymark          # :8000
cd services/web && npm run dev             # :5173

# 2) Seed deterministic demo users/tasks/artifacts
python3 scripts/pr_screenshots/seed_demo.py
# → writes /tmp/waymark-pr-demo/state.json (detail_task_id, etc.)

# 3) Capture full-page PNGs (light + dark by default)
scripts/pr_screenshots/screenshots.sh /tmp/waymark-pr-shots light dark

# 4) Attach to the PR, then embed user-attachments URLs in Proof
scripts/pr_screenshots/attach_to_pr.sh <PR_NUMBER> /tmp/waymark-pr-shots
```

## Notes

- **Auth:** session cookie. Seed bootstraps `ops@example.com` / `password1234` when the API is empty; otherwise logs in. Invitee `alex@example.com` is created via invite when missing. Override with `WAYMARK_DEMO_*` env vars.
- **Themes:** SPA key `localStorage['waymark.theme']` (`light` / `dark` / soft builtins). Screenshots also `PATCH /api/me/preferences` so server prefs do not override the shot.
- **WSL / agent-browser:** `screenshots.sh` rewrites unwritable `XDG_RUNTIME_DIR` (common `/run/user/...` on WSL) to `/tmp/waymark-ab-runtime`.
- **Compose UI:** `WAYMARK_WEB_URL=http://127.0.0.1:8088`.
- If login fails on an already-bootstrapped DB, use matching demo credentials or a throwaway SQLite — do not wipe prod.
