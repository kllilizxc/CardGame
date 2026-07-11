---
id: W-preview-adapter
title: Create the managed foreground Preview adapter
notBefore: null
dependsOn: []
contractRevision: 1
evidenceRefs:
  - E-R-d35ccd17-dce9-4660-b50f-008e6342250a
  - E-R-df670505-7db3-4d05-9db4-324a8fa0fe9d
attempts: 0
kind: engineering
stage: done
---
## Objective

Create the reviewed executable at `scripts/hopi/preview` so HOPI Preview can launch the current managed integration target by reusing the repo's existing dev-server path.

## Scope

- `scripts/hopi/preview`
- `scripts/hopi/` parent directory creation only

## Acceptance Criteria

- `scripts/hopi/preview` exists as an executable checked-in adapter at the exact path HOPI Preview manager expects.
- Launching the adapter from the managed integration root reuses the existing `bun run dev-nolog` and `vite/config.dev.mjs` startup path instead of introducing a second project startup implementation.
- The adapter binds Preview to `127.0.0.1:8080`, emits `HOPI_PREVIEW_URL=http://127.0.0.1:8080`, and does not rely on non-disposable state outside the managed integration root and `HOPI_PREVIEW_RUNTIME_DIR`.
- The adapter stays in the foreground and stops cleanly on `SIGTERM` without leaving background child processes running.

## Out Of Scope

- Changes to gameplay, React or Phaser runtime code, or content data
- Changes to `package.json`, Vite config, or HOPI backend Preview orchestration unless the adapter proves they are strictly necessary
