# HilalSight Sites Adapter

This directory packages HilalSight for a separate Sites deployment without replacing the local FastAPI implementation. Publishing the GitHub repository does not deploy this adapter; verify the live source/license footer and API behavior after every deployment.

## Runtime Boundary

- `app/page.tsx` reuses the React interface from `../frontend/src`.
- `app/api/[...path]/route.ts` implements the shared `/api` contract in a Cloudflare Worker-compatible runtime.
- `lib/visibility.ts` implements the Yallop calculations with Astronomy Engine.
- `lib/hijri.ts` provides deterministic Islamic Civil calendar conversion.
- `.openai/hosting.json` contains Sites project metadata and optional logical bindings; it must not contain secrets.

The hosted runtime accepts base date labels from `1900-01-01` through `2050-12-31` and intentionally limits maps to 2° and 5° grids. Offset events may cross an endpoint, and a next-conjunction result may be up to one lunation later. It calculates and caches maps on demand; local cache warming is unavailable. The local Python runtime remains the Skyfield/DE421 reference for 0.5° and 1° grids, bounded disk-backed caching, and cache warming.

Both runtimes share equations and response shapes, but Astronomy Engine and Skyfield/DE421 can differ slightly in event times and q values. Treat results near a category threshold as boundary-sensitive and regression-check changes against Python reference points.

## Location Privacy

Hosted place-name search is deliberately disabled: an in-memory Worker cannot guarantee a public geocoder's application-wide rate limit across isolates. Users can click the map, enter coordinates, or grant browser geolocation permission. Exact-point responses use `Cache-Control: no-store` to prevent shared intermediary caching. A future hosted geocoder must provide centralized throttling or capacity intended for the deployment's aggregate traffic.

## Validate

Node.js 22.13 or newer is required.

```bash
npm ci
npm run lint
npm test
npm audit --audit-level=high
```

`npm test` builds the Worker-compatible bundle, then checks server rendering, calendar and new-moon routes, input/date validation, the disabled hosted-geocoder boundary, a reference point, polar-day handling, offset-aware local timestamps, and a complete hosted map grid.

For an interactive local adapter:

```bash
npm run dev -- --hostname 127.0.0.1
```

The hosted app is an astronomical aid, not an official religious determination. See the repository root [README](../README.md), [security policy](../SECURITY.md), [AGPL-3.0-only license](../LICENSE), and [third-party notices](../THIRD_PARTY_NOTICES.md) before reuse or deployment.
