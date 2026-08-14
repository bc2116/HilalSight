# Contributing To HilalSight

Issues and focused pull requests are welcome for review. HilalSight is licensed under [AGPL-3.0-only](LICENSE). By submitting a contribution, you agree to license it under the same terms and confirm that you have the right to do so.

## Before A Change

- Read `README.md`, `SECURITY.md`, and `docs/agent/build-and-test.md`.
- Keep changes bounded and preserve the shared `/api` contract.
- Do not include secrets, environment files, personal coordinates, sensitive search text, browser artifacts, or machine-specific paths.
- Report vulnerabilities privately as described in `SECURITY.md`, not as public issues.

## Development Checks

Use Python 3.13 and Node.js 22.13 or newer. Install with the committed requirement and lock files, then run:

```bash
cd backend
./.venv/bin/pytest
./.venv/bin/pip-audit -r requirements-dev.txt
./.venv/bin/bandit --quiet --recursive app docker-entrypoint.py

cd ../frontend
npm run lint
npm run build
npm audit --audit-level=high

cd ../sites
npm run lint
npm test
npm audit --audit-level=high
```

See `docs/agent/build-and-test.md` for first-time installation commands.

## Scientific And API Changes

- Add or update tests when calculation behavior, validation, or response shapes change.
- Check representative results in both the Python/Skyfield and Sites/Astronomy Engine runtimes.
- Include a polar-day case and a q value near a category threshold when relevant.
- Keep accepted base date labels `1900-01-01` through `2050-12-31` aligned across UI and APIs; offset events may cross an endpoint and a next-conjunction result may be up to one lunation later.
- Explain expected numerical differences; do not weaken a regression assertion only to make it pass.
- Preserve the disclaimer that HilalSight is not an official religious determination.

## Pull Request Notes

Describe what changed, why, validation commands and results, user-visible effects, and remaining risks. Keep dependency upgrades separate from unrelated feature work when practical.
