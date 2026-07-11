---
id: W-preview-adapter-prereqs
title: Repair Preview startup prerequisite preparation
kind: engineering
stage: generate
notBefore: null
dependsOn:
  - W-preview-adapter
contractRevision: 2
evidenceRefs: []
attempts: 0
---
## Objective

Repair `scripts/hopi/preview` so HOPI Preview can start from a clean managed integration worktree by preparing project-local runtime prerequisites before launching the existing dev-server path.

## Scope

- `scripts/hopi/preview`

## Acceptance Criteria

- In a clean managed integration worktree with no `node_modules`, launching `scripts/hopi/preview` prepares the project's local dependencies from the managed integration root instead of exiting immediately with the current missing-`vite` diagnostic.
- Dependency preparation uses Bun against the repo's checked-in dependency state, does not rely on a globally installed `vite`, and does not rewrite project dependency declarations as part of normal Preview startup.
- When `HOPI_PREVIEW_RUNTIME_DIR` is set, the adapter keeps disposable temp and install-cache state inside that runtime directory rather than depending on other repo-local temp paths or writable global cache state.
- After prerequisites are ready, the adapter still emits `HOPI_PREVIEW_URL=http://127.0.0.1:8080`, runs `bun run dev-nolog -- --host 127.0.0.1 --port 8080 --strictPort` from the managed integration root in the foreground, and stops cleanly on `SIGTERM` without leaving background child processes running.
- If prerequisite preparation fails, the adapter exits nonzero with the Bun install failure surfaced directly rather than reporting a successful Preview startup.

## Out Of Scope

- Changes to gameplay, React or Phaser runtime code, or content data
- Changes to `package.json`, lockfiles, Vite config, or HOPI backend Preview orchestration unless the adapter proves they are strictly necessary
