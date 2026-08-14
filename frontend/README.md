# HilalSight frontend

This directory contains the shared React/TypeScript interface used by both HilalSight runtimes:

- Vite serves the local UI and proxies `/api` to the Python/FastAPI backend.
- `../sites` imports the same `src/App.tsx` for the hosted vinext/Cloudflare build.

From this directory:

```bash
npm ci
npm run dev
npm run lint
npm run build
npm audit --audit-level=high
```

Run the Python API on `127.0.0.1:8000` before using the local Vite UI. See the [root README](../README.md) and [build guide](../docs/agent/build-and-test.md) for the complete workflow and runtime differences.

The local interface sends place-name searches only to HilalSight's same-origin geocoding endpoint and shows the OpenStreetMap/Nominatim disclosure. The hosted build disables place-name search and accepts coordinates instead. Keep those runtime boundaries, the source/license links, and the astronomical-use disclaimer when changing shared UI components.

The shared UI sends the browser's local civil date to `/api/hijri/context`. Both runtimes use the same tabular reference rule: show the leaving and entering months during the last three and first three reference days around a boundary, otherwise show one month. The API also chooses the default crescent window; visibility-map results must never determine the month label. At the upper supported-date edge, `defaultProjection` can be null while the month context remains usable, and the UI must show that state without requesting an out-of-range map.
