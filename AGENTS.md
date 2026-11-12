# AGENTS.md

Implementation guide for coding agents working in repos **created from this template**, or editing the template itself.

Product pitch for humans: [`README.md`](README.md).

---

## Orientation

| Question | Answer |
| -------- | ------ |
| What is this? | Starter scaffold: Actions CI + Dependabot + CODEOWNERS + issue templates + CAPA + this file |
| Issue templates | [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) — feature request (Background / Motivation / Requirements / AC); bug report (Description / Steps to reproduce / Expected / Actual / Environment) |
| CI hub | Shared reusable workflows pinned `@latest` (see thin orchestrator) |
| Thin orchestrator | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| CAPA | [`capabilities.yaml`](capabilities.yaml) — run `capa install` (do not hand-edit generated `.cursor/` / `.claude/`) |
| Semver | **Omitted** until the repo publishes releases/wheels — then copy Semver jobs from the actions templates |
| Secrets | Never commit tokens, keys, or live operator inventory; use dummy data in fixtures/PRs |

## After “Use this template”

GitHub does **not** copy labels, branch protection, or security toggles. Re-do the actions hub HOW-TO-USE wire-up steps 3–5 on the new repo.

1. Rename the product in `README.md` and rewrite this orientation table for the real codebase.
2. Point [`.github/CODEOWNERS`](.github/CODEOWNERS) at the owning handle(s).
3. Add the language layout (`pyproject.toml` / `package.json` / etc.). Detect turns on the matching CI lanes.
4. Drop `allow-empty: true` from `ci.yml` once at least one lane is real.
5. Create label `dependencies`. Soft-protect `main`: require **`CI / CI`**, PR reviews (count 0 OK), `require_code_owner_reviews: false` so Dependabot auto-merge can land, admin bypass OK. Enable security settings + `allow_auto_merge` if using DAM.
6. Semver only if publishing: uncomment Semver job, copy `cd.yml`, create bump labels, restore `noBump` on Dependabot, require **`Semver / Semver`**.

## Editing the template repo itself

Keep the scaffold **language-agnostic**. Prefer `allow-empty: true`. Do not enable Semver here. Keep HOW-TO-USE wire-up applied on this repo (protection, labels, security, DAM). Keep docs free of personal paths, handles, and live inventory.
