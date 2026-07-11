---
id: W-battle-theme
title: Apply the shared theme to battle and battle-adjacent UI
kind: engineering
stage: generate
notBefore: null
dependsOn: [W-theme-shell]
contractRevision: 1
evidenceRefs: []
attempts: 0
---
## Objective

Restyle battle presentation so the HUD, overlays, modal panels, previews, and card rendering all match the shared xianxia theme and friendlier readability targets without changing combat behavior.

## Scope

- `src/game/scenes/battle/BattleScene.ts`
- `src/game/config/LayoutConfig.ts`
- `src/game/ui/battle/BattleUIManager.ts`
- `src/game/ui/common/DeckSelectionUI.ts`
- `src/game/ui/common/CardListView.ts`
- `src/game/ui/common/PillTooltipUI.ts`
- `src/game/managers/common/CardPreviewManager.ts`
- `src/game/objects/BaseCardSprite.ts`
- `src/game/objects/CardSprite.ts`
- `src/game/objects/ArtifactSprite.ts`
- `src/game/objects/TalismanSprite.ts`
- `src/game/objects/FieldSprite.ts`
- `src/game/objects/PillSprite.ts`
- Any battle-specific helper introduced to keep theme logic shared within this surface

## Acceptance Criteria

- Battle HUD, field labels, action buttons, deck and discard overlays, preview panels, tooltips, and card frames follow the shared theme established by `W-theme-shell`.
- At the 1920x1080 baseline from `src/game/main.ts`, battle titles, labels, body copy, and actionable controls meet the theme typography and control-size minima recorded in `design/index.md`.
- The battle surface feels less crowded by reducing competing copy blocks and using clearer hierarchy for turn state, actions, and card detail.
- Existing battle behavior remains unchanged: drawing, ending turn, speed toggling, previewing cards, opening deck or discard views, selecting cards from overlays, placing cards on the field, and reporting battle completion still work.

## Out Of Scope

- Expedition entry and deck-management shells
- Combat rules, card data, encounter data, or non-visual battle-state changes
