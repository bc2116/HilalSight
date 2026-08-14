# Build And Test

## Prerequisites

- Docker with Compose for the isolated local stack
- Python 3.13 for direct backend development
- Node.js 22.13 or newer for the frontend and Sites adapter

Use the committed lockfiles and pinned Python requirement files. Do not substitute `npm install` for `npm ci` in release validation.

## Install

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements-dev.txt

cd ../frontend
npm ci

cd ../sites
npm ci
```

## Run

Run the complete loopback-only stack from the repository root:

```bash
docker compose up --build
```

The backend container starts through a small root entrypoint that migrates named-volume ownership once, then runs Uvicorn as UID/GID `10001`. Preserve that upgrade path when changing the image or volume layout.

Pre-release DiskCache `cache.db` and hashed `.val` artifacts may remain in an upgraded cache volume. They are obsolete and do not grow; leave them in place unless an operator explicitly chooses to recreate that recoverable cache volume.

Or run each development service separately:

```bash
cd backend
./.venv/bin/uvicorn app.main:app --reload --port 8000

cd ../frontend
npm run dev

cd ../sites
npm run dev -- --hostname 127.0.0.1
```

## Tests, Lint, And Builds

```bash
cd backend
./.venv/bin/pytest

cd ../frontend
npm run lint
npm run build

cd ../sites
npm run lint
npm test
```

The backend suite includes slower global-grid regression tests. `npm test` in `sites/` includes its build before exercising the rendered page and API contract. The standalone frontend has lint and TypeScript/build gates but no unit-test command.

## Dependency Audits

```bash
cd backend
./.venv/bin/pip-audit -r requirements-dev.txt
./.venv/bin/bandit --quiet --recursive app docker-entrypoint.py

cd ../frontend
npm audit --audit-level=high

cd ../sites
npm audit --audit-level=high
```

Full runtime and development dependency audits are release gates. Do not apply `npm audit fix --force` without checking the proposed breaking changes and rebuilding the affected runtime.

## Release Validation Policy

- Run every command above after changing shared frontend code, calculations, API response shapes, dependencies, or deployment configuration.
- For calculation changes, compare representative point and map results in both the Python and Sites runtimes, including a polar case and values near q-category thresholds.
- Keep accepted base date labels at `1900-01-01` through `2050-12-31` consistent across the UI and both APIs; offset events can cross an endpoint and next-conjunction results may be up to one lunation later.
- Preserve the local Docker bindings to `127.0.0.1`; the FastAPI service is not a hardened public multi-user API.
- Verify that local place search remains server-proxied, bounded, attributed to OpenStreetMap/Nominatim, and free of sensitive test data. Hosted free-text geocoding must remain disabled unless centralized aggregate controls are added.
- If a command is unavailable or fails for an environmental reason, report the exact gap rather than treating it as a pass.
- Never use live credentials, personal location data, or sensitive search terms in tests or documentation.
