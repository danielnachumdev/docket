#!/usr/bin/env bash
# Attach PNG screenshots to a PR as comments (user-attachments URLs for Proof).
#
# Usage: scripts/pr_screenshots/attach_to_pr.sh PR_NUMBER OUTDIR
#
# Prefers: gh pr comment N --attach file.png
# Embed the resulting user-attachments URLs in the PR Proof section.
set -euo pipefail

PR=${1:?usage: attach_to_pr.sh PR_NUMBER OUTDIR}
OUT=${2:?usage: attach_to_pr.sh PR_NUMBER OUTDIR}

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required" >&2
  exit 1
fi

shopt -s nullglob
files=("$OUT"/*.png)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no PNGs in $OUT" >&2
  exit 1
fi

for f in "${files[@]}"; do
  name=$(basename "$f")
  echo "attaching $name → PR #$PR"
  gh pr comment "$PR" --body "PR Proof screenshot: \`$name\`" --attach "$f"
done

echo "Done. Copy user-attachments image URLs from the PR comments into Proof."
