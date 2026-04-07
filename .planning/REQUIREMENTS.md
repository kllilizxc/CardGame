# Requirements: CardGame

**Defined:** 2026-04-06
**Core Value:** 每次秘境探索都要让玩家明确感受到：带进去的是真资产，活着带出来的才真正属于自己。

## v1 Requirements

### Expedition Entry

- [ ] **RUN-01**: Player can review a persistent starter stash and confirm the deck / items taken into a 秘境 run
- [ ] **RUN-02**: Entering a run creates an active run snapshot that persists across scene transitions until the run ends

### Map Exploration

- [ ] **MAP-01**: Player can traverse a fixed layered 秘境 map by selecting connected reachable nodes
- [ ] **MAP-02**: Fog of war reveals cleared nodes, adjacent reachable nodes, and the outline of the next layer only
- [ ] **MAP-03**: One run includes at least a normal battle node, an event node, a shop node, an extract node, and a boss node

### Node Resolution

- [ ] **NODE-01**: Battle and boss nodes launch the existing card battle with node-specific encounter data and the active run deck
- [ ] **NODE-02**: Event and shop nodes can add or remove cards, items, or run currency from the current run without ending the run

### Run Outcomes

- [ ] **OUT-01**: Losing a battle ends the run and permanently removes all carried or looted cards, items, and run currency from the player's stash
- [ ] **OUT-02**: Clearing the boss or extracting ends the run successfully and permanently banks all carried or looted cards, items, and run currency into the player's stash
- [ ] **OUT-03**: After any terminal outcome, player returns to the entrance view with an updated stash and a readable result summary

## v2 Requirements

### Extended Expedition Rules

- **RECV-01**: Player can recover a dropped storage bag from the death node in a later run
- **MAP-04**: Multiple secret realm maps can share the same expedition framework
- **META-01**: Hub progression and unlocks persist across runs
- **DECK-01**: Player can build and save multiple custom expedition decks

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full deck construction UI | First slice only needs starter stash confirmation, not full collection management |
| Cross-run extraction point resume | Adds persistence complexity beyond the first risk / reward proof |
| Online sync / social features | No backend needed for the local prototype |
| Full story branching | Phase 01 focuses on the mechanical loop first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-01 | Phase 01 | Pending |
| RUN-02 | Phase 01 | Pending |
| MAP-01 | Phase 01 | Pending |
| MAP-02 | Phase 01 | Pending |
| MAP-03 | Phase 01 | Pending |
| NODE-01 | Phase 01 | Pending |
| NODE-02 | Phase 01 | Pending |
| OUT-01 | Phase 01 | Pending |
| OUT-02 | Phase 01 | Pending |
| OUT-03 | Phase 01 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after guided planning scaffold expansion*
