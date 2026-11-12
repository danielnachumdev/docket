# template

**GitHub template** for new repositories.

Use this when starting a repo so CI, agent docs, and CAPA are already wired — then replace the placeholder product text with the real project.

## What’s included

| Piece | Role |
| ----- | ---- |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Thin CI → shared reusable workflows (`@latest`) |
| [`.github/dependabot.yml`](.github/dependabot.yml) | Weekly pip / npm / github-actions (no `noBump` — Semver off) |
| [`.github/CODEOWNERS`](.github/CODEOWNERS) | Default code owner (edit to your GitHub handle) |
| [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) | Feature request (Background / Motivation / Requirements / AC) + industry-standard bug report (Description / Reproduce / Expected / Actual / Environment) |
| [`AGENTS.md`](AGENTS.md) | Orientation for coding agents |
| [`capabilities.yaml`](capabilities.yaml) | CAPA source of truth ([capa.sh](https://capa.sh/)) |

**actions HOW-TO-USE already applied on this repo:** thin `ci.yml` `@latest`, CODEOWNERS + Dependabot, `dependencies` label, soft `main` protection (`CI / CI`, reviews count 0, code-owner reviews off for Dependabot merge, admin bypass), security alerts/scanning, Dependabot auto-merge + `allow_auto_merge`. Semver / `cd.yml` / bump labels omitted on purpose.

## Create a repo from this template

1. On GitHub: **Use this template** → create the new repository.
2. Clone the new repo locally.
3. Edit `README.md` / `AGENTS.md` for the product; add `pyproject.toml` and/or `package.json` as needed.
4. Update [`.github/CODEOWNERS`](.github/CODEOWNERS) to the owning handle(s).
5. CI Detect picks up language lanes automatically (`allow-empty` can be removed once a lane exists).
6. Re-apply HOW-TO-USE steps 3–5 on the **new** repo (labels, soft branch protection, security) — GitHub does not copy those from the template.
7. Optional: `capa install` after editing `capabilities.yaml`.

## CI

Required check on `main`: **`CI / CI`**. Pin reusable workflows to **`@latest`**. Full adopt checklist lives in the shared actions hub `HOW-TO-USE.md`.
