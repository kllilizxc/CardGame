---
id: W-root-agents-bun-guidance
title: Extend root AGENTS.md with explicit Bun-default guidance
notBefore: null
dependsOn: []
contractRevision: 1
evidenceRefs:
  - E-R-b2809206-0f1b-4552-ba31-13f82a82aaf5
  - E-R-380031d8-e27a-4b3a-bb87-14d04096ac79
attempts: 0
kind: engineering
stage: done
---
## Objective

Update the existing repository-root `AGENTS.md` so it explicitly tells contributors to use Bun by default while preserving the current project-entry guidance already recorded there.

## Scope

- `AGENTS.md`

## Acceptance Criteria

- The repository-root `AGENTS.md` remains present at the same path and preserves the existing project-entry guidance about the active runtime surface and key source locations.
- `AGENTS.md` explicitly tells contributors to default to Bun instead of Node.js and npm/yarn/pnpm-style command paths for routine local work.
- The documented Bun guidance makes the default workflow unambiguous for direct execution, script execution, dependency installation, tests, and package-exposed CLIs.
- No application source files or non-`AGENTS.md` project documents are changed.

## Out Of Scope

- Application code, assets, and gameplay data
- HOPI control documents outside this Goal package
