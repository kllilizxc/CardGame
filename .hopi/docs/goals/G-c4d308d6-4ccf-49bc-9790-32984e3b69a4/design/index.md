# Create the managed Preview adapter Design

## Problem

Create a reviewed foreground Preview adapter at `scripts/hopi/preview` for the managed integration worktree. Keep the scope minimal: use the existing project startup path where possible, run from the managed integration root, follow HOPI Preview adapter conventions for `HOPI_PROJECT_ROOT`, `HOPI_PREVIEW_RUNTIME_DIR`, optional `HOPI_PREVIEW_URL=<url>`, and clean foreground shutdown behavior, and avoid unrelated product changes.

## Current Design

### Adapter Shape

- The managed integration tree currently has no `scripts/hopi/preview`, and HOPI Preview will only launch a reviewed executable at that exact path.
- The Goal therefore scopes to one checked-in adapter executable under `scripts/hopi/preview`; no additional product or workflow documents are required to start Preview.

### Startup Path

- Reuse the existing `package.json` startup path `dev-nolog`, which already runs the app through `vite --config vite/config.dev.mjs`; do not introduce a second project-specific server command.
- Invoke that path through `bun run dev-nolog -- --host 127.0.0.1 --port 8080 --strictPort` so Preview keeps the repo's current dev-server behavior while forcing one stable managed endpoint.
- Leave `package.json` and Vite config unchanged unless the adapter itself proves insufficient, because the current repo already exposes the needed local dev server on port `8080`.

### Environment And Lifecycle Contract

- Treat `HOPI_PROJECT_ROOT` as the canonical project root when it is provided and ensure the dev server runs from that managed integration directory.
- Accept `HOPI_PREVIEW_RUNTIME_DIR` only as disposable runtime scratch owned by Coordinator; the adapter must not turn it into canonical project state or depend on other writable repo-local temp paths.
- Emit `HOPI_PREVIEW_URL=http://127.0.0.1:8080` for the managed endpoint and remain a foreground process so Coordinator can own logs, `SIGTERM`, and bounded shutdown.

### Work Split

- One Engineering Work item is sufficient: create the adapter executable and verify it reuses the existing startup path with the required Preview I/O conventions.
