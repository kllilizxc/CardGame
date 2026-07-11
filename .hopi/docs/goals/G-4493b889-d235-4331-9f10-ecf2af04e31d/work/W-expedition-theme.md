---
id: W-expedition-theme
title: Apply the shared theme to expedition entry and deck management
kind: engineering
stage: generate
notBefore: null
dependsOn: [W-theme-shell]
contractRevision: 1
evidenceRefs: []
attempts: 0
---
## Objective

Restyle expedition preparation and route-management surfaces so they match the shared xianxia theme and friendlier readability targets without changing expedition flow logic.

## Scope

- `src/game/scenes/expedition/ExpeditionScene.ts`
- `src/game/ui/expedition/PreparationPanel.ts`
- `src/game/ui/expedition/RunHud.ts`
- `src/game/ui/deckbuilder/DeckManagementPanel.ts`
- Any expedition-specific helper or layout file that must change to support the refreshed visual hierarchy

## Acceptance Criteria

- Expedition entry, breadcrumb cues, departure and arrival overlays, node modals, run HUD, and deck-management surfaces follow the shared theme established by `W-theme-shell`.
- At the 1920x1080 baseline from `src/game/main.ts`, the expedition entry and deck-management surfaces meet the theme typography and control-size minima recorded in `design/index.md`.
- Preparation and deck-management panels clearly prioritize one current-status line, one primary action group, and one supporting copy block rather than stacked duplicate explanation.
- Existing expedition behavior remains unchanged: returning to the world map, opening and closing deck management, switching decks, naming decks, editing deck contents, confirming loadout, and viewing non-combat node panels still work.

## Out Of Scope

- Battle HUD and battle card presentation
- Expedition rules, map traversal logic, persistence, or content data changes
