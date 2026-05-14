# HOPI Todo

This file is the planning reservoir. The kanban is the active execution queue.

## Goal 439c8289-a3f4-4bad-9f75-45d60ed1b05d — 新建教学关

### Active / promoted kanban

- [promoted] 固化教学关剧本大纲与教学矩阵。
  - Task: `eccf1b2b-69d8-42cf-8c0e-67311371c782`
  - Scope: recover the durable Qingyun tutorial blueprint/matrix document on current `dev`, including story arc, 12 checkpoints, two-battle rationale, resource identity plan, and deterministic requirements; docs/content-design only, no runtime or JSON resource edits.
- [promoted] 登记教程资源身份与可校验内容骨架。
  - Task: `2fc23311-f934-4eff-9455-3d9499123327`
  - Scope: complete the missing tutorial WorldMap / Hub / Story skeleton resources and catalog registrations on top of the already-landed tutorial Expedition/deck/encounter/worldSeed files and the verified Battle deterministic setup seam; do not wire MainMenu entry, session/reset, guidance UI, or overwrite the outer-mountain content.

### Done

- [done] 为教程战斗添加确定性牌序启动边界。
  - Evidence: current `src/game/types/battle.ts`, `src/game/scenes/battle/battleSceneLaunch.ts`, `src/game/scenes/battle/BattleScene.ts`, Story battle round-trip, and Expedition battle launch cloning support explicit `deterministicBattleSetup.deckOrder = preserve-json-order`; focused verification on 2026-05-14 passed 83 tests across contentCatalog, StoryState, battleSceneLaunch, battleLaunchFlow, storyFlow, and storyBattleRoundTrip, while ordinary battles still shuffle by default.
- [done] 落地教程秘境路线、固定事件与撤离内容。
  - Evidence: task `84408016-b665-464e-bd74-1ccd09538a65` added tutorial outer-mountain Expedition map/events/shop/worldSeed/deck/encounter catalog resources and verified fixed event outcome, shop/reward, battle routing, and extract intent while preserving ordinary Expedition randomness and active-run semantics.
- [done] 为教程秘境事件添加确定性结果选择边界。
  - Evidence: current `src/game/scenes/expedition/nonCombatNodeFlow.ts` supports opt-in `fixedOutcome` selection and throws for missing fixed outcomes, while no selection or `weightedRandom` keeps ordinary weighted random behavior.

### Later candidates / not in current batch

- [done] 落地教程大地图与 Hub 路由内容.
  - Scope: 填充教学专用的大地图与 Hub 路由内容，连接青云镇与青云宗山门。
- [done] 落地教程故事与首场演武战斗内容.
  - Scope: 填充青云镇茶棚传闻、山门问心故事线以及首场教学战斗的具体节点与选择分支。
- [promoted] 增加 MainMenu 教学入口与独立教程 route shell after tutorial world-map / Hub / Story / Expedition content is coherent enough to choose a stable tutorial worldMap entry.
- [candidate] 设计教程 session 隔离与重置边界 so replaying tutorial does not pollute normal Story/Hub sessions or Expedition active runs; do this after the route shell exposes the exact launch/session identity.
- [candidate] 添加教学提示与检查点 UI only after playable tutorial content exists and the critical path can be smoke-tested without extra UI.
- [parked] First-start forced tutorial, CG/voice/portrait production, rewards that affect formal saves, broad scene rewrites, and release/deploy work require later explicit decisions.

## Goal d252bb99-35c4-460e-b1f3-b3d3fe05af80 — Mature scalable game architecture

### Active / promoted kanban

- [blocked] 2026-05-10 Planner milestone stop: no generator tasks are promoted for the mature-architecture Goal until a human reviews whether the accepted architecture spine should be validated through real content/product work or continued through one explicitly selected architecture seam.

### Ready next batch

- [blocked] None while the milestone review is unanswered.

### Later candidates / not in current batch

- [candidate] Refresh README runtime-loader wording if the review chooses docs cleanup first: Expedition-sourced Battle encounter loading should be described as catalog-first via `encounterResourceId`, with `encounterFile` only as compatibility alias/fallback; no runtime code, content JSON, save keys, product scope, or gameplay change.
- [candidate] Now that the GameWorldState persistent-stash write boundary has landed, consider adopting that seam in the existing Expedition/RunResolution write paths only if tests prove current behavior, route identity, and storage shape remain unchanged.
- [candidate] Now that gongfa condition evaluation is extracted, consider the next smallest battle semantic seam: either one explicit unsupported gongfa action only after a concrete content/product need, or a focused battle effect/status adapter review. Do not infer broad universal effect interpreter scope.
- [candidate] Now that the content catalog validation-index split has landed, continue splitting the catalog by domain only when it reduces future validation risk without changing rules; scene/controller decomposition remains parked until contract seams stay green.
- [parked] Browser save/import-export UI, scene-triggered save/restore, new save keys, real migrations, profile/cloud save, unlock/current-position world-state ownership, economy redesign, broad scene rewrites, product content/UI, authoring tooling, and release/deploy work remain out of this batch.

### Done

- [done] Added a narrow GameWorldState persistent-stash write boundary.
  - Evidence: commit `5cf5611` added `GameWorldStatePersistentStashWrite.ts` and focused tests, materializing stored-stash or seed-fallback views through an explicit storage adapter while preserving `cardgame.persistent-stash.v1`, JSON shape, cloning semantics, `lastRunSummary`, deck/item/spirit-stone stacks, and no ambient `globalThis.localStorage` dependency.
- [done] Split content catalog validation index plumbing into a focused module.
  - Evidence: commit `04972b9` added `contentCatalogValidationIndex.ts`, moved resource loading/domain-id/loaded-index/resource-id lookup diagnostics out of `contentCatalog.ts`, and preserved catalog APIs, runtime resolver behavior, checked-in content, and current validation diagnostics.
- [done] Extracted pure gongfa condition evaluation from UnitEffectManager.
  - Evidence: commit `566c98a` added `gongfaConditionEvaluation.ts` and focused tests, delegating `ArtifactUsedThisTurn`, `UnitOnField`, `CardInHand`, and `ArtifactEquipped` checks from `UnitEffectManager` while preserving weapon-label fallback, numeric/expression `maxStar`, missing trigger-unit fallback, and current `Custom` warning/false behavior.
- [done] Added a manual JSON save-document text-transfer helper over injected adapters.
  - Evidence: commit `9617669` added `SaveWorldStateDocumentTextTransfer.ts` and focused tests, composing the JSON codec, injected transfer, and verification/readback seams into stable text export/restore helpers without ambient localStorage, browser UI, new save keys, real migrations, gameplay changes, or product content.
- [done] Added a gongfa action dispatch registry for implemented operations.
  - Evidence: commit `e56db05` added `gongfaOperationDispatch.ts` and focused tests, delegating card-flow, `GainArmor`, and `ImmediateAttack` through existing typed adapters while preserving action order, executed aggregation, contexts, gongfa logs, and unsupported-action warnings/false returns.
- [done] Added injected persistent-stash writes for the GameWorldState slice.
  - Evidence: commit `65098e8` threaded explicit storage adapters through current persistent-stash writes, bootstrap seed persistence, and terminal run-resolution writes while preserving the `cardgame.persistent-stash.v1` key, route-keyed active-run behavior, stash/economy math, default fallback behavior, save shape, UI, and product content.

- [done] Extracted typed ImmediateAttack gongfa operation adapter.
  - Evidence: commit `41aaa51` added `gongfaAttackOperations.ts` and focused tests, delegated current `ImmediateAttack` handling from `UnitEffectManager`, and preserved trigger-unit checks, enemy targeting, artifact attack bonus, damage multiplier flooring, combat-manager call shape, log text, warnings, and return semantics without adding unsupported gongfa actions or a universal effect interpreter.
- [done] Added pure save document JSON codec boundary.
  - Evidence: commit `67c11d5` added `SaveWorldStateDocumentCodec.ts` and focused tests, serializing validated current save documents to stable pretty JSON text and parsing JSON through the migration pipeline without storage writes, UI, new keys, real migrations, or scene wiring.
- [done] Extracted pure GameWorldState persistent-stash operations.
  - Evidence: commit `83b7d65` added `GameWorldStateStashOperations.ts` and focused tests, then delegated current Expedition and RunResolution deck/item/spirit-stone stack math to that pure boundary while preserving storage ownership, route identity, reward summaries, and gameplay/economy behavior.
- [done] Added a pure save document migration pipeline boundary.
  - Evidence: commit `1f4db5d` added `SaveWorldStateDocumentMigration.ts` and focused tests, delegated the compatibility `migrateSaveWorldStateDocument` API, cloned and validated current v1 documents, reported zero applied document migrations, preserved owner hook counts, and rejected unsupported schema/content metadata without adding storage writes, UI, new keys, or real migrations.
- [done] Added a read-only GameWorldState view over current slices.
  - Evidence: commit `8ba0c8b` added `GameWorldState.ts` and focused tests, projecting Story/Hub session, stored-stash or seed-fallback persistent stash, active-run identity/document, and RunResolution metadata as deep-cloned readonly data without taking write ownership or changing bootstrap, storage keys, save document shape, or gameplay.
- [done] Extracted a typed gongfa GainArmor operation adapter.
  - Evidence: commit `ad2cf52` added `gongfaArmorOperations.ts` and focused tests, delegated current `GainArmor` handling from `UnitEffectManager`, and preserved armor status side effects, log text, warnings, expression fallback behavior, and return semantics without adding unsupported gongfa actions or broader effect interpretation.
- [done] Built the typed gongfa card-flow operation adapter.
  - Evidence: commit `d0bb287` added `gongfaCardOperations.ts` and focused tests, delegated implemented recovery/search/draw-filter handling from `UnitEffectManager`, and preserved current card movement, logs, warnings, and runtime behavior without adding unsupported action semantics. Planner focused verification on 2026-05-10: `bun test src/game/managers/battle/gongfaCardOperations.test.ts src/game/services/SaveWorldStateDocumentTransferVerification.test.ts src/game/state/GameWorldStateSeed.test.ts src/game/managers/battle/UnitEffectManager.test.ts src/game/state/ExpeditionState.test.ts` passed 27 tests/0 failures.
- [done] Verified injected save-document transfer target readback.
  - Evidence: commit `962d146` added `SaveWorldStateDocumentTransferVerification.ts` and tests for target readback, mismatch reports, null stash/active-run remove verification, malformed-document rejection before writes, and injected storage without ambient localStorage. Planner focused verification on 2026-05-10: the 27-test focused run above passed with 0 failures.
- [done] Extracted initial world-state seed bootstrap into a pure boundary.
  - Evidence: commit `0b106e0` added `GameWorldStateSeed.ts` and tests, delegated `ExpeditionState.bootstrap` starter stash creation to it, and preserved load-existing-stash, save-new-stash, route-keyed active-run, fallback defaults, and cloning semantics. Planner focused verification on 2026-05-10: the 27-test focused run above passed with 0 failures.

- [done] Extracted current gongfa `CardFilter` matching into a pure helper.
  - Evidence: commit `d557363` added `gongfaCardFilter.ts` and focused tests, delegated current recovery/search/draw-filter filter checks from `UnitEffectManager`, reused the restricted gongfa expression evaluator, and preserved current behavior without new action semantics.
- [done] Composed injected-storage save document export and restore transfer.
  - Evidence: commit `02e560f` added `SaveWorldStateDocumentTransfer.ts` and tests, composing snapshot/document/restore-plan/executor modules over explicit source and target storage adapters while avoiding ambient `globalThis.localStorage`, new keys, real migrations, UI, or scene wiring.
- [done] Validated canonical initial world-state stash/deck/item references.
  - Evidence: commit `0f94b78` extended catalog-backed ID validation for `world.seed.initial-state`, starter stash `deckRef`, world item IDs/types/counts, `spiritStones`, player attributes, canonical world item declarations, and catalog kind/publicPath alignment while preserving current starter stash semantics.


- [done] Replaced executable gongfa numeric expressions with a restricted pure evaluator.
  - Evidence: commit `3d7dda6` added the `gongfaExpression` parser/evaluator, updated `UnitEffectManager` to use it for current `card.star` / `artifact.star` arithmetic, and preserved warning/fallback behavior without adding new gongfa action semantics.
- [done] Added injected-storage reads for save/world-state snapshots.
  - Evidence: commit `e73a22b` threaded explicit storage adapters through Story/Hub session snapshot reads, persistent stash reads, and route-keyed active-run snapshot reads while preserving current default localStorage/memory behavior and compatibility cleanup semantics.
- [done] Validated canonical realm/grade config resource shape and value consistency.
  - Evidence: commit `b3a0906` extended catalog-backed validation for `config.realm-presets`, `config.combat-baseline`, and `config.artifact-grade`, correcting checked-in config/docs drift while preserving helper APIs and balance.

- [done] Validated canonical `gongfa.list` schema vocabulary and action parameter shapes.
  - Evidence: commit `40ecc6b` extended catalog validation for gongfa event/condition/action vocabulary, target/destination/filter/value shapes, status references, and non-canonical Custom script IDs without adding runtime semantics. Planner focused verification on 2026-05-10: `bun test src/game/content/contentCatalog.test.ts src/game/services/SaveWorldStateDocumentRestoreExecutor.test.ts src/game/utils/RealmHelper.test.ts src/game/utils/ArtifactHelper.test.ts src/game/scenes/battle/battleSceneLaunch.test.ts src/game/managers/battle/UnitEffectManager.test.ts` passed 66 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added the injected-storage executor for `SaveWorldStateDocumentRestorePlan` operations.
  - Evidence: commit `0b33251` added `SaveWorldStateDocumentRestoreExecutor` with ordered `setItem` / `removeItem` execution against an injected adapter, explicit legacy active-run no-op handling, malformed-plan rejection, and contextual failure reporting without direct `localStorage` dependency. Planner focused verification on 2026-05-10: the 66-test focused run above passed with 0 failures, and `npm run build-nolog` exited 0.
- [done] Seeded Realm/Artifact helpers from runtime catalog-loaded config resources.
  - Evidence: commit `7ee3ec8` made Battle shared runtime resources resolve and load `config.combat-baseline` / `config.artifact-grade`, installed those configs into `RealmHelper` / `ArtifactHelper`, and preserved static fallback, helper APIs, card star/display, sacrifice, gongfa grade-derived behavior, and balance. Planner focused verification on 2026-05-10: the 66-test focused run above passed with 0 failures, and `npm run build-nolog` exited 0.

- [done] Clarified Goal intent and first-batch planning direction.
  - Evidence: 2026-05-09 planner update refined this Goal as an incremental architecture-spine effort rather than a big-bang rewrite or broad content-production pass.
- [done] Audited current architecture boundaries and scale risks.
  - Evidence: HOPI tech debt and the Goal doc record scattered content references, existing pure validators worth preserving, current persistence boundaries, battle/effect TODOs, and catalog/save/stat-effect candidate seams.
- [done] Defined the target architecture contracts and migration roadmap.
  - Evidence: `.hopi/docs/goals/d252bb99-35c4-460e-b1f3-b3d3fe05af80.md` and `.hopi/docs/decisions.md` now select the incremental contract-spine direction, non-goals, and staged migration order from catalog validation through save/world-state and stat/effect alignment.
- [done] Selected the first implementation seam and wrote its task contract.
  - Evidence: 2026-05-09 Generator selected read-only content catalog validation as the first implementation slice, recorded test/build expectations, and deferred save/world-state ownership, stat/effect unification, runtime loader adapters, and broad authoring/content work.
- [done] Implemented read-only content catalog validation for checked-in route-critical resources.
  - Evidence: commit `b0d058a` added `public/data/content-catalog.json`, `src/game/content/contentCatalog.ts`, and `src/game/content/contentCatalog.test.ts`; Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts` passed 4 tests/0 failures, focused content/route coverage passed 48 tests/0 failures, `bun test src/game/**/*.test.ts` passed 137 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Extended content catalog validation for unambiguous content ID references.
  - Evidence: commit `f592ca2` added catalog-backed card/gongfa/world-item registries and validation for deck card IDs, encounter enemy card IDs, Expedition reward card/item IDs, and card `gongfaIds`; Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts` passed 8 tests/0 failures, focused content/route coverage passed 48 tests/0 failures, `bun test src/game/**/*.test.ts` passed 141 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed WorldMap route target resolution.
  - Evidence: commit `e7f6ed3` added catalog resource IDs for WorldMap-owned Hub and Expedition route targets, pure catalog path/kind/ID alignment validation, Hub/Expedition launch payload resource-id carry-through, and docs while keeping HubScene/ExpeditionScene on existing file-path loading. Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts` passed 12 tests/0 failures, focused WorldMap/launch coverage passed 27 tests/0 failures, `bun test src/game/**/*.test.ts` passed 146 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed Hub `startStory` target resolution.
  - Evidence: commit `2828115` added `storyResourceId` aliases for checked-in Hub `startStory` actions, catalog validation for missing/wrong-kind/path-mismatched story resource IDs, Hub/Story launch payload carry-through, and docs while keeping `StoryScene` on `storyGraphFile` loading and preserving `hubId + actionId + storyGraphFile` session identity. Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts` passed 13 tests/0 failures, focused Hub/Story session coverage passed 26 tests/0 failures, `bun test src/game/**/*.test.ts` passed 147 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed Story `startBattle` target resolution.
  - Evidence: commit `6b700f9` added `encounterResourceId` / `deckResourceId` aliases for checked-in Story `startBattle` metadata, catalog validation for missing/wrong-kind/path-mismatched encounter/deck resource IDs, Story/Battle launch payload carry-through, and docs while keeping `BattleScene` on `encounterFile` / `deckFile` loading and preserving Story/Hub round-trip compatibility. Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts` passed 14 tests/0 failures, focused Story/Battle launch coverage passed 21 tests/0 failures, `bun test src/game/**/*.test.ts` passed 148 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed Expedition battle encounter target resolution.
  - Evidence: commit `7201a21` added `encounterResourceId` aliases for checked-in Expedition map battle/boss payload refs, catalog validation for missing/wrong-kind/path-or-ref-mismatched encounter resource IDs, Expedition battle launch/completion payload carry-through, and docs while keeping `BattleScene` on `encounterFile` loading and preserving active-run `runDeck` ownership. Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts` passed 15 tests/0 failures, focused Expedition/Battle coverage passed 43 tests/0 failures, `bun test src/game/**/*.test.ts` passed 154 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added the first catalog-backed runtime loader for the WorldMap entry resource.
  - Evidence: commit `c929b4b` loaded `data/content-catalog.json` through `Preloader`, added runtime catalog resolver coverage, and made `WorldMapScene` resolve `worldmap.qingyun-region` before loading the existing world-map JSON. Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts` passed 40 tests/0 failures, `bun test src/game/**/*.test.ts` passed 160 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed runtime loading for Hub definition resources.
  - Evidence: commit `54e115f` made `HubScene` resolve direct/default and WorldMap-launched Hub resources from the runtime content catalog while keeping `hubFile` compatibility, cache-key stability, loaded `hubId` checks, `targetLocationId` precedence, saved Hub location behavior, and `startStory` session semantics. Planner verification on 2026-05-09: `bun test src/game/content/contentCatalog.test.ts src/game/scenes/hub/hubSceneLaunch.test.ts src/game/scenes/hub/hubTown.test.ts src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts` passed 64 tests/0 failures.
- [done] Added catalog-backed runtime loading for Story graph resources.
  - Evidence: commit `bd6c52e` made `StoryScene` resolve direct/default and Hub-launched Story graphs from the runtime content catalog while keeping `storyGraphFile` compatibility, cache-key stability, loaded `storyId` checks, Story/Hub session keys, saved Story runtime snapshots, and StoryScene/BattleScene round-trip behavior. Planner verification on 2026-05-10: `bun test src/game/content/contentCatalog.test.ts` passed 22 tests/0 failures, focused Story runtime loader coverage passed 32 tests/0 failures, `bun test src/game/**/*.test.ts` passed 170 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed runtime loading for Story-sourced Battle encounter/deck resources.
  - Evidence: commits `55f78f4` and `3337e57` made `BattleScene` resolve Story-sourced encounter/deck JSON from the runtime content catalog by `encounterResourceId` / `deckResourceId` while preserving compatibility `encounterFile` / `deckFile`, cache-key semantics, Story/Hub session identity, StoryScene/BattleScene round trips, and Expedition/direct Battle fallbacks. Planner verification on 2026-05-10: focused Story battle runtime-loader coverage passed 53 tests/0 failures, `bun test src/game/**/*.test.ts` passed 172 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed runtime loading for ExpeditionScene target resources.
  - Evidence: commit `5306cb5` made `ExpeditionScene` resolve WorldMap-launched and direct/default target resources from the runtime content catalog by `worldStateResourceId`, `starterDeckResourceId`, `mapResourceId`, `eventsResourceId`, and `shopResourceId` while keeping compatibility file aliases, cache keys, route-keyed active-run persistence, global stash behavior, checked-in multi-Expedition isolation, and ExpeditionScene/BattleScene target-config round trips stable. Planner verification on 2026-05-10: focused Expedition target-loader coverage passed 66 tests/0 failures, `bun test src/game/**/*.test.ts` passed 177 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed runtime loading for Expedition-sourced Battle encounters.
  - Evidence: commit `7cff6b4` made `BattleScene` resolve Expedition battle/boss `encounterResourceId` values through the runtime content catalog while preserving compatibility `encounterFile`, run-scoped encounter cache keys, active-run `runDeck`, target-config propagation, route-keyed active-run persistence, and BattleScene -> ExpeditionScene completion payloads. Planner verification on 2026-05-10: focused Expedition Battle runtime-loader coverage passed 65 tests/0 failures, `bun test src/game/**/*.test.ts` passed 181 tests/0 failures, and `npm run build-nolog` exited 0.

- [done] Defined a versioned save/world-state compatibility registry.
  - Evidence: commit `8453b54` added `src/game/services/SaveCompatibility.ts`, `src/game/services/SaveCompatibility.test.ts`, and README documentation for current local persistence owners, storage keys, route-key derivation, schema versions, legacy active-run compatibility keys, and no-op migration hooks. Planner verification on 2026-05-10: focused save compatibility coverage (`SaveCompatibility`, `StoryHubSessionPersistence`, `RunResolution`, `ExpeditionState`, `expeditionSceneLaunch`, `hubTown`, `storySceneLaunch`) passed 56 tests/0 failures, `bun test src/game/**/*.test.ts` passed 189 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Added catalog-backed runtime loading for direct/default Battle resources.
  - Evidence: commit `9946da1` made direct/default `BattleScene` starts resolve `test_encounter_02` and `deck.starter` through the runtime content catalog while preserving `currentEncounter` and `starterDeck` cache keys, default file aliases, Story/Expedition source isolation, and legacy Expedition compatibility payloads. Planner verification on 2026-05-10: focused Battle runtime-loader coverage (`contentCatalog`, `battleSceneLaunch`, `battleCompletion`, `storyBattleRoundTrip`, `expedition/battleLaunchFlow`, `expeditionSceneLaunch`) passed 60 tests/0 failures, `bun test src/game/**/*.test.ts` passed 189 tests/0 failures, and `npm run build-nolog` exited 0.
- [done] Validated status IDs and aligned legacy armor references.
  - Evidence: commits `630fcbe` / `d613926` extended catalog-backed status ID registry validation for card legacy-effect `applyStatus.statusId` references, updated checked-in `pills` / `talismans` data from legacy `shield` to canonical `armor`, and refreshed card generation docs without adding a runtime alias or changing combat semantics.
- [done] Added a read-only save/world-state snapshot facade.
  - Evidence: commits `ce0a4e6` / `8e245d0` added `src/game/services/SaveWorldStateSnapshot.ts` and focused tests over Story/Hub session, persistent stash, route-keyed active runs, registry owner metadata, run-resolution metadata, and current corrupt/stale fallback semantics while preserving existing persistence owners and storage shapes.
- [done] Added catalog-backed runtime loading for Battle shared resources.
  - Evidence: commit `4ff9b60` made the six Battle shared card collections, `gongfa.list`, and `status.definitions` resolve through runtime catalog resource IDs while preserving legacy cache keys and status behavior; Planner focused verification on 2026-05-10: `bun test src/game/content/contentCatalog.test.ts src/game/scenes/battle/battleSceneLaunch.test.ts src/game/managers/battle/StatusManager.test.ts` passed 45 tests/0 failures.
- [done] Validated unit realm and artifact grade config-ID references.
  - Evidence: commit `2a510c3` extended catalog-backed validation for unit `realmId` values against `config.combat-baseline` and artifact `gradeId` values against `config.artifact-grade` with duplicate/missing/malformed registry coverage; Planner focused verification on 2026-05-10 included `src/game/content/contentCatalog.test.ts` in the 45-test focused run with 0 failures.
- [done] Defined the in-memory versioned save/world-state document contract.
  - Evidence: commit `5dc1b13` added `src/game/services/SaveWorldStateDocument.ts` and focused tests for snapshot conversion, Story/Hub session preservation, persistent stash preservation, route-keyed active-run preservation, schema/content metadata, clone/parse validation, malformed document rejection, and no-op migration boundaries without writing storage.
- [done] Centralized Realm/Artifact config lookup behind pure helper boundaries.
  - Evidence: commit `eb27b9c` added tested `buildRealmConfigLookup` / `buildArtifactGradeLookup` seams, preserved existing helper APIs and fallback behavior, and reused the artifact grade lookup in `UnitEffectManager` without balance changes.
- [done] Validated status-definition effect vocabulary and value shapes.
  - Evidence: commit `ab9b02f` extended catalog validation for canonical `status.definitions` category/timing/effect/stack-consume vocabulary, required numeric/string/boolean fields, duplicates, and malformed entries without changing runtime status semantics.
- [done] Generated a pure save-document restore/write plan for existing compatibility storage.
  - Evidence: commit `8eb236f` added `src/game/services/SaveWorldStateDocumentRestorePlan.ts` and focused tests for deterministic Story/Hub, persistent stash, active-run, and legacy no-op operation descriptors while avoiding direct storage mutation.



## Goal 05dce62b-91c1-4dd7-a8e9-f9346b1bc7a4 — 故事系统

### Active / promoted kanban

- [active] Goal manually restarted on 2026-05-09. Do not treat first-iteration completion as terminal; continue by promoting exactly one later candidate at a time, or create one substantive blocking DecisionTopic when product direction is required.
- [active] The 大地图 / world-map direction now has a complete routing-and-presentation proof: multiple Hub/location entries, multiple Expedition/秘境 entries, route-owned launch payloads, route-keyed Expedition active-run persistence, and draggable spatial markers are all landed.
- [active] Human product direction selected after the draggable world-map slice: world-map first-level nodes such as towns should open a similar draggable Hub sub-map, with second-level nodes such as blacksmith/academy-style locations scattered on that sub-map; clicking a second-level node then opens the current action/options interface.
- [active] Commit `e20c899` landed the first Hub sub-map presentation proof for existing Hub locations. Do not create a duplicate Hub sub-map task.
- [parked] No next story-system implementation is ready until the human chooses one concrete post-sub-map product direction; the remaining candidates pull different ownership boundaries.
- [blocked] 2026-05-10 Planner review: keep the story-system generator lane empty for this Goal until a human chooses exactly one next increment. Creating 2-3 speculative tasks now would either edit overlapping Hub/world-state/content files or silently decide product direction without approval.

### Ready next batch

- [blocked] None after the Hub sub-map presentation slice; ask one substantive product question before promoting the next implementation task.
- [not-ready] Candidate first-task shapes after the answer, to be promoted only for the selected direction:
  - If the choice is real second-level content: add one small Hub content slice with a new concrete location/action/story graph, preserving current `HubScene` sub-map and Story/Hub session boundaries.
  - If the choice is unlock/world-state: define and test the minimal read/write owner for destination or Hub-location unlock flags before adding locked content.
  - If the choice is current-position/map-state: persist and restore the smallest durable world-map / Hub sub-map position state without changing route payload ownership.
  - If the choice is Hub operations: add exactly one operation kind with a pure model/test first, not a full shop/rest/training suite.
  - If the choice is Expedition/story integration or content-rich secret realm: scope it to one route and one transition/content seam, leaving reward economy and broad `mijing` migration out.

### Later candidates / not in current batch

- [candidate] Add another Hub/location destination only when it proves a distinct product need beyond the already checked-in Qingyun town, Qingyun sect gate, and direct tea-house routes.
- [candidate] Choose exactly one next post-sub-map product increment rather than auto-bundling: add real second-level location content such as blacksmith/academy, destination unlock/world-state ownership, current-position persistence, a content-rich secret realm, Hub operations, or Expedition/story-content integration.
- [candidate] Expand world-map presentation further only after the first spatial marker/drag slice is stable: richer terrain art, region labels, zoom, keyboard/gamepad navigation, or durable current-position display.
- [candidate] Add destination unlock conditions only after the world-state ownership boundary is designed.
- [candidate] Broaden Story/Hub session persistence into shared world-state ownership only after the versioned local boundary and multi-graph resume/reset semantics prove stable.
- [candidate] Add concrete Hub operation kinds such as talk, rest, shop, or training only after multi-graph `startStory` remains stable and the product need is specific.
- [candidate] Connect Expedition exits or selected `mijing` event/shop content to the generic story format if it proves useful.
- [candidate] Add richer UI polish: portraits, speaker names, scrollback/history, keyboard/gamepad navigation, and localization conventions.
- [candidate] Add tooling for AI-assisted prose expansion only after the executable schema and safety constraints are stable.

### Done

- [done] Build story state plus condition/effect evaluation.
  - Evidence: commit `d1f0ef7` added `src/game/types/story.ts`, `src/game/state/StoryState.ts`, focused tests, and `public/data/docs/story-runtime.md`; `bun test src/game/**/*.test.ts` passes.
- [done] Create initial story flow view-model scaffold.
  - Evidence: commit `cdd8167` added `src/game/scenes/story/storyFlowViewModel.ts` and tests for the draft graph. Follow-up remains required to consume the executable content contract and runtime state.
- [done] Add a minimal playable Phaser `StoryScene` for the example story.
  - Evidence: commit `c1d102d` added `StoryScene`, `storyFlow.ts`, story flow tests, registered `StoryScene`, changed `Boot` to start it, and expanded `public/data/story/story-graph.json` into a playable graph.
- [done] Stabilize the playable `StoryScene` slice and reconcile duplicate flow models.
  - Evidence: commit `bace349` fixed the stale `storyFlowViewModel` missing-target assumption, kept broken-target coverage on synthetic fixtures, narrowed `storyFlow.ts` to strict graph validation, and left `storyFlowViewModel.ts` owning render/transition view models. Planner check on 2026-05-09: `bun test src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts`, `bun test src/game/**/*.test.ts`, and `npm run build-nolog` all pass on `main`.
- [done] Resolve and integrate runtime-backed conditions/effects into the stabilized `StoryScene` flow.
  - Evidence: commit `b7a266a` connected the playable story flow to `StoryState`, declarative `StoryCondition`, and `StoryEffect`; the checked-in story graph now covers sublocation movement, an attribute-gated choice, a prior dialogue/flag unlock, blocked unmet conditions, state effects, and deterministic transitions. Planner check on 2026-05-09: `bun test src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts src/game/types/storyContent.test.ts`, `bun test src/game/**/*.test.ts`, and `npm run build-nolog` all pass on `main`.
- [done] Add writer-facing story authoring documentation and a compact schema example for the settled StoryState-backed content contract.
  - Evidence: commit `bf9e59b` added `public/data/docs/story-authoring-guide.md`, `public/data/story/story-graph.compact.example.json`, README/content-contract references, and storyFlow coverage that keeps the compact example valid. Planner check on 2026-05-09: `bun test src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts` passed 17 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add the durable MainMenu entry to the example story and remove the temporary direct Boot smoke path.
  - Evidence: commit `abe4bc4` restored `Boot -> Preloader -> MainMenu`, added a `MainMenu` action for `StoryScene`, updated startup flow coverage, and documented the route in `README.md`. Planner check on 2026-05-09: `bun test src/game/scenes/startupFlow.test.ts src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts src/game/types/storyContent.test.ts` and `npm run build-nolog` pass on `main`.
- [done] Define the pure story battle trigger contract and launch metadata.
  - Evidence: commit `99ce45f` added declarative `startBattle` metadata, result-node validation, `StoryState.pendingBattle`, `storyFlowViewModel` battle launch metadata, docs, and focused tests while keeping actual Phaser scene switching deferred. Planner check on 2026-05-09: `bun test src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts src/game/types/storyContent.test.ts` passed 26 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Wire validated story battle launch through `StoryScene` / `BattleScene` and return to story outcome nodes.
  - Evidence: commit `3899b72` added source-aware story battle launch normalization, `StoryScene` battle start / resume handling, `storyBattleRoundTrip` helpers and tests, story battle completion event routing, docs, and an example graph battle branch while keeping Expedition battle completion separate. Planner check on 2026-05-09: `bun test src/game/**/*.test.ts` passed 75 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add a minimal data-driven Hub/town shell that launches the existing story graph.
  - Evidence: commit `4be5fe1` added `public/data/hub/town-shell.json`, `HubScene`, pure Hub config/launch helpers and tests, `MainMenu -> HubScene -> StoryScene` routing, StoryScene launch payload normalization, docs, and preservation of story battle resume against the launching graph file. Planner check on 2026-05-09: `bun test src/game/**/*.test.ts` passed 82 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add in-memory data-driven Hub sublocation navigation to the town shell.
  - Evidence: commit `c8b3176` extended `public/data/hub/town-shell.json` to multiple locations, added validated `navigate.targetLocationId` actions, kept `startStory.storyGraphFile` data-driven, updated `HubScene`, Hub tests, README, and story authoring/content docs. Planner check on 2026-05-09: `bun test src/game/**/*.test.ts` passed 84 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add the first durable Story/Hub session persistence boundary.
  - Evidence: commit `0af2fd8` added `src/game/services/StoryHubSessionPersistence.ts`, persisted/restored current Hub location/status, resumed per-Hub-action story runtime snapshots, preserved Hub session keys through story battle round-trips, and documented the local session contract. Planner check on 2026-05-09: `bun test src/game/**/*.test.ts` passed 91 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add a second Hub-launched tea-house side-story graph.
  - Evidence: commit `40b0cd2` added `public/data/story/qingyun-teahouse-rumors.json`, wired `action.start-teahouse-rumors-story` in `public/data/hub/town-shell.json`, added focused Hub tests proving both Hub-launched story graphs validate and story runtime snapshots remain isolated by `hubId + actionId + storyGraphFile`, and updated README / story authoring / content docs. Planner check on 2026-05-09: `bun test src/game/**/*.test.ts` passed 93 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add a data-driven `WorldMapScene` shell that launches existing Hub and Expedition/`mijing` routes.
  - Evidence: commits `9ef1e4d` and `ea75970` added `public/data/world/world-map.json`, `src/game/scenes/worldmap/WorldMapScene.ts`, the pure `worldMap.ts` validation / launch-intent contract, scene registration, `MainMenu -> WorldMapScene -> HubScene | ExpeditionScene` startup coverage, README and content-contract docs. Planner check on 2026-05-09: `bun test src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts` passed 9 tests/0 failures; `bun test src/game/**/*.test.ts` passed 99 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add a minimal return/resume loop from existing Hub and Expedition routes back to `WorldMapScene`.
  - Evidence: commit `f15579e` added Hub and Expedition return-to-map affordances, a typed `createWorldMapReturnIntent`, `WorldMapScene` return status handling, README/content-contract updates, and startup/world-map tests covering `MainMenu -> WorldMapScene -> HubScene | ExpeditionScene -> WorldMapScene` without clearing Hub session or Expedition active-run ownership. Planner check on 2026-05-09: `bun test src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts` passed 11 tests/0 failures; `bun test src/game/**/*.test.ts` passed 101 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Make `WorldMapScene` destination payloads authoritative for Hub and Expedition route target config.
  - Evidence: commit `cbdf1f3` added typed Hub / Expedition launch normalization, destination-owned target data/config fields in `public/data/world/world-map.json`, non-default Hub / Expedition cache-key routing, target config carry-through for Expedition battle round-trips, README/content-contract updates, and focused tests for route payload ownership while preserving direct scene defaults. Planner check on 2026-05-09: `bun test src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts src/game/scenes/hub/hubTown.test.ts src/game/scenes/expedition/*.test.ts` passed 47 tests/0 failures; `bun test src/game/**/*.test.ts` passed 109 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add the first additional data-driven world-map Hub/location destination backed by its own Hub JSON file.
  - Evidence: commit `5b73f89` added `public/data/hub/qingyun-sect-gate.json`, a `destination.qingyun-sect-gate` Hub destination in `public/data/world/world-map.json`, validation proving the new Hub file can launch the existing mainline story through data, and docs covering distinct Hub session identity. Planner check on 2026-05-09: `bun test src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/hub/hubSceneLaunch.test.ts src/game/scenes/hub/hubTown.test.ts src/game/scenes/startupFlow.test.ts` passed 27 tests/0 failures; `bun test src/game/**/*.test.ts` passed 113 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add one additional world-map Hub-location destination into an existing Hub location.
  - Evidence: commit `d41fca8` added `destination.qingyun-town-teahouse` with `targetLocationId`, updated Hub launch/location selection contracts so map routes can enter a specific Hub location, and refreshed README/content docs. Planner check on 2026-05-09: `bun test src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/hub/hubSceneLaunch.test.ts src/game/scenes/hub/hubTown.test.ts src/game/scenes/startupFlow.test.ts` passed 27 tests/0 failures; `bun test src/game/**/*.test.ts` passed 113 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Key Expedition active-run persistence by route identity before adding a second secret-realm destination.
  - Evidence: commits `c01a8f4` / `dd959a1` added normalized Expedition target route keys (`expeditionId + mapId`), route-scoped active-run load/save/clear/migration helpers, direct/default Expedition fallbacks, battle round-trip `targetConfig` preservation, and tests proving independent active runs for multiple targets while keeping the persistent stash global. Planner check on 2026-05-09: `bun test src/game/services/RunResolution.test.ts src/game/state/ExpeditionState.test.ts src/game/scenes/expedition/*.test.ts src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts` passed 54 tests/0 failures; `bun test src/game/**/*.test.ts` passed 120 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add the first additional Expedition/秘境 world-map destination backed by explicit target config.
  - Evidence: commit `3c08989` added `destination.qingyun-jade-cave-trial`, `public/data/mijing/jade-cave-map.json`, explicit `phase01-jade-cave-expedition / phase01-jade-cave-map` route target config, route-label handling, and coverage proving the original Qingyun outer-mountain trial and the jade-cave route keep independent active runs while direct/default `ExpeditionScene` behavior and the global persistent stash remain unchanged.
- [done] Replace the `WorldMapScene` destination menu with a data-driven draggable spatial map presentation.
  - Evidence: commits `3526750` / `df58c82` added world-map presentation metadata for all five destinations, validated normalized marker coordinates and map surface geometry, rendered clickable markers on a draggable/clamped map surface, guarded marker activation when pointer movement exceeds the drag threshold, and preserved Hub / Hub-location / Expedition launch payload ownership. Planner check on 2026-05-09: `bun test src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts src/game/scenes/expedition/expeditionSceneLaunch.test.ts` passed 24 tests/0 failures; `bun test src/game/**/*.test.ts` passed 129 tests/0 failures; `npm run build-nolog` exited 0.
- [done] Add a data-driven draggable Hub sub-map for existing Hub locations.
  - Evidence: commit `e20c899` added Hub sub-map presentation metadata to `public/data/hub/town-shell.json` and `public/data/hub/qingyun-sect-gate.json`, validates top-level map dimensions / initial center and per-location marker metadata in `src/game/scenes/hub/hubTown.ts`, renders a draggable/clamped marker sub-map in `HubScene`, and preserves existing `hubId`, `hubFile`, `targetLocationId`, saved Hub location, `navigate`, and `startStory` session semantics. Planner check on 2026-05-09: `bun test src/game/scenes/hub/hubTown.test.ts src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/startupFlow.test.ts` passed 34 tests/0 failures; `bun test src/game/**/*.test.ts` passed 133 tests/0 failures; `npm run build-nolog` exited 0.

## Cross-goal maintenance spotted by Radar

- [ready] Reconcile legacy `.planning` Phase 01 docs or mark them superseded by HOPI.
  - Scope: update `.planning/PROJECT.md`, `.planning/STATE.md`, and `.planning/REQUIREMENTS.md` so they no longer claim `Boot.ts` directly enters `BattleScene`, Phase 01 is 0% / "Ready to execute", or RUN/MAP/NODE/OUT traceability is still Pending after the playable Expedition/WorldMap/Story/Hub slices landed. If `.planning` is no longer authoritative, add an explicit superseded-by-HOPI notice instead of partially refreshing old metrics.
  - Acceptance: `rg -n 'Boot.ts.*BattleScene|Ready to execute|Progress: .*0%|\\| .*Pending \\|' .planning` no longer reports stale Phase 01 status unless quoted under a dated/superseded note; no runtime behavior changes.

- [done] Fix the red expedition copy test after the Chinese UI text update.
  - Scope: Align `src/game/scenes/expedition/entryFlowModel.test.ts` with the current Chinese `createPreparationSummary` output, or intentionally change the runtime copy if English is still desired.
  - Original evidence: Radar saw `entryFlowModel > summarizes the entrance state after acknowledging a terminal run result` expecting English copy while implementation returned Chinese copy.
  - Acceptance: `bun test src/game/**/*.test.ts` passes; `npm run build-nolog` remains green.
  - Latest check: The original expedition copy test now passes; after `bace349`, `bun test src/game/**/*.test.ts` and `npm run build-nolog` are green on `main`.
