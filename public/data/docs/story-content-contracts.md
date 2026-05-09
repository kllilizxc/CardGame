# StoryState-backed Story Content Contracts

`public/data/story/story-graph.json` is the checked-in playable example for StoryScene content. `public/data/hub/town-shell.json` is the minimal multi-location Hub entry: its `navigate.targetLocationId` actions move between Hub locations and save the current Hub location to local Story/Hub session storage, and its `startStory.storyGraphFile` action points at the playable story graph. `StoryScene` loads the graph file provided by its launch payload, defaulting to `data/story/story-graph.json`, `src/game/scenes/story/storyFlow.ts` strictly validates that the example is playable, and `src/game/scenes/story/storyFlowViewModel.ts` owns render / transition view models and runtime traversal using `StoryState`, `StoryCondition`, and `StoryEffect` from `src/game/types/story.ts` / `src/game/state/StoryState.ts`. `src/game/services/StoryHubSessionPersistence.ts` is the versioned local session boundary for Hub location and per-Hub-action Story runtime snapshots. `public/data/docs/story-authoring-guide.md` is the author-facing workflow guide, and `public/data/story/story-graph.compact.example.json` is the smallest checked-in StoryState schema example. `public/data/story/story-graph.executable.json` remains a standalone contract fixture validated by `src/game/types/storyContent.ts`.

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

`startBattle.battle` is the story-combat contract for the first enabling slice. It requires stable `battleId`, `encounterId`, `encounterFile`, `deckFile`, `onVictoryNodeId`, and `onDefeatNodeId`, plus optional `launchText`. `storyFlow` validates that victory and defeat node ids exist in the same graph. `storyFlowViewModel.createStoryChoiceTransition` exposes the selected transition's `battleLaunch` metadata (`sceneKey: "BattleScene"`, source node / choice ids, target node id, encounter file, deck file, and result node ids). `StoryScene` wraps that metadata with the current `StoryState` and selected choice ids, starts `BattleScene`, and resumes at `onVictoryNodeId` or `onDefeatNodeId` after combat.

## Hub launch contract

The minimal Hub shell lives in `public/data/hub/town-shell.json`. A Hub definition has a stable `hubId`, display copy, `defaultLocationId`, and `locations[]`. Each location has an `id`, display copy, and at least one action.

Supported Hub action kinds:

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `navigate` | `targetLocationId` | Switch the current Hub location to another `locations[].id` in the same file. The target is validated at load time, and the current location is saved under the Hub `hubId` in local session storage. |
| `startStory` | `storyGraphFile` | Start `StoryScene` with the declared story graph file. |

`HubScene` validates this data, applies `navigate` actions without hard-coding target ids in scene code, and passes `startStory.storyGraphFile` to `StoryScene`; `StoryScene` then keeps that path through story-triggered BattleScene round trips so battle results resume against the same graph file.

## Story / Hub session persistence

The first durable persistence boundary is local and versioned at `cardgame.story-hub-session.v1`. It stores:

- Hub snapshots by `hubId`: `currentLocationId`, optional `statusText`, and `updatedAt`. When loading, `createInitialHubNavigationState` only restores a saved location if it still exists in the current Hub definition; stale or corrupt data falls back to `defaultLocationId`.
- Story snapshots by `hubId + actionId + storyGraphFile`: `StoryState`, `selectedChoiceIds`, optional `statusText`, and `updatedAt`. `HubScene` passes a matching saved snapshot into the `StoryScene` launch payload so selecting the same Hub `startStory` action resumes progress. `StoryScene` saves after normal story choices and after story battle-result resume; story battle launch payloads carry the same Hub session key through `BattleScene`.

This boundary does not own broad world state and is intentionally separate from Expedition `RunSnapshot`. Do not add shops, inventory, rewards, training, Expedition exits, backend/cloud saves, or `mijing` migration data to the Hub action schema until those contracts are designed separately.

## Authoring loop

1. Edit `public/data/story/story-graph.json` for playable StoryScene content, or `public/data/hub/town-shell.json` when changing the town entry copy or target graph.
2. Use `public/data/story/story-graph.compact.example.json` as the minimal copyable template for new chapters or tooling fixtures.
3. Follow `public/data/docs/story-authoring-guide.md` for ID naming, node / choice authoring, and when to use `visibleWhen`, `enabledWhen`, `effects`, or `onEnter`.
4. Run `bun test src/game/services/StoryHubSessionPersistence.test.ts src/game/scenes/hub/hubTown.test.ts src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts` to validate the Hub launch/session contract plus graph structure, conditions, effects, disabled choices, and state transitions.
5. Run `bun test src/game/types/storyContent.test.ts` when changing the standalone `story-graph.executable.json` contract fixture.
6. Run `npm run build-nolog` before handing off UI/runtime changes.
