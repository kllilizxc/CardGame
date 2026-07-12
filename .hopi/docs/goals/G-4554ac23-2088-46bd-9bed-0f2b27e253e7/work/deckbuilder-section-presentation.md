---
id: deckbuilder-section-presentation
title: Add sectioned deckbuilder presentation helpers
notBefore: null
dependsOn: []
contractRevision: 1
evidenceRefs:
  - E-R-4b3b2a66-a0f4-4c47-866f-5616fd5f3e86
  - E-R-4a6581ee-17cc-433d-812b-d691a53752b9
  - E-R-d88d7f5a-7141-4118-a9fd-cccc82cb055d
  - E-R-06d4b93d-7be7-4dd5-8ad9-64b54151517a
  - E-R-116d7540-09fd-4ad6-81c0-1287f705b7dc
  - E-R-40361fe6-51b6-49ca-9d42-faeb091245f0
attempts: 0
kind: engineering
stage: done
---
## Objective

Use `.hopi/docs/assistant/attachments/9edc4a62f7ee4cbca9d8653dc9b9a9e96fe8d0099c3fef6d0cb4db87347d077a/yu-gi-oh-master-duel-deck-size.webp` as the structural reference to add the presentation helpers the rebuilt deck manager needs: `main / extra` section descriptors, section counts, and dense-grid layout math, without changing current persistence or expedition gameplay contracts.

## Acceptance Criteria

- Introduce deckbuilder-local helper(s) that transform current saved-deck data and card metadata into the section and tile view models needed by the reference-inspired layout.
- Preserve current stash semantics: no `PersistentStash`, `SavedDeck`, expedition launch payload, or deck-size validation contract changes; absent an explicit classifier, all existing persisted cards resolve into `main` and `extra` reports `0`.
- Extract deck-manager layout calculations for frame, column, and tile sizing, with automated checks that the default deck-manager frame can support at least `8` left-side main-deck tiles per row and `5` right-side card-pool tiles per row.
- Add or update `bun test` coverage for section counts, layout calculations, and unchanged total-card validation assumptions.
