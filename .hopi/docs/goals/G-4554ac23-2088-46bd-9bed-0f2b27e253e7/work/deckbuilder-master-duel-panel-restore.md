---
id: deckbuilder-master-duel-panel-restore
title: Restore the deck manager to the reference-inspired layout
notBefore: null
dependsOn:
  - deckbuilder-section-presentation
contractRevision: 1
evidenceRefs:
  - E-R-f037bde2-4fbb-4f8d-ba23-e38a4fd457f6
  - E-R-09646126-4d8d-4a0b-ade2-d736ddfe0f9b
attempts: 0
kind: engineering
stage: done
---
## Objective

Use `.hopi/docs/assistant/attachments/9edc4a62f7ee4cbca9d8653dc9b9a9e96fe8d0099c3fef6d0cb4db87347d077a/yu-gi-oh-master-duel-deck-size.webp` as the visual benchmark to rebuild the default `DeckManagementPanel` state so it reads like the reference: a wide left deck canvas with visible `Main Deck / Extra Deck` counts and a dense right card-library column with search, filter, and sort controls, while keeping the current deck-management flow usable.

## Acceptance Criteria

- Rebuild the panel default state around the agreed hierarchy: deck-name header and compact deck actions on the left, explicit `Main Deck` and `Extra Deck` sections with counts below, and a right-side card-library header, search bar, condensed controls, and dense card pool grid.
- Preserve current interactions and wiring: deck selection, create, rename, delete, `+1`, quick add, `-1`, clear, keyboard focus movement, pointer selection, and `onClose` return to expedition preparation.
- Reduce persistent summary/detail copy so both columns remain visible together in the default `1920x1080`-like frame; any card-detail treatment must become secondary or on-demand instead of displacing the main deck/pool grids.
- Adjust `ExpeditionScene` fallback panel sizing or shell placement only as needed for the rebuilt panel to fit cleanly, and add or update smoke/unit coverage for extracted layout or state logic changed by the refactor.
