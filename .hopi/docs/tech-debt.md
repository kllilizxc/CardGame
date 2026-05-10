# HOPI Tech Debt

Curated debt worth tracking goes here.

## Radar findings — 2026-05-10

- **HOPI goal identity and mirror docs need reconciliation.**
  - Evidence: this Radar task targets Goal `6d009b3c-9206-4ddd-b00c-0dd885707add`, but `rg "6d009b3c" .hopi .planning` finds no repo doc; the same mature-architecture objective is tracked under `.hopi/docs/goals/d252bb99-35c4-460e-b1f3-b3d3fe05af80.md`, `.hopi/docs/todo.md`, and a legacy `.hopi/docs/goals/goal-3.md` mirror whose Current Focus still names older commits (`630fcbe` / `d613926` / `ce0a4e6` / `8e245d0`) rather than the latest architecture batch.
  - Why it matters: HOPI packets, Planner refreshes, and future Radar passes can attach evidence to the wrong durable doc or resurrect stale focus text if the Goal aliases are not explicit.
  - Durable cleanup: map or migrate the current HOPI Goal ID to the durable `d252bb99-35c4-460e-b1f3-b3d3fe05af80` doc, then retire or refresh `goal-3.md` so there is one authoritative architecture Goal summary.

- **Content validation remains concentrated in large registry/test modules after the validation-index split.**
  - Evidence: `public/data/content-catalog.json` and `src/game/content/contentCatalogValidationIndex.ts` now exist, so the old "no catalog" debt is resolved; the remaining extension surface is still broad, with `src/game/content/contentIdRegistry.ts` at 2,761 lines / 88 KB and `src/game/content/contentCatalog.test.ts` at 2,586 lines / 123 KB owning many domains (cards, gongfa, status, config, world seed, Story, Hub, and Expedition) in one place.
  - Why it matters: future domain-specific validation changes can create noisy conflicts or brittle fixture edits unless splits continue deliberately.
  - Durable cleanup: continue extracting one validation domain at a time only when it reduces near-term change risk; preserve the current catalog public APIs, diagnostics, and zero-failure checked-in content validation.

## Radar findings — 2026-05-09

- **Legacy planning docs drift from implemented Expedition/Story/WorldMap state.**
  - Evidence: `.planning/PROJECT.md` still says `Boot.ts` directly enters `BattleScene`, while `src/game/scenes/Boot.ts` now starts `Preloader` and README documents the durable `Boot -> Preloader -> MainMenu -> WorldMapScene -> HubScene | ExpeditionScene` route; `.planning/STATE.md` still reports Phase 01 as "Ready to execute", 0/3 plans, 0% progress, despite 2026-05-08/09 commits and `.planning/phases/01-first-playable-expedition/*SUMMARY.md` documenting map traversal, battle handoff, and terminal run resolution; `.planning/REQUIREMENTS.md` traceability still marks RUN/MAP/NODE/OUT items Pending.
  - Why it matters: future planning or Radar passes can under-scope follow-up work if they trust the stale `.planning` status instead of the code and summaries.
  - Durable cleanup: reconcile `.planning/PROJECT.md`, `.planning/STATE.md`, and `.planning/REQUIREMENTS.md` with the completed Phase 01 slices or mark `.planning` as superseded by HOPI docs.

- **Battle effect managers still contain no-op or incomplete effect hooks.**
  - Evidence: TODO scan found `ArtifactManager.onUnitAttack/onUnitDamaged` only logging effect text for artifact triggers, `FieldManager.applyFieldPermanentEffects/removeFieldPermanentEffects` not applying/removing permanent field effects, and `PillManager.modifyUnitAttack` not expiring duration-based attack modifiers.
  - Why it matters: content can declare artifact/field/pill effects that appear supported in UI/data but do not consistently affect combat state.
  - Durable cleanup: add focused tests around one manager at a time, then route these hooks through the existing battle effect/status infrastructure or explicitly narrow supported data fields.
