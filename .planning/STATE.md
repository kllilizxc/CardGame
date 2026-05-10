# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** 每次秘境探索都要让玩家明确感受到：带进去的是真资产，活着带出来的才真正属于自己。
**Current focus:** Phase 01 — First Playable Expedition

## Current Position

Phase: 1 of 1 (First Playable Expedition)
Plan: 0 of 3 in current phase
Status: Ready to execute
Last activity: 2026-04-06 — Seed planning files expanded into executable Phase 01 artifacts

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 0 | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: Stable

## Accumulated Context

### Decisions

- Phase 01 uses one fixed-topology 秘境 prototype with a small random pool for event and shop content.
- Existing `BattleScene` stays the combat resolver for battle and boss nodes. Battle/BOSS map nodes hand off through `BattleLaunchPayload` and return structured `expedition-battle-complete` results.
- `RunResolution` is the canonical terminal run-resolution service: defeat loses carried run assets, while extract and boss-clear bank carried assets into the persistent stash.
- Expedition active-run persistence is scoped by normalized route identity (`expeditionId + mapId`); direct Expedition starts use the default `phase01-first-playable-expedition / phase01-prototype-map` identity.
- Persistent stash is local-only and global in the first slice; it mutates on defeat, extract, or boss clear. Route-scoped stash ownership is explicitly out of scope.
- `SaveWorldStateSnapshot` can read Story/Hub session, global persistent stash, and route-keyed active-run slices through an explicit `Storage`-like adapter while preserving the default localStorage/memory fallback; corrupt JSON cleanup and legacy active-run migration/cleanup happen against the supplied adapter. `SaveWorldStateDocument` restore execution remains descriptor-driven through an injected write adapter, only applies the same current owners, and keeps the legacy unscoped active-run key as an explicit restore no-op. `SaveWorldStateDocumentTransfer` composes explicit source export and explicit target restore without ambient `globalThis.localStorage`, target reads, or source restore writes. `SaveWorldStateDocumentTransferVerification` is the explicit readback seam for injected restore/transfer checks: after restore it re-exports the target through the existing snapshot/document path using the expected active-run identity and reports JSON-path differences against the expected document. Production UI / real migration wiring stays deferred.
- `RunPersistence` still owns persistent-stash writes, but `savePersistentStash` now accepts the same explicit `Storage`-like adapter seam as the read path. `ExpeditionState.bootstrap` uses the accepted `GameWorldStatePersistentStashWrite` seam for its bootstrap stash materialization while preserving the same adapter/default fallback behavior; active-run writes and `RunResolution` terminal stash writes still use the existing runtime persistence boundaries.
- `GameWorldStatePersistentStashWrite` is the narrow write-facing seam over the current `cardgame.persistent-stash.v1` compatibility key. It builds from `GameWorldState`, validates the persistent-stash compatibility metadata, deep-clones stored-stash or seed-fallback documents into a write plan, and delegates the apply step to `savePersistentStash` without changing the JSON shape, storage key, active-run route ownership, Expedition scene flow, RunResolution math, UI, or content data. Its explicit-storage APIs still avoid ambient `globalThis.localStorage`; Expedition bootstrap additionally preserves the existing default localStorage/memory fallback for production compatibility.
- `StoryHubSessionPersistence` is the write/read boundary for the `cardgame.story-hub-session.v1` document and now accepts an optional `Storage`-like adapter on Hub/Story load, save, single Story-session clear, and test raw/reset helpers. HubScene/StoryScene still use the no-argument default path, which preserves localStorage first and in-memory fallback behavior; injected Story/Hub flows clean corrupt or stale documents only in the supplied adapter and keep the schema-version-1 `{ schemaVersion, hubs, stories }` JSON shape.
- `GameWorldStateStoryHubSessionWrite` is the narrow plan/apply seam over the current `cardgame.story-hub-session.v1` compatibility key. It validates Story/Hub compatibility metadata, schema version 1, and Hub/Story session identity keys, deep-clones from-view/from-document/runtime-session plans and results, and delegates document writes through `StoryHubSessionPersistence`; HubScene Hub-location saves plus StoryScene runtime-session saves/clears now call this boundary through the default localStorage/memory fallback helpers while preserving the same save key, JSON shape, UI, content data, and existing scene-triggered save/restore flow.
- `GameWorldStateActiveRunWrite` is the narrow plan/apply seam over the current route-keyed `cardgame.active-run.v1:*` active-run compatibility boundary. It validates active-run compatibility metadata from `SAVE_COMPATIBILITY_REGISTRY`, requires explicit storage adapters, normalizes route identity through `RunPersistence` helpers, rejects document/route identity mismatches, deep-clones run documents and plans/results, and delegates save/clear apply steps (including legacy unscoped or legacy route-key cleanup) to `saveActiveRun` / `clearActiveRun`. `ExpeditionState` and `RunResolution` continue to use their existing runtime persistence boundaries for this slice.

### Pending Todos

None yet.

### Blockers/Concerns

- Dropped-bag recovery, multi-map progression, and full deckbuilding remain deferred beyond the first playable loop.
- Prototype shop / event content formats exist for Phase 01; richer content packs remain deferred.

## Session Continuity

Last session: 2026-04-06 00:00
Stopped at: Planned Phase 01 and created the first executable PLAN cards
Resume file: None

## Durable Save Transfer Notes

- `SaveWorldStateDocumentTextTransfer` is the pure manual JSON text seam over the document codec, transfer, and verification adapters: it exports stable codec JSON text from an injected source, restores parsed/migrated JSON text into an injected target, exposes the migration report, and returns restore readback verification.
