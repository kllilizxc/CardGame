---
id: W-expedition-return-confirm-runtime
title: Resolve remaining expedition return-confirm runtime failure
notBefore: null
dependsOn:
  - W-expedition-theme
  - W-expedition-handoff-lifecycle
contractRevision: 4
evidenceRefs:
  - E-R-c993fff8-366e-4330-9294-01b9ee0975d7
  - E-R-acabd972-c107-46de-8460-737b58e9fce6
attempts: 0
kind: engineering
stage: done
---
## Objective

Reproduce and repair the still-reported runtime failure on the exact `进入秘境 -> 管理卡组 -> 返回 -> 确认带入秘境` path so the integrated expedition boot flow succeeds after a deck-management return without regressing the accepted themed expedition-entry behavior.

## Scope

- `src/game/scenes/expedition/ExpeditionScene.ts`
- `src/game/scenes/expedition/expeditionEntryFlow.ts`
- `src/game/scenes/expedition/expeditionEntryShell.test.ts`
- `src/game/ui/expedition/PreparationPanel.ts`
- `src/game/ui/deckbuilder/DeckManagementPanel.ts`
- Any focused expedition-entry helper or runtime verification harness directly required to reproduce or fix the integrated return-confirm path

## Acceptance Criteria

- Following the exact player path `进入秘境 -> 管理卡组 -> 返回 -> 确认带入秘境` no longer throws in the integrated runtime, and the game reaches the post-confirm expedition scene boot successfully.
- The repair closes the remaining stale-state or lifecycle fault across `DeckManagementPanel`, `PreparationPanel`, `expeditionEntryFlow`, and `ExpeditionScene` without regressing direct confirmation from preparation, invalid-loadout blocking after deck edits, selected-deck persistence on return, or the 1920x1080 breadcrumb/header separation already owned by `W-expedition-theme`.
- Proof includes automated regression coverage for the exact return-to-confirm path through post-confirm expedition boot and direct runtime verification of the same operator path, so a shell-only false pass cannot recur.
- Existing expedition rules, battle behavior, persistence formats, and content data remain unchanged.

## Out Of Scope

- Battle HUD, battle card presentation, or combat behavior changes
- New visual theme work outside the expedition entry shell
