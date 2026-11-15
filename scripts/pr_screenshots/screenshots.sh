#!/usr/bin/env bash
# Full-page SPA screenshots via agent-browser for UI PR Proof.
#
# Usage: scripts/pr_screenshots/screenshots.sh OUTDIR [light|dark ...]
# Env:
#   WAYMARK_WEB_URL          default http://127.0.0.1:5173
#   WAYMARK_API_URL          default http://127.0.0.1:8000 (for state / health)
#   WAYMARK_DEMO_VIEWPORT    default "1440 900"
#   WAYMARK_DEMO_EMAIL       login email (default ops@example.com)
#   WAYMARK_DEMO_PASSWORD    login password (default password1234)
#   WAYMARK_DEMO_STATE       seed state JSON (default /tmp/waymark-pr-demo/state.json)
#   WAYMARK_DEMO_TASK_ID     override task public_id for detail shot
#   XDG_RUNTIME_DIR          default /tmp/waymark-ab-runtime (WSL-friendly)
#
# Requires: agent-browser, seeded local API, Vite (or compose) web up.
# Dummy credentials only — never point at prod.
set -euo pipefail

OUT=${1:?usage: screenshots.sh OUTDIR [light|dark ...]}
shift
THEMES=${*:-light dark}

WEB=${WAYMARK_WEB_URL:-http://127.0.0.1:5173}
API=${WAYMARK_API_URL:-http://127.0.0.1:8000}
EMAIL=${WAYMARK_DEMO_EMAIL:-ops@example.com}
PASSWORD=${WAYMARK_DEMO_PASSWORD:-password1234}
STATE=${WAYMARK_DEMO_STATE:-/tmp/waymark-pr-demo/state.json}
VIEWPORT=${WAYMARK_DEMO_VIEWPORT:-1440 900}

# WSL often exports XDG_RUNTIME_DIR=/run/user/$UID which is missing/unwritable.
_RUNTIME_FALLBACK=/tmp/waymark-ab-runtime
if [[ -z "${XDG_RUNTIME_DIR:-}" || ! -d "${XDG_RUNTIME_DIR}" || ! -w "${XDG_RUNTIME_DIR}" ]]; then
  export XDG_RUNTIME_DIR=$_RUNTIME_FALLBACK
fi
mkdir -p "$OUT" "$XDG_RUNTIME_DIR"

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser not found; install: npm i -g agent-browser && agent-browser install" >&2
  exit 1
fi

curl -fsS "$API/api/health" >/dev/null || {
  echo "API not reachable at $API — start: cd services/api && uv run waymark" >&2
  exit 1
}
curl -fsS "$WEB/" >/dev/null || {
  echo "Web not reachable at $WEB — start: cd services/web && npm run dev" >&2
  exit 1
}

DETAIL_ID=${WAYMARK_DEMO_TASK_ID:-}
if [[ -z "$DETAIL_ID" && -f "$STATE" ]]; then
  DETAIL_ID=$(jq -r '.detail_task_id // empty' "$STATE")
fi

SESSION=$(agent-browser session id --scope worktree --prefix waymark-pr 2>/dev/null || true)
AB=(agent-browser)
if [[ -n "$SESSION" ]]; then
  AB=(agent-browser --session "$SESSION")
fi

ab() { "${AB[@]}" "$@"; }

# shellcheck disable=SC2086
ab set viewport $VIEWPORT >/dev/null

login_spa() {
  ab open "$WEB/" >/dev/null
  ab wait 1500 >/dev/null
  # Already authenticated (session cookie)? Login page shows "Sign in to Waymark".
  if ab snapshot -i 2>/dev/null | grep -Eqi 'Sign out|Log out|nav:|/artifacts|Inbox' \
    && ! ab snapshot -i 2>/dev/null | grep -Eqi 'Sign in to Waymark'; then
    return 0
  fi
  local snap
  snap=$(ab snapshot -i 2>/dev/null || true)
  local email_ref pass_ref submit_ref
  # agent-browser refs look like: textbox "EMAIL" [required, ref=e5] or @e5
  email_ref=$(echo "$snap" | grep -Ei 'textbox "EMAIL"|textbox .*[Ee]mail|type="email"' | head -1 | grep -oE 'ref=e[0-9]+|@e[0-9]+' | head -1 | sed 's/^ref=/@/' || true)
  pass_ref=$(echo "$snap" | grep -Ei 'textbox "PASSWORD"|textbox .*[Pp]assword|type="password"' | head -1 | grep -oE 'ref=e[0-9]+|@e[0-9]+' | head -1 | sed 's/^ref=/@/' || true)
  submit_ref=$(echo "$snap" | grep -Ei 'button "Sign in"|button "Create' | head -1 | grep -oE 'ref=e[0-9]+|@e[0-9]+' | head -1 | sed 's/^ref=/@/' || true)
  if [[ -z "$email_ref" || -z "$pass_ref" || -z "$submit_ref" ]]; then
    echo "Could not find login form refs. Snapshot:" >&2
    echo "$snap" >&2
    exit 1
  fi
  ab fill "$email_ref" "$EMAIL" >/dev/null
  ab fill "$pass_ref" "$PASSWORD" >/dev/null
  ab click "$submit_ref" >/dev/null
  ab wait 2500 >/dev/null
}

capture_login() {
  # Logged-out login page (optional first shot).
  ab open "$WEB/" >/dev/null
  # Clear SPA session cookie for a clean login shot when possible.
  ab eval "document.cookie.split(';').forEach(c=>{const n=c.split('=')[0].trim();document.cookie=n+'=;path=/;max-age=0'})" >/dev/null 2>&1 || true
  ab eval "localStorage.clear();sessionStorage.clear()" >/dev/null 2>&1 || true
  ab open "$WEB/" >/dev/null
  ab wait 1500 >/dev/null
}

ROUTES=()
ROUTES+=("tasks:/")
ROUTES+=("notifications:/notifications")
ROUTES+=("artifacts:/artifacts")
ROUTES+=("people:/people")
ROUTES+=("account:/account")
if [[ -n "$DETAIL_ID" ]]; then
  ROUTES+=("task-detail:/tasks/$DETAIL_ID")
fi

# Optional logged-out login shot once (theme-neutral / light only).
if [[ "${WAYMARK_CAPTURE_LOGIN:-1}" == "1" ]]; then
  capture_login
  ab screenshot --full "$OUT/login.png" >/dev/null
fi

login_spa

set_theme() {
  local theme=$1
  # Server prefs win when authenticated — patch then set localStorage / data-theme.
  ab eval "
    localStorage.setItem('waymark.theme', '$theme');
    fetch('/api/me/preferences', {
      method: 'PATCH',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({theme: '$theme'})
    }).catch(() => {});
  " >/dev/null
  ab wait 800 >/dev/null
}

for theme in $THEMES; do
  set_theme "$theme"
  for route in "${ROUTES[@]}"; do
    name=${route%%:*}
    path=${route#*:}
    ab open "$WEB$path" >/dev/null
    ab eval "
      localStorage.setItem('waymark.theme', '$theme');
      document.documentElement.dataset.theme = '$theme';
    " >/dev/null
    ab wait 2000 >/dev/null
    ab screenshot --full "$OUT/$name-$theme.png" >/dev/null
    echo "wrote $OUT/$name-$theme.png"
  done
done

ls -1 "$OUT"
