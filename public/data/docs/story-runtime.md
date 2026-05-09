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

`applyStoryChoice` checks a choice condition before applying its effects. If blocked, it returns the original state with status `blocked`; if applied, it returns the updated state plus the selected `nextNodeId` when a transition effect or choice `nextNodeId` is present.
