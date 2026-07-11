---
id: W-startup-stability
title: Eliminate unintended startup zoom in the themed entry flow
notBefore: null
dependsOn:
  - W-theme-shell
contractRevision: 1
evidenceRefs:
  - E-R-4fd3943b-c097-4c9a-aab2-63b2cb083b22
  - E-R-28698c42-c469-4b26-a19a-02356ae0996d
attempts: 0
kind: engineering
stage: done
---
## Objective

Fix the reported launch-time slow-zoom regression so the themed shell and first active scene remain visually stable while idle, without regressing the accepted xianxia entry presentation or route-entry behavior.

## Scope

- `index.html`
- `public/style.css`
- `src/GameApp.css`
- `src/game/main.ts`
- `src/game/scenes/MainMenu.ts`
- Any startup-shell helper or bootstrap file directly responsible for the launch-time zoom regression

## Acceptance Criteria

- On initial launch, the root game frame, mounted Phaser canvas, and first active route scene no longer continue to enlarge or slowly zoom while the player is idle.
- The accepted themed entry presentation from `W-theme-shell` remains intact: no Phaser template branding returns, and the shell still presents the same xianxia / pixel-inflected first impression.
- Existing startup and route-entry behavior remains unchanged: boot completes, the first menu scene still renders at the 1920x1080 baseline from `src/game/main.ts`, and normal entry into the world-map flow still works.

## Out Of Scope

- Expedition preparation, run HUD, and deck-management styling changes
- Battle HUD, overlays, card presentation, or combat behavior changes
