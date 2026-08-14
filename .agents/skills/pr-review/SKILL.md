---
name: pr-review
description: Use for HilalSight pull-request or diff reviews. Focus on concrete bugs, regressions, risks, and missing validation.
---

# pr-review

1. Read the scoped diff, affected tests, `AGENTS.md`, and relevant `docs/agent/` guidance.
2. Report concrete findings first, with severity and affected paths or lines.
3. Check API, visibility-model, map-rendering, and frontend/site changes for regressions when they are in scope.
4. Verify changed behavior has relevant evidence-backed validation; mark unavailable checks as TODOs.
5. Note privacy, secret-handling, and accidental generated-artifact risks without inspecting sensitive files.
