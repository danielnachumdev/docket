#!/usr/bin/env bash
# Full-page SPA screenshots via agent-browser for UI PR Proof.
#
# Capture only the surfaces the current PR needs — do not dump every route.
#
# Usage:
#   scripts/pr_screenshots/screenshots.sh OUTDIR --shots progress,tasks [--themes light dark]
#   WAYMARK_SHOTS=progress,task-detail scripts/pr_screenshots/screenshots.sh OUTDIR
#
# Built-in shot names → paths:
#   login          (logged-out; theme-neutral, once)
#   tasks          /
#   notifications  /notifications
#   artifacts      /artifacts
#   people         /people
#   account        /account
#   storage        /storage          (admin)
#   progress       /progress
#   task-detail    /tasks/<id>       (needs seed state or WAYMARK_DEMO_TASK_ID)
#
# New pages for a feature PR (extend without editing this script permanently):
#   --extra name:/path   or  WAYMARK_EXTRA_SHOTS=name:/path,other:/other
#
# Env:
#   WAYMARK_WEB_URL          default http://127.0.0.1:5173
#   WAYMARK_API_URL          default http://127.0.0.1:8000
#   WAYMARK_DEMO_VIEWPORT    default "1440 900"
#   WAYMARK_DEMO_EMAIL       login email (default ops@example.com)
#   WAYMARK_DEMO_PASSWORD    login password (default password1234)
#   WAYMARK_DEMO_STATE       seed state JSON (default /tmp/waymark-pr-demo/state.json)
#   WAYMARK_DEMO_TASK_ID     override task public_id for task-detail
#   WAYMARK_SHOTS            comma-separated shot names (required unless --shots)
#   WAYMARK_EXTRA_SHOTS      comma-separated name:/path extras
#   WAYMARK_THEMES           space/comma themes (default light dark)
#   XDG_RUNTIME_DIR          default /tmp/waymark-ab-runtime (WSL-friendly)
#
# Requires: agent-browser, seeded local API, Vite (or compose) web up.
# Dummy credentials only — never point at prod.
set -euo pipefail

OUT=${1:?usage: screenshots.sh OUTDIR --shots name[,name...] [--themes light dark] [--extra name:/path]}
shift

SHOTS_CSV=${WAYMARK_SHOTS:-}
THEMES_RAW=${WAYMARK_THEMES:-light dark}
EXTRA_CSV=${WAYMARK_EXTRA_SHOTS:-}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --shots)
      SHOTS_CSV=${2:?--shots needs a comma-separated list}
      shift 2
      ;;
    --themes)
      THEMES_RAW=${2:?--themes needs a value}
      shift 2
      ;;
    --extra)
      if [[ -n "$EXTRA_CSV" ]]; then
        EXTRA_CSV="${EXTRA_CSV},${2:?--extra needs name:/path}"
      else
        EXTRA_CSV=${2:?--extra needs name:/path}
      fi
      shift 2
      ;;
    light|dark|soft-*)
      # Back-compat: trailing theme tokens without --themes
      THEMES_RAW="$*"
      break
      ;;
    *)
      echo "unknown arg: $1" >&2
      echo "usage: screenshots.sh OUTDIR --shots progress,tasks [--themes light dark] [--extra name:/path]" >&2
      exit 1
      ;;
  esac
done

SHOTS_CSV=${SHOTS_CSV// /}
if [[ -z "$SHOTS_CSV" ]]; then
  echo "No shots selected. Pass --shots name,name or set WAYMARK_SHOTS." >&2
  echo "Built-ins: login tasks notifications artifacts people account storage progress task-detail" >&2
  echo "Agents: choose only surfaces changed by this PR (e.g. --shots progress)." >&2
  exit 1
fi

THEMES=${THEMES_RAW//,/ }
WEB=${WAYMARK_WEB_URL:-http://127.0.0.1:5173}
API=${WAYMARK_API_URL:-http://127.0.0.1:8000}
EMAIL=${WAYMARK_DEMO_EMAIL:-ops@example.com}
PASSWORD=${WAYMARK_DEMO_PASSWORD:-password1234}
STATE=${WAYMARK_DEMO_STATE:-/tmp/waymark-pr-demo/state.json}
VIEWPORT=${WAYMARK_DEMO_VIEWPORT:-1440 900}

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

declare -A BUILTIN_PATHS=(
  [tasks]=/
  [notifications]=/notifications
  [artifacts]=/artifacts
  [people]=/people
  [account]=/account
  [storage]=/storage
  [progress]=/progress
)

if [[ -n "$DETAIL_ID" ]]; then
  BUILTIN_PATHS[task-detail]="/tasks/$DETAIL_ID"
fi

declare -A EXTRA_PATHS=()
if [[ -n "$EXTRA_CSV" ]]; then
  IFS=',' read -r -a extra_items <<<"$EXTRA_CSV"
  for item in "${extra_items[@]}"; do
    [[ -z "$item" ]] && continue
    name=${item%%:*}
    path=${item#*:}
    if [[ -z "$name" || "$name" == "$path" || -z "$path" ]]; then
      echo "invalid --extra / WAYMARK_EXTRA_SHOTS entry: $item (want name:/path)" >&2
      exit 1
    fi
    EXTRA_PATHS[$name]=$path
  done
fi

path_for_shot() {
  local name=$1
  if [[ -n "${EXTRA_PATHS[$name]:-}" ]]; then
    echo "${EXTRA_PATHS[$name]}"
    return 0
  fi
  if [[ -n "${BUILTIN_PATHS[$name]:-}" ]]; then
    echo "${BUILTIN_PATHS[$name]}"
    return 0
  fi
  return 1
}

IFS=',' read -r -a SHOT_NAMES <<<"$SHOTS_CSV"
NEED_LOGIN_PAGE=0
NEED_AUTH=0
ROUTES=()
for name in "${SHOT_NAMES[@]}"; do
  [[ -z "$name" ]] && continue
  if [[ "$name" == "login" ]]; then
    NEED_LOGIN_PAGE=1
    continue
  fi
  if [[ "$name" == "task-detail" && -z "$DETAIL_ID" ]]; then
    echo "shot task-detail needs WAYMARK_DEMO_TASK_ID or seed state detail_task_id" >&2
    exit 1
  fi
  path=$(path_for_shot "$name") || {
    echo "unknown shot: $name" >&2
    echo "Built-ins: login tasks notifications artifacts people account storage progress task-detail" >&2
    echo "Or pass --extra name:/path" >&2
    exit 1
  }
  ROUTES+=("$name:$path")
  NEED_AUTH=1
done

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
  if ab snapshot -i 2>/dev/null | grep -Eqi 'Sign out|Log out|nav:|/artifacts|Inbox' \
    && ! ab snapshot -i 2>/dev/null | grep -Eqi 'Sign in to Waymark'; then
    return 0
  fi
  local snap
  snap=$(ab snapshot -i 2>/dev/null || true)
  local email_ref pass_ref submit_ref
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
  ab open "$WEB/" >/dev/null
  ab eval "document.cookie.split(';').forEach(c=>{const n=c.split('=')[0].trim();document.cookie=n+'=;path=/;max-age=0'})" >/dev/null 2>&1 || true
  ab eval "localStorage.clear();sessionStorage.clear()" >/dev/null 2>&1 || true
  ab open "$WEB/" >/dev/null
  ab wait 1500 >/dev/null
}

if [[ "$NEED_LOGIN_PAGE" -eq 1 ]]; then
  capture_login
  ab screenshot --full "$OUT/login.png" >/dev/null
  echo "wrote $OUT/login.png"
fi

if [[ "$NEED_AUTH" -eq 1 ]]; then
  login_spa
fi

set_theme() {
  local theme=$1
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
  [[ "$NEED_AUTH" -eq 1 ]] || continue
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
