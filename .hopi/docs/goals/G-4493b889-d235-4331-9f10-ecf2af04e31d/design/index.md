# 将整体UI风格改成更古风游戏主题，更友好 Design

## Problem

- The current player-facing UI is split between starter-template shell styling (`index.html`, `public/style.css`, `src/GameApp.css`) and scene-local Phaser styling that hard-codes Arial fonts, bright blue utility palettes, and generic framed panels.
- Core route scenes (`MainMenu`, `WorldMapScene`, `HubScene`, `StoryScene`) and expedition / battle surfaces each define their own button, panel, and copy-density treatment, so the game does not read as one coherent ancient-world interface.
- The Goal asks for a more ancient-game and friendlier experience, which in this repo means visual unification plus better readability and less crowded copy without changing game systems.

## Current Design

### Shared Visual Direction

- Use one xianxia / pixel-inflected visual system across the React shell and Phaser scenes: parchment, jade, ink, and gold accents; framed panels; and decorative borders that feel like the same game world.
- Remove template branding and generic shell presentation from the runtime entry surface so the first impression is the game's identity rather than the Phaser starter template.
- Centralize reusable visual tokens or helper primitives before broader scene restyling so later work can reuse one theme source instead of cloning new color and typography literals.

### Startup Stability

- Accepted Inbox turn `EV-88033d59-af85-4309-acac-04dd0ee2222b` reports a launch-time regression where the whole game slowly zooms in after opening, so the themed entry surface is not visually stable while idle.
- Decorative motion may use opacity, color, or small local emphasis, but the root game frame, mounted Phaser canvas, and first active scene must hold a fixed idle scale until the player triggers navigation or another explicit transition.
- Any repair for this regression stays in the startup shell and bootstrap path so the accepted xianxia theme direction remains intact without reopening expedition or battle-specific styling work.

### Friendly Readability

- Treat 1920x1080 as the desktop baseline already defined in `src/game/main.ts`.
- Raise typography and control sizes to measurable minima: scene titles at least 40 px, section titles at least 28 px, body and support copy at least 18 px, primary controls at least 56 px tall, and secondary controls at least 44 px tall.
- Keep critical call-to-action labels short and direct; reserve longer flavor or guidance copy for one supporting text block per primary panel.

### Deck Management Layout Guardrail

- Accepted Inbox turn `EV-acc8fce8-fd32-4888-b329-2653106e89ce` keeps the deck-management overlap defect inside the current Goal scope and requires it to be absorbed into the existing expedition implementation work without changing the Goal contract.
- At the 1920x1080 baseline, expedition breadcrumb cues and the deck-management header/action row must render in separate, non-overlapping vertical bands during live preview.
- Reviewer evidence `E-R-82da978a-c65c-4076-a2fa-3d30e4844c4d` already showed that the shell envelope and deck-management panel can diverge in runtime layout, so this guardrail must be checked on the rendered deck-management surface rather than inferred from size math alone.

### Preparation Return Confirmation Reliability

- Accepted Inbox turn `EV-234a80b9-a4be-47cc-b714-35ab26e815f9` reports that the exact operator path `进入秘境 -> 管理卡组 -> 返回 -> 确认带入秘境` throws, so the reopened scope stays inside the expedition entry shell and does not require a Goal contract change.
- Treat this as a handoff-integrity requirement between `DeckManagementPanel`, `PreparationPanel`, and `ExpeditionScene`: after leaving deck management, the rebuilt preparation surface must hold current stash and selected-deck state before any confirm action can create a run.
- Proof must exercise the exact return-to-confirm path after a deck-management visit, not only isolated loadout-validation helpers or handoff-summary builders, because existing reviewer evidence confirmed preparation/deck-management transitions without explicitly confirming the final confirm step after return.

### Expedition Handoff Lifecycle Safety

- Accepted Inbox turn `EV-f9235410-4a0b-452a-afd8-e26d7f5fe617` shows that the previous return-confirm repair still leaves a crash during `ExpeditionScene.init`, where `destroyDepartureHandoffOverlay` re-enters `setEntryTransitionBlocker` and reaches `Rectangle.disableInteractive` after Phaser has already detached the display object's `sys`.
- Keep this requirement inside the same expedition entry shell: departure handoff overlay cleanup, entry-transition blocker teardown, and any handoff state restored during scene start must be safe to run more than once across the `进入秘境 -> 管理卡组 -> 返回 -> 确认带入秘境` path.
- Proof must cover the exact operator path through post-confirm scene boot, not only pre-confirm validation, because reviewer evidence for `W-expedition-return-confirm` validated shell-level confirm gating without proving the subsequent `ExpeditionScene.init` teardown path.

### Integrated Return-Confirm Runtime Reliability

- Accepted Inbox turn `EV-36d017ab-a7d5-489f-9fcc-df31daa51273` repeats that the same operator path still errors after reviewer evidence `E-R-4ef7fe2b-d7b6-45b8-a248-2e24b477941f` reported the Phaser teardown fix and passing automated coverage, so the remaining problem is a residual expedition-entry runtime defect rather than a Goal or contract change.
- Keep the follow-on repair inside the expedition entry shell and allow it to inspect `DeckManagementPanel`, `PreparationPanel`, `expeditionEntryFlow`, and `ExpeditionScene` together, because the remaining fault may be stale handoff state or confirm sequencing that only appears in the integrated return-to-confirm boot path.
- Proof for the next repair must reproduce `进入秘境 -> 管理卡组 -> 返回 -> 确认带入秘境` through post-confirm expedition boot in the integrated runtime and pair automated regression coverage with direct runtime verification, because shell-level tests alone have already produced a false-finished result on this path.

### Information Density And Scope

- Simplify each major panel to one primary action group, one current-status line, and one supporting description block instead of stacked explanatory paragraphs and competing emphasis.
- In scope: shell styling plus the player-facing scenes and components in `MainMenu`, `WorldMapScene`, `HubScene`, `StoryScene`, `ExpeditionScene`, `PreparationPanel`, `DeckManagementPanel`, `RunHud`, `BattleScene`, `BattleUIManager`, battle/common modal UI, and battle card presentation.
- Out of scope for this Goal: combat rules, story or map content JSON, persistence and state ownership, and non-UI gameplay behavior changes.

### Work Split

- `W-theme-shell` establishes the shared theme and updates the route shell surfaces that set the overall first impression.
- `W-startup-stability` removes the reported launch-time zoom regression from the themed entry flow and depends only on `W-theme-shell`.
- `W-expedition-theme` applies the same theme to expedition preparation, deck management, route cues, and run HUD flows, and remains the owner for the breadcrumb/header separation requirement because it already covers both `ExpeditionScene` and `DeckManagementPanel`.
- `W-expedition-return-confirm` repaired pre-confirm loadout preservation and invalid-loadout handling for the return-confirm path after a deck-management visit.
- `W-expedition-handoff-lifecycle` hardened `ExpeditionScene.init` teardown against the reported detached-blocker crash and added automated coverage for the post-confirm scene start.
- `W-expedition-return-confirm-runtime` follows those expedition fixes to resolve the still-reported same-path runtime defect by reproducing the integrated return-confirm boot path and repairing any remaining stale-state or lifecycle failure.
- `W-battle-theme` applies the same theme to battle HUD, overlays, selection modals, previews, and card presentation.
- `W-expedition-theme` and `W-battle-theme` both depend on `W-theme-shell` so shared theme helpers are defined once before downstream scene work.
