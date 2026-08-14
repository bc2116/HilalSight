# Third-party notices

HilalSight is licensed under AGPL-3.0-only. Third-party packages and data remain under their own licenses; the project license does not replace those terms. Copyright and license notices shipped with each dependency must be retained when redistributing builds or container images.

The direct runtime dependency set reviewed for this release includes:

| Component group | Examples | Upstream license(s) |
| --- | --- | --- |
| Python web/runtime | FastAPI, Starlette, Uvicorn, Skyfield, NumPy, python-dateutil, timezonefinder | MIT, BSD-3-Clause, Apache-2.0, and compatible permissive terms |
| Python serialization | orjson | MPL-2.0 and an Apache-2.0 or MIT option; see the package's bundled license files |
| Shared web interface | React, React DOM, html2canvas, jsPDF | MIT |
| Mapping and data utilities | d3-geo, d3-contour, d3-geo-projection, topojson-client, world-atlas | ISC |
| Hosted runtime | Astronomy Engine, Next.js, tz-lookup, vinext, Cloudflare tooling | MIT, CC0, Apache-2.0, and compatible permissive terms |
| Development and security tooling | Vite, TypeScript, ESLint, pytest, httpx2, pip-audit, Bandit | MIT, BSD-3-Clause, and Apache-2.0 |

`world-atlas` packages Natural Earth geography. The world-atlas package is ISC-licensed; [Natural Earth data is public domain](https://www.naturalearthdata.com/about/terms-of-use/).

The DE421 ephemeris is downloaded from NASA/JPL at runtime, verified by SHA-256, and is not committed to this repository. It is not relicensed by HilalSight. Review the applicable NASA/JPL terms before bundling or redistributing the ephemeris itself.

The implementation cites B. D. Yallop's crescent-visibility method but does not include the original paper. OpenStreetMap/Nominatim attribution and usage obligations are documented in the main README and displayed in the application.

For exact transitive terms, consult the license files and package metadata installed from the pinned Python requirements and npm lockfiles. Report a missing or incorrect notice through the process in [SECURITY.md](SECURITY.md) or a repository issue.
