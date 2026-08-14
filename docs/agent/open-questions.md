# Open Questions And Maintainer Decisions

## Open

- Should future cross-runtime regression fixtures define an explicit q-distance from each category boundary at which a letter mismatch is reported as boundary-sensitive rather than a failure?
- Should Docker Compose remain the primary cross-platform validation path, or should a second operating-system matrix be added when CI coverage expands?

## Resolved

- Codex Sites is the hosted publication target; local FastAPI + Vite remains the higher-detail scientific reference.
- HilalSight is licensed under `AGPL-3.0-only`; deployed interfaces retain visible source, license, copyright, and no-warranty notices.
- Both public APIs accept base date labels from `1900-01-01` through `2050-12-31`; offset events can cross an endpoint and next-conjunction results may be up to one lunation later.
- Local Docker services bind to `127.0.0.1` and are not presented as a public multi-user deployment.
- Local place search is server-proxied to Nominatim with visible OpenStreetMap attribution and a user privacy notice. Hosted free-text geocoding is disabled until centralized aggregate throttling or a suitably provisioned service is available.
- The local runtime verifies the downloaded JPL DE421 file by SHA-256 before calculation.

Do not record temporary branch names, dirty-worktree snapshots, remote state, or machine-specific paths here; those are per-session facts, not maintained architecture decisions.
