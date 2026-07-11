---
id: W-battle-theme
title: Apply the shared theme to battle and battle-adjacent UI
notBefore: null
dependsOn:
  - W-theme-shell
contractRevision: 1
evidenceRefs:
  - E-R-f70cfaa2-2a13-49d4-8a37-98058974a83d
  - E-R-c812a6a2-cfd3-4e9b-8159-74808d37896b
  - E-R-6fc84e9e-b0e6-4ae7-8b34-026f13407969
  - E-R-069d6377-35ee-4b63-ab9c-61d8f61aa6b8
  - E-R-95652e52-757c-4ede-b951-3e7486868b47
  - E-R-65c057f8-8329-4a10-b7ad-c8d317fecb14
  - E-R-67aefdd6-7a76-4fbb-84a8-c320823d446b
  - E-R-8e12428c-517c-4b06-8b66-a0513153169c
  - E-R-f2c87adb-57a0-4478-8eba-f5e2be83121f
attempts: 2
kind: engineering
stage: done
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
