# StoryState-backed Story Content Contracts

`public/data/world/world-map.json` is the first thin world-map shell: it declares 青云镇 Hub, 青云宗山门 Hub, 集市茶棚 Hub-location, 青云外山试炼 Expedition, and 青玉洞试炼 Expedition destinations, and `WorldMapScene` renders those destinations as clickable markers on a draggable map before routing them into the existing scenes. The world-map destination is the top-level owner of route identity, catalog-backed target resource ids (`hubResourceId` for Hub routes; `worldStateResourceId`, `starterDeckResourceId`, `mapResourceId`, `eventsResourceId`, and `shopResourceId` for Expedition routes), current runtime target files (`hubFile` plus optional `targetLocationId` for Hub routes; world-state, starter-deck, map, event, and shop files for Expedition routes), and lightweight spatial presentation metadata. Hub and Expedition routes can return to `WorldMapScene` through a typed return intent without clearing Hub session or Expedition active-run storage, so re-entering the same route resumes through the existing persistence boundary unless the selected Hub destination explicitly targets a location. Expedition active runs are partitioned by a route key derived from the normalized target identity `expeditionId + mapId`; world-map and direct scene launches both resolve to `expedition:<expeditionId>:<mapId>`, with direct/default starts falling back to `phase01-first-playable-expedition / phase01-prototype-map`. `public/data/story/story-graph.json` is the checked-in playable mainline example for StoryScene content, and `public/data/story/qingyun-teahouse-rumors.json` is a tiny checked-in side-story graph launched from the tea-house Hub location. `public/data/hub/town-shell.json` is the minimal multi-location 青云镇 Hub entry: its `navigate.targetLocationId` actions move between Hub locations and save the current Hub location to local Story/Hub session storage, and its `startStory.storyResourceId` actions resolve catalog story resources while `storyGraphFile` remains the runtime file-path alias. `public/data/hub/qingyun-sect-gate.json` is the second checked-in Hub file: it has its own `hubId` and action id while pointing at the existing playable mainline graph to prove multiple world-map Hub destinations do not share scene state or Story/Hub session identity. `public/data/mijing/jade-cave-map.json` is the second checked-in Expedition map: it declares `phase01-jade-cave-map` while reusing prototype event, shop, and encounter files to prove multiple Expedition world-map destinations do not share active-run state. `StoryScene` loads the graph file provided by its launch payload, defaulting to `data/story/story-graph.json`, `src/game/scenes/story/storyFlow.ts` strictly validates that each Hub-launched example is playable, and `src/game/scenes/story/storyFlowViewModel.ts` owns render / transition view models and runtime traversal using `StoryState`, `StoryCondition`, and `StoryEffect` from `src/game/types/story.ts` / `src/game/state/StoryState.ts`. `src/game/services/StoryHubSessionPersistence.ts` is the versioned local session boundary for Hub location and per-Hub-action Story runtime snapshots. `public/data/docs/story-authoring-guide.md` is the author-facing workflow guide, and `public/data/story/story-graph.compact.example.json` is the smallest checked-in StoryState schema example. `public/data/story/story-graph.executable.json` remains a standalone contract fixture validated by `src/game/types/storyContent.ts`.

## Graph shape

A playable story graph has:

- `storyId` and `title`: stable content identity and display name.
- `entryNodeId`: the first node to load; it must reference a node in `nodes`.
- `initialState`: seed values for `StoryState` (`locationId`, `sublocationId`, optional flags, attributes, relations, visited nodes, and triggered dialogues). `storyFlow` fills `storyId` and `nodeId` from the graph.
- `nodes`: narrative nodes with display copy, location / sublocation ids, optional AI expansion hints, and `onEnter` effects.
- `choices`: directed edges between nodes. Every `from` and `to` must reference an existing node.

Node ids and choice ids must be globally unique inside the graph.

## Declarative conditions

Choices use structured `visibleWhen` and `enabledWhen` predicates. Both fields use the `StoryCondition` shape:

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `attribute` | `attribute`, `operator`, `value` | Compare a numeric story attribute with `>`, `>=`, `<`, `<=`, `==`, or `!=`. |
| `flag` | `flag`, optional `expected` | Runtime flag must match `expected` (`true` by default). |
| `visitedNode` | `nodeId`, optional `expected` | Node history must match `expected`. |
| `triggeredDialogue` | `dialogueId`, optional `expected` | Dialogue history must match `expected`. |
| `all` | `conditions` | All child conditions pass. |
| `any` | `conditions` | At least one child condition passes. |
| `not` | `condition` | Child condition does not pass. |

The checked-in example keeps the help-girl option visible but disabled until `心性 >= 50`, and unlocks a later 青玉铃 question after either `story.sect_entry.helped_frail_girl` or `dialogue.frail_girl.intro` exists.

## Declarative effects

Nodes use `onEnter`, and choices use `effects`. Both fields use `StoryEffect` arrays:

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `setFlag` / `clearFlag` | `flag` | Set or clear a story flag. |
| `recordVisitedNode` | `nodeId` | Add node history. Usually transitions add the target node automatically. |
| `recordDialogue` | `dialogueId` | Add dialogue history for later unlocks. |
| `setAttribute` / `adjustAttribute` | `attribute`, `value` or `delta` | Set or change a numeric story attribute. |
| `setRelation` / `adjustRelation` | `relationId`, `value` or `delta` | Set or change an NPC/faction relationship score. |
| `moveTo` | `locationId`, `sublocationId`, optional `nodeId` | Move the current story position between locations / sublocations. |
| `goToNode` | `nodeId` | Jump to another story node. Choice traversal normally appends this automatically from `to`. |
| `startBattle` | `battle` | Queue story-triggered combat launch metadata; StoryScene uses it to start BattleScene and route the result back into the graph. |

`storyFlowViewModel.createStoryChoiceTransition` applies choice effects, appends the target-node transition, then applies the target node's `onEnter` effects. This keeps output deterministic and makes sublocation changes part of the checked-in content rather than free-form prose hints.

`startBattle.battle` is the story-combat contract for the first enabling slice. It requires stable `battleId`, `encounterResourceId`, `encounterId`, `encounterFile`, `deckResourceId`, `deckFile`, `onVictoryNodeId`, and `onDefeatNodeId`, plus optional `launchText`. `storyFlow` validates that victory and defeat node ids exist in the same graph. `storyFlowViewModel.createStoryChoiceTransition` exposes the selected transition's `battleLaunch` metadata (`sceneKey: "BattleScene"`, source node / choice ids, target node id, encounter resource id/file, deck resource id/file, and result node ids). `StoryScene` wraps that metadata with the current `StoryState` and selected choice ids, starts `BattleScene`, and resumes at `onVictoryNodeId` or `onDefeatNodeId` after combat.

## World map launch contract

The minimal world map lives in `public/data/world/world-map.json`. A world-map definition has a stable `id`, display copy, a `defaultDestinationId`, top-level `presentation` map dimensions / initial center, and `destinations[]`. Each destination must include `presentation.position` normalized to `0..1`, plus a lightweight `icon` and `regionLabel`. `src/game/scenes/worldmap/worldMap.ts` validates destination ids, default destination, supported kinds, required target fields, and presentation metadata before `WorldMapScene` renders clickable markers on the draggable map surface.

Supported world-map destination kinds:

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `hub` | `hubId`, `hubResourceId`, `hubFile`; optional `targetLocationId` | Start `HubScene` with the declared Hub identity and Hub JSON file. `hubResourceId` must resolve through `public/data/content-catalog.json` to a `hub` resource whose `publicPath` equals `hubFile`; `HubScene` still loads `hubFile`, not the catalog entry at runtime. If `targetLocationId` is present, it must reference a location in that Hub file; `HubScene` opens that location and saves it as the current Hub location instead of restoring an older location snapshot. Checked-in Hub destinations are `destination.qingyun-town` for `hub.qingyun-town` / `data/hub/town-shell.json`, `destination.qingyun-sect-gate` for `hub.qingyun-sect-gate` / `data/hub/qingyun-sect-gate.json`, and `destination.qingyun-town-teahouse` for the direct `location.qingyun-town.teahouse` route in the Qingyun town Hub file. |
| `expedition` | `expeditionId`, `mapId`, `worldStateResourceId`, `worldStateFile`, `starterDeckResourceId`, `starterDeckFile`, `mapResourceId`, `mapFile`, `eventsResourceId`, `eventsFile`, `shopResourceId`, `shopFile` | Start `ExpeditionScene` with the declared Expedition identity and content files. Each `*ResourceId` must resolve through `public/data/content-catalog.json` to the expected resource kind and to the matching runtime file path; `ExpeditionScene` still loads the `*File` paths. Battle and boss nodes inside the target map also carry `payloadRef.encounterResourceId`; catalog validation resolves it to kind `encounter`, verifies its `publicPath` equals `payloadRef.encounterFile`, and checks the encounter JSON id against `payloadRef.ref`. `BattleScene` still loads `encounterFile`, and `ref` remains the encounter id compatibility field. The normalized `expeditionId + mapId` becomes the active-run route key (`expedition:<expeditionId>:<mapId>`), so adding another secret-realm destination must use a stable Expedition/map identity instead of relying on destination id. Checked-in Expedition destinations are `destination.qingyun-outer-mountain-trial` for `phase01-first-playable-expedition` / `phase01-prototype-map` / `data/mijing/prototype-map.json`, and `destination.qingyun-jade-cave-trial` for `phase01-jade-cave-expedition` / `phase01-jade-cave-map` / `data/mijing/jade-cave-map.json`. The jade-cave map intentionally reuses the prototype world-state, starter-deck, events, shop, and encounter files; its distinct `expeditionId + mapId` owns active-run storage. |

`src/game/content/contentCatalog.ts` performs pure catalog-backed target resolution for WorldMap-owned Hub and Expedition target resources, Hub-owned `startStory.storyResourceId` story targets, Story-owned `startBattle.encounterResourceId` / `deckResourceId` battle targets, and Expedition map battle/boss `payloadRef.encounterResourceId` targets. Catalog validation fails actionably when a destination, Hub story action, Story battle trigger, or Expedition encounter node references a missing resource id, a resource id with the wrong kind, or a resource id whose catalog `publicPath` no longer matches the runtime file path (`hubFile`, `storyGraphFile`, `encounterFile`, `deckFile`, Expedition target files, or Expedition node `encounterFile`). This keeps resource ids stable for tooling and review while preserving the existing scene loaders.

`WorldMapScene` only owns this routing shell and its presentation surface. It does not own unlock state, procedural overworld movement, Hub shops/training/inventory, Expedition rewards, Expedition active-run persistence internals, or migration of `mijing` events into Story JSON. Add a new destination id for a new long-lived route instead of repurposing an existing id; give it a distinct normalized marker position instead of relying on array order; use a distinct `hubId` / `hubResourceId` / `hubFile` for a standalone Hub route, or a Hub destination's optional `targetLocationId` for a direct marker into an existing Hub location instead of duplicating a Hub file. `HubScene` and `ExpeditionScene` both normalize their launch payloads with safe defaults so direct scene starts still load the checked-in Qingyun town / prototype expedition files, but world-map launches must pass the destination-owned target fields. `ExpeditionScene` carries that normalized target config, including the identity-derived active-run route key and optional catalog resource ids, into `BattleScene` launch payloads and back through expedition battle results so battle round-trips resume against the same Expedition target config. Expedition battle/boss launch and completion payloads may also carry optional `encounterResourceId` for tooling/catalog traceability; route ownership, `runDeck`, and `encounterFile` loading remain unchanged.

Hub / Expedition return-to-map actions use `createWorldMapReturnIntent({ source, statusText })`. The return payload is display-only: it lets `WorldMapScene` show where the player came from, but it must not reset Hub location snapshots, Story runtime snapshots, or Expedition active runs.

## Hub launch contract

The default Hub shell lives in `public/data/hub/town-shell.json`, but `HubScene` loads the `hubFile` provided by the world-map launch payload when routed from `WorldMapScene`; for example, the 青云宗山门 route loads `public/data/hub/qingyun-sect-gate.json`. A Hub definition has a stable `hubId`, display copy, `defaultLocationId`, top-level sub-map `presentation`, and `locations[]`; the loaded file's `hubId` must match the launch payload's `hubId`. If the world-map launch payload includes `targetLocationId`, that location must exist in the loaded Hub file and takes precedence over the previously saved Hub location. Each location has an `id`, display copy, per-location `presentation`, and at least one action.

Hub sub-map presentation fields:

| Field | Meaning |
| --- | --- |
| `presentation.mapWidth`, `presentation.mapHeight` | Positive pixel dimensions for the pannable Hub sub-map surface. |
| `presentation.initialCenter` | Normalized `{ x, y }` point (`0..1`) centered in the viewport on first render, then clamped if the map is smaller than the viewport. |
| `locations[].presentation.position` | Normalized marker coordinate (`0..1`) converted to surface pixels by `HubScene`; this is required even for a one-location Hub. |
| `locations[].presentation.icon` | Lightweight semantic icon key used for marker glyph/palette selection. |
| `locations[].presentation.regionLabel` | Short region copy shown near the marker and in marker previews. |

Selecting a marker is a location-selection intent, not a new action kind. It updates and persists `currentLocationId` through `StoryHubSessionPersistence`, then shows that location's existing actions. `navigate` actions continue to use the same reducer/session path, and `startStory` payloads carry the optional `storyResourceId` for catalog/tooling context while keeping the same `hubId + actionId + storyGraphFile` session key.

Supported Hub action kinds:

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `navigate` | `targetLocationId` | Switch the current Hub location to another `locations[].id` in the same file. The target is validated at load time, and the current location is saved under the Hub `hubId` in local session storage. |
| `startStory` | `storyResourceId`, `storyGraphFile` | Resolve the declared catalog story resource id, verify its catalog `publicPath` equals `storyGraphFile`, then start `StoryScene` with the declared graph file. Multiple actions may point at different checked-in graph files. |

`HubScene` validates this data, renders the presentation metadata as a draggable marker map, applies marker selection and `navigate` actions without hard-coding target ids in scene code, and passes `startStory.storyResourceId` plus `startStory.storyGraphFile` to `StoryScene`; `StoryScene` still loads `storyGraphFile` and keeps that path through story-triggered BattleScene round trips so battle results resume against the same graph file.

The current town shell intentionally has two spatial locations and two `startStory` examples: `action.start-qingyun-entry-story` resolves `story.qingyun-entry` and launches `data/story/story-graph.json` from the gate-market marker, while `action.start-teahouse-rumors-story` resolves `story.qingyun-teahouse-rumors` and launches `data/story/qingyun-teahouse-rumors.json` from the tea-house marker. The 青云宗山门 Hub adds a one-location sub-map with `action.start-sect-gate-entry-story`, which also resolves `story.qingyun-entry` and launches `data/story/story-graph.json` but is separated by `hub.qingyun-sect-gate` and its own action id. Hub ids, location ids, action ids, graph files, story resource ids, and marker positions are stable persisted/content identifiers; add a new action id for a new story entry instead of repurposing an existing one.

## Story / Hub session persistence

The first durable persistence boundary is local and versioned at `cardgame.story-hub-session.v1`. It stores:

- Hub snapshots by `hubId`: `currentLocationId`, optional `statusText`, and `updatedAt`. When loading, `createInitialHubNavigationState` only restores a saved location if it still exists in the current Hub definition; stale or corrupt data falls back to `defaultLocationId`.
- Story snapshots by `hubId + actionId + storyGraphFile`: `StoryState`, `selectedChoiceIds`, optional `statusText`, and `updatedAt`. `HubScene` passes a matching saved snapshot into the `StoryScene` launch payload so selecting the same Hub `startStory` action resumes progress. `storyResourceId` is catalog metadata and is not part of this session key. Different Hub ids, actions, or graph files do not share runtime snapshots, which keeps the town mainline, town tea-house side story, and sect-gate mainline entry isolated even when two actions launch the same story graph. `StoryScene` saves after normal story choices and after story battle-result resume; story battle launch payloads carry the same Hub session key through `BattleScene`.

This boundary does not own broad world state and is intentionally separate from Expedition `RunSnapshot`. Do not add shops, inventory, rewards, training, Expedition exits, backend/cloud saves, or `mijing` migration data to the Hub action schema until those contracts are designed separately.

## Authoring loop

1. Edit `public/data/world/world-map.json` when changing the top-level world-map routes or marker layout; edit `public/data/story/story-graph.json` for mainline StoryScene content; add a separate graph file such as `public/data/story/qingyun-teahouse-rumors.json` for a new side story; edit `public/data/hub/town-shell.json` or `public/data/hub/qingyun-sect-gate.json` when changing Hub entry copy or story targets, and keep each `startStory.storyResourceId` aligned with the action's `storyGraphFile`. For a new Expedition route, give the destination a stable `destinationId`, a distinct `expeditionId + mapId`, a normalized `presentation.position`, catalog resource ids for each target file, and a `mapFile` whose JSON `id` equals that `mapId`; for each battle/boss map node, keep `payloadRef.ref` as the encounter id, `payloadRef.encounterFile` as the BattleScene load path, and `payloadRef.encounterResourceId` as the catalog encounter resource id; reuse events/shop/encounter files only when the map node refs still match those content files.
2. Use `public/data/story/story-graph.compact.example.json` as the minimal copyable template for new chapters or tooling fixtures.
3. Follow `public/data/docs/story-authoring-guide.md` for ID naming, node / choice authoring, and when to use `visibleWhen`, `enabledWhen`, `effects`, or `onEnter`.
4. Run `bun test src/game/scenes/worldmap/worldMap.test.ts src/game/scenes/hub/hubSceneLaunch.test.ts src/game/scenes/expedition/expeditionSceneLaunch.test.ts src/game/state/ExpeditionState.test.ts src/game/scenes/startupFlow.test.ts` to validate the world-map data contract, launch-payload defaults, Expedition route-key active-run partitioning, and `MainMenu -> WorldMapScene -> HubScene | ExpeditionScene -> WorldMapScene` routing/resume loop.
5. Run `bun test src/game/services/StoryHubSessionPersistence.test.ts src/game/scenes/hub/hubTown.test.ts src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts` to validate the Hub launch/session contract plus graph structure, conditions, effects, disabled choices, and state transitions.
6. Run `bun test src/game/types/storyContent.test.ts` when changing the standalone `story-graph.executable.json` contract fixture.
7. Run `npm run build-nolog` before handing off UI/runtime changes.
