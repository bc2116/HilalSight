# Security Policy

## Reporting A Vulnerability

Please report suspected vulnerabilities through GitHub's private vulnerability reporting flow:

1. Open the repository's **Security** tab.
2. Choose **Advisories** and **Report a vulnerability**.
3. Include the affected route or component, impact, minimal reproduction steps, and any suggested mitigation.

Direct link: [privately report a HilalSight vulnerability](https://github.com/bc2116/HilalSight/security/advisories/new).

Do **not** publish exploit details, credentials, private location data, or a working proof of concept in a public issue. If private reporting is unavailable, open a minimal public issue asking the maintainer to establish a private channel; omit sensitive details.

Please allow time for triage before public disclosure. The maintainer will acknowledge the report, assess scope, and coordinate remediation and disclosure when possible, but no fixed response-time guarantee is offered.

## Scope

Reports are useful for:

- The code in `bc2116/HilalSight`
- The official hosted app at `https://hilalsight.longhorizon.chatgpt.site/`
- Dependency, input-validation, browser-policy, geocoding-proxy, or resource-exhaustion issues caused by HilalSight's integration

Underlying GitHub, Sites/Cloudflare, OpenStreetMap/Nominatim, JPL, Skyfield, or Astronomy Engine service vulnerabilities should normally be reported to their respective maintainers unless HilalSight's use of them creates the issue.

## Deployment Boundary

The Docker Compose configuration is intended for one-user, loopback-only operation and binds the frontend and backend to `127.0.0.1`. The FastAPI service has expensive map and cache-warming operations but no user authentication or public-service rate limiter. Do not expose it directly to an untrusted network without adding an authenticated gateway, request limits, resource controls, monitoring, and an operator-reviewed deployment configuration.

The hosted adapter reduces this surface by limiting map resolution and disabling cache warming, but it remains a public astronomical tool rather than a general-purpose multi-tenant computation API.

## Supported Code

Security fixes target the current `main` branch. Older snapshots may not receive backports.
