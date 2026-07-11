# 验证 Bun 项目指导已就绪 Design

## Problem

- The canonical repository-root `AGENTS.md` exists in authority.
- That file currently records only project-entry and runtime-structure guidance for the React 19 + Phaser 3 + TypeScript app.
- It does not explicitly direct contributors to default to Bun, so the Goal cannot be completed on the current canonical facts alone.
- Because the requested outcome is documentation-only, the smallest schedulable repair is to extend the existing root `AGENTS.md` rather than touch application code or add broader workflow changes.

## Current Design

### Established Facts

- The Goal contract remains at revision 1 and is limited to verifying or repairing repository guidance around Bun usage.
- The existing root `AGENTS.md` must be preserved and extended, not replaced with a new bootstrap document.

### Required Documentation Outcome

- Keep the current project-entry guidance intact and add an explicit Bun-first instruction at the repository root.
- Make the default toolchain unambiguous by documenting the common command paths contributors should use with Bun, including direct execution, script execution, dependency installation, tests, and package-exposed CLIs.
- Keep the repair confined to the root `AGENTS.md`; application source, gameplay data, and other project documentation are out of scope.

### Proof Standard

- Completion is justified only when the canonical repository-root `AGENTS.md` both exists and explicitly tells contributors to use Bun by default.
- Reviewer proof should confirm the file still lives at repo root, preserves the prior project-entry guidance, and states the Bun-default command guidance clearly enough that no contributor must infer it from other documents.
