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

### Information Density And Scope

- Simplify each major panel to one primary action group, one current-status line, and one supporting description block instead of stacked explanatory paragraphs and competing emphasis.
- In scope: shell styling plus the player-facing scenes and components in `MainMenu`, `WorldMapScene`, `HubScene`, `StoryScene`, `ExpeditionScene`, `PreparationPanel`, `DeckManagementPanel`, `RunHud`, `BattleScene`, `BattleUIManager`, battle/common modal UI, and battle card presentation.
- Out of scope for this Goal: combat rules, story or map content JSON, persistence and state ownership, and non-UI gameplay behavior changes.

### Work Split

- `W-theme-shell` establishes the shared theme and updates the route shell surfaces that set the overall first impression.
- `W-startup-stability` removes the reported launch-time zoom regression from the themed entry flow and depends only on `W-theme-shell`.
- `W-expedition-theme` applies the same theme to expedition preparation, deck management, route cues, and run HUD flows, and remains the owner for the breadcrumb/header separation requirement because it already covers both `ExpeditionScene` and `DeckManagementPanel`.
- `W-battle-theme` applies the same theme to battle HUD, overlays, selection modals, previews, and card presentation.
- `W-expedition-theme` and `W-battle-theme` both depend on `W-theme-shell` so shared theme helpers are defined once before downstream scene work.
