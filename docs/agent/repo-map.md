# Repo Map

## Purpose

HilalSight is a React crescent-visibility planner with two API runtimes implementing the HMNAO/Yallop q-test. Confidence: high.

## Runtime Flow

```text
shared React UI (frontend/src)
├── local Vite/Nginx -> FastAPI -> Skyfield + verified JPL DE421
└── Sites/vinext    -> Worker API -> Astronomy Engine
```

Both routes expose compatible calendar, month-context, new-moon, point-visibility, map, and status endpoints. The loopback local runtime also offers server-proxied geocoding; hosted place-name geocoding is disabled because isolate-local throttling cannot enforce an application-wide upstream quota. Accepted base date labels are `1900-01-01` through `2050-12-31`; offset events can cross an endpoint and next-conjunction results may be up to one lunation later. Month context uses a nullable default projection rather than sending an out-of-range map request at the upper edge.

## Stack

- Python 3.13, FastAPI, Uvicorn, Skyfield, NumPy, orjson, and timezonefinder
- React 19, TypeScript, Vite, D3, TopoJSON, and jsPDF
- Astronomy Engine and tz-lookup in the hosted Worker-compatible adapter
- Docker Compose and Nginx for the local loopback-only stack

## Important Paths

- `README.md`: public product, model, privacy, validation, and license documentation
- `SECURITY.md`: private vulnerability-reporting policy
- `CONTRIBUTING.md`: contribution and release-check workflow
- `backend/app/main.py`: FastAPI routes, bounds, CORS, and cache-warm origin protection
- `backend/app/core/visibility.py`: point calculations and event-time semantics
- `backend/app/core/map_grid.py`: vectorized local map calculations and disk caching
- `backend/app/core/ephemeris.py`: DE421 loading and checksum verification
- `backend/app/core/geocoding.py`: bounded, throttled Nominatim proxy
- `backend/tests/`: formula, API, polar, and global-grid regression tests
- `frontend/src/`: shared interface, API client, map renderer, and point details
- `sites/app/api/[...path]/route.ts`: hosted `/api` implementation and disabled geocoding boundary
- `sites/lib/visibility.ts`: Astronomy Engine visibility implementation
- `sites/tests/rendered-html.test.mjs`: hosted build, rendering, and API-contract checks
- `docker-compose.yml`: loopback-only local service exposure and persistent volumes
- `docs/agent/build-and-test.md`: authoritative local validation commands

## Architectural Boundaries

- The Python and TypeScript astronomy implementations should agree semantically, but different ephemerides can produce small q/time differences near category boundaries.
- The local runtime offers 0.5°, 1°, 2°, and 5° grids plus cache warming. The hosted runtime is restricted to 2° and 5° grids and computes on demand.
- Local browser place searches use same-origin `/api/geocode/search`; only FastAPI contacts Nominatim. Hosted users enter coordinates instead.
- The UI sends the browser's local civil date to the shared Hijri context endpoint. Its Islamic Civil/tabular reference shows both months during the last three and first three reference days around a boundary, but makes no official month-start ruling and never derives month labels from visibility results.
- `/api/hijri/today` is retained only as a UTC tabular compatibility endpoint; the UI must use `/api/hijri/context` for month reporting and default-window selection.

## Public-Release Risks And Gates

- Do not expose the unauthenticated local FastAPI map or cache-warm routes to the internet; preserve loopback Docker bindings.
- Keep model-date, coordinate, day-offset, and resolution validation aligned across runtimes; preserve strict validation on the local geocoder.
- Keep OpenStreetMap/Nominatim attribution and the place-search privacy warning visible in the local interface, and do not enable hosted free-text geocoding without centralized aggregate controls.
- Preserve DE421 checksum verification and avoid exposing local filesystem paths through `/api/status`.
- Run backend tests, frontend lint/build, Sites lint/test, `pip-audit`, and both production npm audits before release.
- Treat q values very near a threshold as boundary-sensitive and review the underlying values before declaring a regression.
- The repository is licensed under `AGPL-3.0-only`; deployed interfaces must preserve the source offer and legal notices.
