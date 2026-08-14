---
name: hilalsight-local-dev
description: Use for HilalSight backend/frontend implementation, Yallop q-test checks, map rendering, tests, lint, and local dev startup.
---

# hilalsight-local-dev

## Purpose
Provide repo-local Codex guidance for HilalSight.

## When To Use
- Use for implementation, debugging, validation, docs, or adapter work inside this repo.
- Use before making repo-specific changes so commands and safety constraints stay local.

## Inputs
- `AGENTS.md`
- `README.md`
- `docs/agent/*.md`
- Relevant manifests and existing tests.

## Workflow
1. Confirm the task is scoped to HilalSight.
2. Read `docs/agent/repo-map.md` and `docs/agent/build-and-test.md`.
3. Gather facts from manifests and source docs; do not inspect secrets.
4. Make the smallest relevant change, preferably outside production code unless explicitly requested.
5. Run the appropriate discovered checks or state why they were skipped.
6. Summarize changed files, validation, risks, and open questions.

## Output Format
Return a concise report with:
- Scope.
- Files changed.
- Validation run or skipped.
- Remaining risks or TODOs.

## Validation
- `cd backend && ./.venv/bin/pytest`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd sites && npm run lint && npm test`
- `cd backend && ./.venv/bin/pip-audit -r requirements-dev.txt && ./.venv/bin/bandit --quiet --recursive app`
- `cd frontend && npm audit --audit-level=high`
- `cd sites && npm audit --audit-level=high`

## Failure Modes
- Required command is unknown or unavailable.
- Local dirty work makes a change ambiguous.
- A task requires secrets, credentials, customer data, or real slide/support artifacts.
- The requested change belongs in a sibling repo.

## Safety / Privacy Rules
- Do not read or print `.env`, auth/token/key files, browser profiles, or credential stores.
- Do not commit generated logs, real customer/support data, PHI, PII, or scanner credentials.
- Keep machine-specific paths in ignored local config only.

## Done Criteria
- The change is scoped, reviewable, and documented when needed.
- Relevant checks were run or skipped with a reason.
- Unknowns are captured in `docs/agent/open-questions.md` when durable.
