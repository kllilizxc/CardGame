# Create the managed Preview adapter Design

## Problem

Create a reviewed foreground Preview adapter at `scripts/hopi/preview` for the managed integration worktree. Keep the scope minimal: use the existing project startup path where possible, run from the managed integration root, follow HOPI Preview adapter conventions for `HOPI_PROJECT_ROOT`, `HOPI_PREVIEW_RUNTIME_DIR`, optional `HOPI_PREVIEW_URL=<url>`, and clean foreground shutdown behavior, and avoid unrelated product changes.

## Current Design

### Adapter Shape

- The managed integration tree now has a checked-in `scripts/hopi/preview`, but accepted inbox events `EV-3cdf291a-f3f6-49d8-938f-af7709ddb8e3` and `EV-ae8c38a9-5b3d-456a-8cda-b07f28da38ea` show the current adapter still fails the managed Preview contract under clean host conditions.
- The Goal therefore remains scoped to repairing that exact reviewed adapter path; no additional product or workflow documents are required beyond the control-document updates that schedule the repair.

### Startup Path

- Reuse the existing `package.json` startup path `dev-nolog`, which already runs the app through `vite --config vite/config.dev.mjs`; do not introduce a second project-specific server command.
- The adapter must select an available loopback port at launch time instead of hard-coding `127.0.0.1:8080`, because host preview run `preview-d136e6a7-d46b-4f00-9d97-0e084691a725` showed that `8080` may already be occupied by an unrelated local process.
- After choosing the port, invoke `bun run dev-nolog -- --host 127.0.0.1 --port <chosen-port> --strictPort` so Preview still reuses the repo's dev-server behavior while avoiding interference with user-owned local processes.
- Leave `package.json` and Vite config unchanged unless the adapter itself proves insufficient, because the current repo startup path is still the correct server entrypoint.

### Runtime Prerequisites

- Accepted inbox event `EV-3cdf291a-f3f6-49d8-938f-af7709ddb8e3` establishes that a clean managed integration worktree must start Preview successfully; exiting on missing `vite` is diagnosis, not Goal completion.
- The managed integration tree currently has no `node_modules`, while `package.json` declares `vite` in `devDependencies` and the repo already carries a checked-in `bun.lock`.
- The adapter must therefore prepare project-local dependencies itself before launch whenever `node_modules/.bin/vite` is absent; do not treat a globally installed `vite` on `PATH` as satisfying the managed Preview contract.
- Prepare dependencies from the managed integration root with Bun, using the existing lockfile without mutating project dependency declarations; the minimal repair path is `bun install --frozen-lockfile`.
- When `HOPI_PREVIEW_RUNTIME_DIR` is provided, reuse that disposable directory for both `TMPDIR` and Bun's install cache so Preview startup does not depend on writable global cache state.

### Endpoint Readiness And Lifecycle Contract

- Treat `HOPI_PROJECT_ROOT` as the canonical project root when it is provided and ensure the dev server runs from that managed integration directory.
- Accept `HOPI_PREVIEW_RUNTIME_DIR` only as disposable runtime scratch owned by Coordinator; the adapter must not turn it into canonical project state or depend on other writable repo-local temp paths.
- Do not emit `HOPI_PREVIEW_URL` until the launched endpoint is actually reachable on the chosen loopback port; printing the URL immediately after dependency preparation or child-process spawn is insufficient because the server may still fail to bind.
- Once readiness is verified, emit `HOPI_PREVIEW_URL=http://127.0.0.1:<chosen-port>` for the managed endpoint and remain a foreground process so Coordinator can own logs, `SIGTERM`, and bounded shutdown.
- If port selection, readiness verification, or child startup fails, exit nonzero with the underlying startup failure surfaced directly rather than reporting a usable Preview endpoint.

### Work Split

- `W-preview-adapter` remains the terminal record for creating the initial adapter executable.
- `W-preview-adapter-prereqs` remains the terminal record for bootstrapping project-local dependencies in a clean managed integration worktree.
- One additional Engineering Work item is required to repair the same adapter so it chooses an available loopback port, avoids requiring the user to stop existing local processes, and only publishes `HOPI_PREVIEW_URL` after the endpoint is actually live.
