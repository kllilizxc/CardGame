# Story Runtime State, Conditions, and Effects

The first story-system runtime slice keeps story progress as pure TypeScript data so future Phaser scenes and JSON validators can share the same behavior.

## Runtime state

`src/game/types/story.ts` defines `StoryState` with:

- `currentLocationId`, `currentSublocationId`, and `currentNodeId` for the active place and node.
- `visitedNodeIds` and `triggeredDialogueIds` for history-based branches.
- `flags` for boolean story facts.
- `attributes` and `relations` as numeric maps for player traits and NPC/faction affinity.

Use `createInitialStoryState` to seed a story. State helpers in `src/game/state/StoryState.ts` are immutable: they return updated snapshots without mutating the input.

## Conditions

`evaluateStoryCondition` supports declarative JSON-friendly condition kinds:

- `attribute`: compare a numeric attribute with `>`, `>=`, `<`, `<=`, `==`, or `!=`.
- `flag`: require a story flag to be present or absent via `expected`.
- `visitedNode`: require node history to contain or omit a node id.
- `triggeredDialogue`: require dialogue history to contain or omit a dialogue id.
- `all`, `any`, `not`: compose nested conditions.

Missing numeric attributes default to `0`. Missing flags/history entries count as `false`.

## Effects and choice application

`applyStoryEffects` supports declarative effect kinds:

- `setFlag` / `clearFlag`
- `recordVisitedNode`
- `recordDialogue`
- `setAttribute` / `adjustAttribute`
- `setRelation` / `adjustRelation`
- `moveTo` for location/sublocation changes
- `goToNode` for node transitions
- `startBattle` for story-triggered combat intent. It carries `battleId`, `encounterResourceId`, `encounterId`, `encounterFile`, `deckResourceId`, `deckFile`, explicit victory/defeat continuation node ids, and optional launch copy.

`applyStoryChoice` checks a choice condition before applying its effects. If blocked, it returns the original state with status `blocked`; if applied, it returns the updated state plus the selected `nextNodeId` when a transition effect or choice `nextNodeId` is present.

`startBattle` does not mutate story position by itself. `applyStoryEffects` returns it as `pendingBattle`, and `createStoryChoiceTransition` turns it into `battleLaunch` metadata with `sceneKey: "BattleScene"` and story source/target ids. `StoryScene` now uses that metadata to start `BattleScene` with a source-aware story payload containing catalog resource ids plus the encounter and deck file aliases. For Story-sourced launches, `BattleScene` resolves `encounterResourceId` and `deckResourceId` through the cached content catalog and loads those catalog `publicPath` values; `encounterFile` and `deckFile` remain compatibility aliases that must match the catalog paths and continue to round-trip in battle results. When combat ends, story battle results preserve those target identifiers and return to `onVictoryNodeId` or `onDefeatNodeId`.

## Story / Hub session persistence

`src/game/services/StoryHubSessionPersistence.ts` is the first durable local boundary for Story / Hub session state. It writes versioned JSON to `cardgame.story-hub-session.v1` and owns all direct storage access for this slice.

- Hub location snapshots are keyed by `hubId` and store the current location id, optional status text, and update time. A saved location is only restored if it still exists in the current Hub JSON; corrupt or stale storage falls back to the default Hub location. A world-map Hub destination with `targetLocationId` intentionally overrides the saved location and writes that explicit Hub location back to the same snapshot.
- Story runtime snapshots are keyed by `hubId + actionId + storyGraphFile` and store `StoryState`, selected choice ids, optional status text, and update time. `HubScene` resumes a matching snapshot when the same `startStory` action launches again. The checked-in town shell now uses this to keep the gate-market mainline (`data/story/story-graph.json`) and tea-house side story (`data/story/qingyun-teahouse-rumors.json`) from sharing progress.
- Story battle payloads carry the Hub session key through `BattleScene`, so the post-battle resume node is saved back into the same Story runtime snapshot.

This is a local session boundary only. It intentionally does not own Expedition `RunSnapshot`, inventory, shops, rewards, backend/cloud save, or broad world-state progression.

## Playable graph integration

`src/game/scenes/story/storyFlow.ts` now uses this runtime directly for playable Hub-launched graph samples such as `public/data/story/story-graph.json` and `public/data/story/qingyun-teahouse-rumors.json`. Each graph seeds `StoryState.initialState`, stores choice gates in `visibleWhen` / `enabledWhen`, stores deterministic state changes in `effects`, and stores node-entry movement or dialogue history in `onEnter`. `StoryScene` renders disabled choices with their failed condition reason and only advances after `chooseStoryChoice` returns an updated `StoryState`.
