# Codex Adapter

## Repository Identity

- Public repository: `bc2116/HilalSight`
- Product: HilalSight crescent-visibility planner
- Sites deployment target: `https://hilalsight.longhorizon.chatgpt.site/` (deployed separately from GitHub)

## Shared Operating Layer

This repo can participate in a local Agentic Enablement workspace through `../Agentic-Enablement`. That sibling repository is optional development infrastructure and is not required to build, test, or run HilalSight.

## Recommended Roles

- `repo_cartographer` for bounded architecture discovery
- `pr_reviewer` for correctness, security, and regression review
- `compliance_guard` for public-release and privacy review

## Local Adapter Files

- `AGENTS.md`: repository working agreement
- `.codex/config.toml` and `.codex/hooks.json`: local Codex defaults
- `.agents/skills/hilalsight-local-dev/SKILL.md`: implementation and validation workflow
- `.agents/skills/repo-map/SKILL.md`: repository orientation
- `.agents/skills/pr-review/SKILL.md`: review focus
- `.agents/skills/docs-refresh/SKILL.md`: documentation workflow
- `docs/agent/`: concise repository map, commands, and maintained decisions

## Working Boundary

- Treat the Python/Skyfield runtime as the local DE421-backed reference.
- Treat the Sites/Astronomy Engine runtime as a separately implemented public adapter with a shared API contract.
- Re-run both runtimes' checks when shared UI, date semantics, visibility equations, or response types change.
- Preserve user work and inspect `git status --short` before editing or staging.
- Do not publish local caches, browser artifacts, environment files, keys, tokens, or machine-specific paths.
