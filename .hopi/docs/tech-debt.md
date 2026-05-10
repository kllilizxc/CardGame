# HOPI Tech Debt

Curated debt worth tracking goes here.

## Radar findings — 2026-05-09

- **Legacy planning docs drift from implemented Expedition/Story/WorldMap state.**
  - Evidence: `.planning/PROJECT.md` still says `Boot.ts` directly enters `BattleScene`, while `src/game/scenes/Boot.ts` now starts `Preloader` and README documents the durable `Boot -> Preloader -> MainMenu -> WorldMapScene -> HubScene | ExpeditionScene` route; `.planning/STATE.md` still reports Phase 01 as "Ready to execute", 0/3 plans, 0% progress, despite 2026-05-08/09 commits and `.planning/phases/01-first-playable-expedition/*SUMMARY.md` documenting map traversal, battle handoff, and terminal run resolution; `.planning/REQUIREMENTS.md` traceability still marks RUN/MAP/NODE/OUT items Pending.
  - Why it matters: future planning or Radar passes can under-scope follow-up work if they trust the stale `.planning` status instead of the code and summaries.
  - Durable cleanup: reconcile `.planning/PROJECT.md`, `.planning/STATE.md`, and `.planning/REQUIREMENTS.md` with the completed Phase 01 slices or mark `.planning` as superseded by HOPI docs.

- **README/package metadata still carries template-era references.**
  - Evidence: `package.json` is still named `template-react-ts` with Phaser template repository/author/homepage metadata; `README.md` references a top-level `docs/` directory and files such as `docs/ARTIFACT_SYSTEM.md`, `docs/CARD_LIST_VIEW.md`, and `docs/REFACTORING_CARD_SPRITES.md`, but no top-level `docs/` directory exists in this repo; README debugging guidance points to `src/game/ui/BattleLog.ts`, while the checked-in file is `src/game/ui/battle/BattleLog.ts`.
  - Why it matters: onboarding docs and package metadata point contributors toward missing files and an upstream template identity instead of CardGame.
  - Durable cleanup: refresh project metadata and either restore/move the referenced design docs or update README links to existing `public/data/docs/*` / `.hopi/docs/*` sources.

- **Battle effect managers still contain no-op or incomplete effect hooks.**
  - Evidence: TODO scan found `ArtifactManager.onUnitAttack/onUnitDamaged` only logging effect text for artifact triggers, `FieldManager.applyFieldPermanentEffects/removeFieldPermanentEffects` not applying/removing permanent field effects, and `PillManager.modifyUnitAttack` not expiring duration-based attack modifiers.
  - Why it matters: content can declare artifact/field/pill effects that appear supported in UI/data but do not consistently affect combat state.
  - Durable cleanup: add focused tests around one manager at a time, then route these hooks through the existing battle effect/status infrastructure or explicitly narrow supported data fields.

- **Content resource references are validated through scattered scene-specific seams rather than one versioned catalog.**
  - Evidence: `public/data/world/world-map.json` owns `hubFile`, optional `targetLocationId`, and Expedition `worldStateFile` / `starterDeckFile` / `mapFile` / `eventsFile` / `shopFile` strings; Hub JSON owns `startStory.storyGraphFile` strings; story battle metadata can carry encounter/deck files; focused validators exist in files such as `src/game/scenes/worldmap/worldMap.ts`, `src/game/scenes/hub/hubTown.ts`, `src/game/types/prototypeExpeditionContent.ts`, and story tests, but there is no checked-in manifest/catalog file under `public/data` or `src/game` that enumerates resources and validates cross-resource references in one pass.
  - Why it matters: as story graphs, Hub files, world-map destinations, Expedition maps, encounters, decks, and card/status data grow, broken file paths or stale IDs can slip through unless every scene-specific test is updated manually.
  - Durable cleanup: introduce a versioned content catalog/manifest plus reusable cross-resource validation for stable IDs, file paths, and references before broad content production.
