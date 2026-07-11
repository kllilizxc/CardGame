---
id: W-expedition-theme
title: Apply the shared theme to expedition entry and deck management
notBefore: null
dependsOn:
  - W-theme-shell
contractRevision: 1
evidenceRefs:
  - E-R-53cde021-a2d7-4e7f-9907-e106afd99563
  - E-R-7a70acb0-92b8-477a-ad92-1b78ddb93bb4
  - E-R-ab1c2d00-1951-4c33-80c9-f56655a3c1a2
  - E-R-b9ca1cfd-920c-4e4c-83eb-56f05e70dc53
  - E-R-ceaf2206-6d71-44a0-b5bf-05657e1c5680
  - E-R-e9fdc8d8-90ec-4357-b617-1d96263656f3
  - E-R-0e837a3d-8ef6-4284-94dd-25f8a27d08f6
  - E-R-fcdebca0-65db-4c0b-9302-f9500e375788
  - E-R-e63a1463-888b-4fe7-ad02-daa374b83fe8
  - E-R-3bd89b99-bd04-4f74-bd91-c4ea66e0a7d0
  - E-R-67570598-4db9-47ad-b056-62d75bbec6d9
attempts: 1
kind: engineering
stage: generate
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
- In deck-management mode at the 1920x1080 baseline, expedition breadcrumb cues do not overlap the deck-management header/action row in live preview.
- Preparation and deck-management panels clearly prioritize one current-status line, one primary action group, and one supporting copy block rather than stacked duplicate explanation.
- Existing expedition behavior remains unchanged: returning to the world map, opening and closing deck management, switching decks, naming decks, editing deck contents, confirming loadout, and viewing non-combat node panels still work.

## Out Of Scope

- Battle HUD and battle card presentation
- Expedition rules, map traversal logic, persistence, or content data changes
