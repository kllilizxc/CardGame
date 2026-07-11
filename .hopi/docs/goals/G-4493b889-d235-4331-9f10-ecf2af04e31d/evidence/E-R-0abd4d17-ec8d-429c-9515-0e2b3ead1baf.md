---
id: E-R-0abd4d17-ec8d-429c-9515-0e2b3ead1baf
createdAt: 2026-07-11T14:49:49.529Z
producerRun: project:P-e1d61c49-c862-46c3-aeba-efebcecc7ac8/goal:G-4493b889-d235-4331-9f10-ecf2af04e31d/work:W-expedition-return-confirm/run:R-0abd4d17-ec8d-429c-9515-0e2b3ead1baf
coordinatorCheck: null
owner: project:P-e1d61c49-c862-46c3-aeba-efebcecc7ac8/goal:G-4493b889-d235-4331-9f10-ecf2af04e31d/work:W-expedition-return-confirm
artifacts: []
---
## Responsibility Result

- Responsibility: generator
- Result: success
- Integration target snapshot: 4a08fb07d73f68417ae6e8cc54d5d0b0b4afee69

## Summary

Guarded ExpeditionScene confirmation against active return transitions and invalid returned loadouts, and added shell-level regression coverage for unchanged returns, selected-deck switches, and same-deck invalid edits. Focused checks passed: bun test src/game/scenes/expedition/expeditionEntryShell.test.ts src/game/scenes/expedition/expeditionEntryFlow.test.ts src/game/scenes/expedition/entryFlowModel.test.ts; bun run build-nolog.
