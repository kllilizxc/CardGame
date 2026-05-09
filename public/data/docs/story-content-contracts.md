# Executable Story Content Contracts

`public/data/story/story-graph.executable.json` is the checked-in executable example for story content contracts, validated at dev/test time by `src/game/types/storyContent.ts` instead of being treated as free-form prose. `public/data/story/story-graph.json` remains the UI-facing example used by the current StoryScene: `src/game/scenes/story/storyFlow.ts` strictly validates that the example is playable, while `src/game/scenes/story/storyFlowViewModel.ts` owns render and choice-transition view models.

## Graph shape

A story graph has:

- `schemaVersion`: currently `1`.
- `id` and `title`: stable content identity and display name.
- `entryNodeId`: the first node to load; it must reference a node in `nodes`.
- `nodes`: narrative or routing nodes with display copy, location/time metadata, optional AI expansion hints, and `onEnter` effects.
- `choices`: directed edges between nodes. Every `from` and `to` must reference an existing node.

Node ids and choice ids must be globally unique inside the graph.

## Executable conditions

Choices use structured `visibleWhen` and `enabledWhen` predicates. Supported operations:

| Operation | Required fields | Meaning |
| --- | --- | --- |
| `always` | — | Predicate always passes. |
| `hasFlag` | `flag` | Runtime state contains the flag. |
| `missingFlag` | `flag` | Runtime state does not contain the flag. |
| `attributeAtLeast` | `path`, `value` | Numeric player attribute is at least the threshold. `path` must start with `player.attributes.`. |
| `tagPresent` | `path`, `tag` | Player tag exists. `path` is `player.tags`. |
| `tagMissing` | `path`, `tag` | Player tag does not exist. `path` is `player.tags`. |
| `all` | `conditions` | All child conditions pass. |
| `any` | `conditions` | At least one child condition passes. |
| `not` | `condition` | Child condition does not pass. |

## Executable effects

Nodes use `onEnter`, and choices use `effects`. Supported operations:

| Operation | Required fields | Meaning |
| --- | --- | --- |
| `setFlag` | `flag` | Add a story/world flag. |
| `clearFlag` | `flag` | Remove a story/world flag. |
| `adjustAttribute` | `path`, `amount` | Add to a player numeric attribute. `path` must start with `player.attributes.`. |
| `addTag` | `path`, `tag` | Add a player tag. `path` is `player.tags`. |
| `removeTag` | `path`, `tag` | Remove a player tag. `path` is `player.tags`. |
| `adjustRelation` | `npcId`, `amount` | Add to an NPC relationship score. |
| `setLocation` | `location` | Update runtime location text. |
| `startExpedition` | `expeditionId`, optional `mapId` | Mark an expedition handoff request for the game layer. |

## Authoring loop

1. Edit `public/data/story/story-graph.executable.json` when authoring executable contract examples. Keep `public/data/story/story-graph.json` compatible with the current `storyFlowViewModel` UI contract and with `storyFlow` strict reference validation until the runtime UI migrates.
2. Run `bun test src/game/types/storyContent.test.ts` to validate graph structure, references, conditions, and effects.
3. Use `evaluateStoryCondition` and `applyStoryEffects` from `src/game/types/storyContent.ts` when wiring UI/runtime traversal so content behavior remains data-driven.
