# StoryState-backed Story Content Contracts

`public/data/story/story-graph.json` is the checked-in playable example for StoryScene content. `StoryScene` loads it directly, `src/game/scenes/story/storyFlow.ts` strictly validates that the example is playable, and `src/game/scenes/story/storyFlowViewModel.ts` owns render / transition view models and runtime traversal using `StoryState`, `StoryCondition`, and `StoryEffect` from `src/game/types/story.ts` / `src/game/state/StoryState.ts`. `public/data/story/story-graph.executable.json` remains a standalone contract fixture validated by `src/game/types/storyContent.ts`.

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

`storyFlowViewModel.createStoryChoiceTransition` applies choice effects, appends the target-node transition, then applies the target node's `onEnter` effects. This keeps output deterministic and makes sublocation changes part of the checked-in content rather than free-form prose hints.

## Authoring loop

1. Edit `public/data/story/story-graph.json` for playable StoryScene content.
2. Run `bun test src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts` to validate graph structure, conditions, effects, disabled choices, and state transitions.
3. Run `bun test src/game/types/storyContent.test.ts` when changing the standalone `story-graph.executable.json` contract fixture.
4. Run `npm run build-nolog` before handing off UI/runtime changes.
