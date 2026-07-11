---
id: W-theme-shell
title: Build shared xianxia theme and restyle route shell surfaces
notBefore: null
dependsOn: []
contractRevision: 1
evidenceRefs:
  - E-R-06113d9f-8d00-4911-8fa9-1657fc133c16
  - E-R-3a13b2c8-f677-42b4-b0de-112bab845d59
attempts: 0
kind: engineering
stage: done
---
## Objective

Establish the shared visual system for the Goal and apply it to the first player-facing shell surfaces: the browser shell, main menu, world map, hub, and story scenes.

## Scope

- `index.html`
- `public/style.css`
- `src/GameApp.css`
- `src/game/scenes/MainMenu.ts`
- `src/game/scenes/worldmap/WorldMapScene.ts`
- `src/game/scenes/hub/HubScene.ts`
- `src/game/scenes/story/StoryScene.ts`
- Any new shared scene-theme helper introduced specifically to avoid repeating visual literals across the files above

## Acceptance Criteria

- The runtime entry surface no longer presents Phaser template branding; page title, shell styling, and mounted scene framing reflect the game's xianxia / pixel-inflected identity.
- The updated shell scenes use one shared panel, button, and typography direction instead of separate blue-template treatments, and reusable theme helpers or tokens exist where duplication would otherwise be required.
- At the 1920x1080 baseline from `src/game/main.ts`, scene titles are at least 40 px, section titles at least 28 px, body and support copy at least 18 px, primary buttons at least 56 px tall, and secondary buttons at least 44 px tall.
- `MainMenu`, `WorldMapScene`, `HubScene`, and `StoryScene` each present one primary action group, one status line, and no more than one secondary support copy block per main panel.
- Existing route behavior remains unchanged: menu entry, world-map navigation, hub location selection, story progression, and return paths still work.

## Out Of Scope

- Expedition, battle, and deck-management surfaces
- Gameplay rules, content JSON, persistence, or story-state behavior
