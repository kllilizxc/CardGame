---
id: W-expedition-return-confirm
title: Repair expedition return-to-confirm loadout flow
notBefore: null
dependsOn: []
contractRevision: 2
evidenceRefs:
  - E-R-0abd4d17-ec8d-429c-9515-0e2b3ead1baf
  - E-R-5c0f8adb-61f3-4cc5-ac68-a0d511393695
attempts: 0
kind: engineering
stage: done
---
## Objective

Repair the expedition entry path where the player opens deck management, returns to preparation, and then confirms the loadout so that it no longer throws and still preserves the themed expedition-entry behavior.

## Scope

- `src/game/scenes/expedition/ExpeditionScene.ts`
- `src/game/ui/expedition/PreparationPanel.ts`
- `src/game/ui/deckbuilder/DeckManagementPanel.ts`
- `src/game/scenes/expedition/expeditionEntryFlow.ts`
- Any expedition-entry test or harness file needed to prove the exact return-to-confirm path

## Acceptance Criteria

- Following the exact player path `进入秘境 -> 管理卡组 -> 返回 -> 确认带入秘境` no longer throws; when the selected loadout is valid, the run starts normally, and when the loadout is invalid after deck edits, the existing invalid-loadout guardrail still blocks confirmation without crashing.
- After returning from deck management, the preparation surface reflects the current stash and selected-deck context before any confirm action runs, including unchanged returns, selected-deck switches, and same-deck content edits.
- Automated coverage exercises the exact return-to-confirm path through the expedition entry shell so a regression is caught before live preview.
- Existing expedition-entry behavior remains unchanged: direct confirmation from preparation, opening and closing deck management, deck selection and deck edits, and the 1920x1080 deck-management breadcrumb/header separation all still work.

## Out Of Scope

- Battle HUD, battle card presentation, or combat behavior changes
- World-map, hub, story, persistence-format, or content-data changes outside the expedition entry shell
