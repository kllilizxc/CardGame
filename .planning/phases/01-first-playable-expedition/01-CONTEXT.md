# Phase 01: First Playable Expedition - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver one complete prototype 秘境 run loop on top of the existing battle scene: persistent starter stash, run snapshot, layered node map, battle / event / shop / extract / boss node resolution, and permanent keep-or-lose outcomes. Full deckbuilding, multiple maps, and corpse-recovery systems are out of scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Run structure
- **D-01:** Phase 01 uses one persistent local starter stash, not a full deckbuilder. The player reviews and confirms that stash before entering the run.
- **D-02:** One active run may exist per Expedition route identity. Active-run persistence is keyed by normalized `expeditionId + mapId`; direct/default Expedition starts use `phase01-first-playable-expedition / phase01-prototype-map`.
- **D-03:** The first slice ships a single prototype 秘境 with fixed topology and guaranteed entrance / battle / event / shop / extract / boss coverage.
- **D-03a:** The persistent stash remains a single global local store for Phase 01. Route-scoped stash ownership is out of scope until a later economy / ownership design.

### Map and visibility
- **D-04:** Movement is node-to-node on a Slay the Spire style layered map; only directly connected adjacent nodes are selectable.
- **D-05:** Fog of war reveals cleared nodes, currently reachable nodes, and the outline of the next layer only.
- **D-06:** Node internals may use small random pools, but the map topology stays fixed for Phase 01.

### Node resolution
- **D-07:** Battle and boss nodes must hand off to the existing `BattleScene` instead of creating a second combat system.
- **D-08:** Event and shop nodes mutate only the current run inventory and currency, then return the player to the map.
- **D-09:** Shop uses a simple run currency (`spiritStones`) earned or found during the run; no permanent economy or crafting is introduced in Phase 01.

### Run outcomes
- **D-10:** Losing any combat ends the run immediately, removes all carried / looted cards, items, and currency from the stash snapshot, and returns the player to the entrance.
- **D-11:** Boss clear or choosing extract ends the run successfully and commits all carried / looted cards, items, and currency back into the persistent stash.
- **D-12:** Recovery bags, extraction-point resume, and multi-map persistence rules are explicitly deferred.

### the agent's Discretion
- Exact HUD layout and node icon art treatment.
- Exact JSON schema details for event or shop reward tables, as long as they satisfy the decisions above.
- Whether the post-run summary is an overlay or an entrance panel refresh, as long as it is readable and returns to the entrance state.

</decisions>

<specifics>
## Specific Ideas

- Source-of-truth brief: “玩家带着自己的卡组和道具进入一个搜打撤地图，通过爬塔类方式探索地图，可能有小怪，BOSS，撤出点，随机事件，商店等。如果玩家输掉就会失去所有卡片和道具回到入口，如果玩家通关 BOSS 或者从撤离点撤出即可保留身上所有卡片和道具。”
- The existing README already frames the game as a 修仙 card-battle prototype, so this phase should feel like extending that prototype rather than replacing it.
- The broader `秘境.md` document mentions dropped-bag recovery, but Phase 01 intentionally stops at “extract keeps / death loses all”.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product intent and scope
- `.planning/PROJECT.md` — Current product framing, scope boundary, and constraints.
- `.planning/REQUIREMENTS.md` — Checkable v1 scope for the first playable expedition.
- `.planning/ROADMAP.md` — Phase goal, success criteria, and plan breakdown.

### Existing game systems
- `README.md` — Current architecture, data layout, and battle prototype overview.
- `src/game/main.ts` — Scene registration and current game boot flow.
- `src/game/scenes/Boot.ts` — Current entry scene routing.
- `src/game/scenes/battle/BattleScene.ts` — Existing combat scene to reuse.
- `src/game/managers/battle/BattleTickManager.ts` — Existing callback path that already expects `handleBattleEnd(victory)`.

### Game rules and data
- `public/data/docs/秘境.md` — Secret realm / 搜打撤 loop expectations and node semantics.
- `public/data/docs/battle-rules.md` — Battle assumptions and card taxonomy.
- `public/data/decks/starter-deck.json` — Starter deck seed for the persistent stash.
- `public/data/world/initial-state.json` — Current world-state seed that Phase 01 will extend with stash data.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/game/scenes/battle/BattleScene.ts`: already loads decks, spawns encounters, and renders a complete battle flow.
- `src/game/EventBus.ts`: simple cross-scene event emitter that can carry battle or run-resolution events.
- `public/data/cards/*.json` and `public/data/types/cards/*`: existing data-driven content pipeline for cards and items.
- `src/game/config/LayoutConfig.ts`: a reusable pattern for centralized Phaser UI layout decisions.

### Established Patterns
- Content is loaded via `this.load.json(...)` and retrieved from the Phaser cache per scene.
- Scene orchestration currently happens through `main.ts` + `Boot.ts`; a new expedition scene must slot into that path.
- Battle responsibilities are already split across managers; new expedition systems should prefer new state / service / UI modules over inflating `BattleScene` further.

### Integration Points
- A new expedition entry scene must become the default boot target.
- Battle nodes need to pass a run-specific deck + encounter payload into `BattleScene` and receive a structured result back.
- Persistent stash and active-run storage must live outside individual scene instances so extract and defeat can mutate them safely. Active runs are route-scoped by `expeditionId + mapId`; the stash is intentionally global.

</code_context>

<deferred>
## Deferred Ideas

- Dropped storage bag recovery after a failed run.
- Multiple 秘境 maps and route packs.
- Persistent extraction-point resume across runs.
- Hub progression, unlock trees, and richer story event chains.

</deferred>

---

*Phase: 01-first-playable-expedition*
*Context gathered: 2026-04-06*
