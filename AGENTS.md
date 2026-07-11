# Project Entry

- Stack: React 19 + Phaser 3 + TypeScript. Runtime entry is `src/main.tsx` -> `src/GameApp.tsx` -> `src/game/main.ts`.
- Canvas baseline: `src/game/main.ts` configures a 1920x1080 Phaser scene scaled with `Phaser.Scale.FIT`.
- `src/App.tsx` is legacy template/debug code and is not the mounted runtime entry; `GameApp` is the active shell.
- Primary player scenes are `src/game/scenes/MainMenu.ts`, `worldmap/WorldMapScene.ts`, `hub/HubScene.ts`, `story/StoryScene.ts`, `expedition/ExpeditionScene.ts`, and `battle/BattleScene.ts`.
- UI-heavy supporting code lives in `src/game/ui/**`, `src/game/config/LayoutConfig.ts`, `src/game/managers/common/CardPreviewManager.ts`, and `src/game/objects/**`.
- Browser shell styling lives in `index.html`, `public/style.css`, and `src/GameApp.css`.
- Content and player-facing copy are data-driven from `public/data/**`; UI planning should avoid changing gameplay data unless the Goal explicitly asks for it.
- Tests exist as `*.test.ts` beside source files. Prefer `bun test`; local smoke checks can use the existing package scripts through `bun run dev-nolog` and `bun run build-nolog`.

# Bun Workflow

- Use Bun as the default toolchain for routine local work. Do not default to `node`, `npm`, `npx`, `yarn`, or `pnpm` command paths unless a task explicitly requires an exception.
- Use `bun install` for dependency installation and lockfile updates.
- Use `bun <file>` to execute repo-local JavaScript or TypeScript files directly instead of `node <file>`.
- Use `bun run <script>` for package scripts, including `bun run dev-nolog` and `bun run build-nolog` for local smoke checks.
- Use `bun test` for the colocated `*.test.ts` suites.
- Use `bunx <cli>` for package-exposed CLIs instead of `npx <cli>` or global installs.
