# HilalSight — AGENTS

<!-- BEGIN Agentic Enablement Repo Adapter -->
## Agentic Enablement Repo Adapter

### Purpose
FastAPI plus React/Vite app that predicts new crescent moon visibility using HMNAO/Yallop q-test and renders global map outputs.

Confidence: high. Product area: HilalSight crescent visibility app.

### Build And Test Commands
- Install: `cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt`, `cd frontend && npm ci`, `cd sites && npm ci`
- Run: `docker compose up --build`, `cd backend && ./.venv/bin/uvicorn app.main:app --reload --port 8000`, `cd frontend && npm run dev`, `cd sites && npm run dev -- --hostname 127.0.0.1`
- Test: `cd backend && ./.venv/bin/pytest`, `cd sites && npm test`
- Lint/build: `cd frontend && npm run lint && npm run build`, `cd sites && npm run lint && npm test`
- Audit: `cd backend && ./.venv/bin/pip-audit -r requirements-dev.txt && ./.venv/bin/bandit --quiet --recursive app docker-entrypoint.py`, `cd frontend && npm audit --audit-level=high`, `cd sites && npm audit --audit-level=high`

### Done Criteria
- Follow this repo's local adapter docs under `docs/agent/`.
- Run the relevant discovered checks, or state why they were skipped.
- Keep changes small and avoid production code unless explicitly requested.
- Update docs or adapter notes when workflow assumptions change.

### Safety Rules
- Do not read or commit secrets, `.env`, auth files, token files, private keys, browser profiles, or credential stores.
- Do not copy PHI, PII, customer-identifiable data, scanner credentials, raw Salesforce records, or real slide identifiers into docs.
- Preserve existing uncommitted work and report dirty state.

### Agentic Enablement Participation
- Shared operating layer: `../Agentic-Enablement`.
- Registry entry: `../Agentic-Enablement/registry/repos.yaml`.
- Recommended shared agents: `repo_cartographer`, `generic_repo_adapter`, `pr_reviewer`, `compliance_guard`.
- Recommended shared skills: `generic-repo-intake`, `repo-codex-adapter-writer`, `docs-tech-writer`.
- Repo-local skill: `hilalsight-local-dev`.
<!-- END Agentic Enablement Repo Adapter -->
