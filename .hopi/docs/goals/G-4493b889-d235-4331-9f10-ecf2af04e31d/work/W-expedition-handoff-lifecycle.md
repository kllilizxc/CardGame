---
id: W-expedition-handoff-lifecycle
title: Harden expedition return-confirm handoff teardown
notBefore: null
dependsOn:
  - W-expedition-return-confirm
contractRevision: 3
evidenceRefs:
  - E-R-b87ac7dd-c5a2-48c7-8db5-7716c3c40f9a
  - E-R-4ef7fe2b-d7b6-45b8-a248-2e24b477941f
attempts: 0
kind: engineering
stage: done
---
## Objective

Repair the remaining expedition return-to-confirm crash that occurs during `ExpeditionScene.init` after leaving deck management and confirming the loadout, so departure handoff overlay cleanup and entry-transition blocker teardown stay safe across scene start without regressing the prior loadout-validation fix.

## Scope

- `src/game/scenes/expedition/ExpeditionScene.ts`
- `src/game/scenes/expedition/expeditionEntryShell.test.ts`
- Any expedition-entry helper or focused test harness directly responsible for departure handoff overlay or blocker lifecycle

## Acceptance Criteria

- Following the exact player path `进入秘境 -> 管理卡组 -> 返回 -> 确认带入秘境` no longer throws during the subsequent expedition scene boot; specifically, `ExpeditionScene.init`, `destroyDepartureHandoffOverlay`, and `setEntryTransitionBlocker` must not call Phaser interactivity APIs on display objects whose lifecycle has already been torn down.
- Departure handoff overlay cleanup and entry-transition blocker toggling are idempotent across repeated cleanup calls and scene-start handoff restoration, so starting the expedition after a deck-management return cannot reuse a destroyed blocker or overlay object.
- Automated coverage exercises the exact return-to-confirm path through post-confirm scene start and fails if teardown touches a dead blocker or overlay object.
- Existing expedition-entry behavior remains unchanged: direct confirmation from preparation, invalid-loadout blocking after deck edits, opening and closing deck management, selected-deck persistence on return, and the 1920x1080 breadcrumb/header separation still work.

## Out Of Scope

- Battle HUD, battle card presentation, or combat behavior changes
- Visual theme restyling unrelated to proving or fixing expedition handoff teardown
