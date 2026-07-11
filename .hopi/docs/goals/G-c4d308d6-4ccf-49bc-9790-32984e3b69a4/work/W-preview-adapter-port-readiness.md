---
id: W-preview-adapter-port-readiness
title: Repair Preview port selection and readiness publication
notBefore: null
dependsOn:
  - W-preview-adapter-prereqs
contractRevision: 3
evidenceRefs:
  - E-R-83a20ccb-ccb3-40d9-9576-db9a67861bc5
  - E-R-d18d4083-d259-42ab-9d55-7323d87a4bdf
attempts: 0
kind: engineering
stage: done
---
## Objective

Repair `scripts/hopi/preview` so the managed Preview adapter selects an available loopback port, waits until the endpoint is actually reachable before emitting `HOPI_PREVIEW_URL`, and preserves the clean-worktree prerequisite preparation and foreground shutdown contract.

## Scope

- `scripts/hopi/preview`

## Acceptance Criteria

- Launching `scripts/hopi/preview` from the managed integration root no longer hard-codes `127.0.0.1:8080`; it chooses an available loopback port for the current run and starts the existing project path with `bun run dev-nolog -- --host 127.0.0.1 --port <chosen-port> --strictPort`.
- The adapter continues to treat `HOPI_PROJECT_ROOT` as the canonical project root, prepares project-local dependencies with Bun when local Vite is absent, and keeps disposable temp and Bun install-cache state inside `HOPI_PREVIEW_RUNTIME_DIR` when that runtime directory is provided.
- The adapter emits `HOPI_PREVIEW_URL=http://127.0.0.1:<chosen-port>` only after the launched endpoint is reachable on the chosen port; if child startup, port binding, or readiness verification fails first, it exits nonzero without reporting a usable Preview URL.
- The adapter remains a foreground process and still stops cleanly on `SIGTERM` without leaving background child processes running.

## Out Of Scope

- Changes to gameplay, React or Phaser runtime code, or content data
- Changes to `package.json`, lockfiles, Vite config, or HOPI backend Preview orchestration unless the adapter proves they are strictly necessary
