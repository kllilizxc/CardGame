# CardGame

## What This Is

CardGame 是一个以修仙世界观包装的卡牌冒险游戏，当前仓库已经拥有 Phaser + React 的战斗原型与数据驱动卡牌内容。第一里程碑要把它推进成一个“带着自己的卡组和道具进入秘境 → 探索爬塔式搜打撤地图 → 战斗 / 事件 / 商店 / 撤离 → 结算永久得失”的可玩闭环。

## Core Value

每次秘境探索都要让玩家明确感受到：带进去的是真资产，活着带出来的才真正属于自己。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 在现有战斗原型上补出首个可玩的秘境搜打撤闭环。
- [ ] 复用现有 `BattleScene` / 卡牌 JSON / starter deck 数据，而不是重做一套战斗系统。
- [ ] 让战败、撤离、Boss 通关真正改变玩家的永久仓库。

### Out of Scope

- 完整 deckbuilder 与多套自定义卡组管理 — Phase 01 先用 1 套 starter stash 验证闭环。
- 多秘境、多章节主线与长期 Hub 经营 — 先做单张原型地图。
- 遗失储物袋回收、跨 run 撤离点复用等扩展规则 — 等首个闭环验证后再加。
- 联网、排行榜、云存档 — 当前目标是本地单机原型。

## Context

- `README.md` 已说明当前项目是 Phaser 3 + React + TypeScript 的修仙卡牌战斗原型。
- `src/game/scenes/battle/BattleScene.ts` 已经能读取卡组 / 敌人 JSON 并跑完整战斗。
- `public/data/docs/秘境.md` 已定义“探索 → 战斗 → 搜刮 → 撤离”的大方向，是 Phase 01 的核心玩法参考。
- 当前游戏从 `Boot.ts` 直接进入 `BattleScene`，缺少探索地图、永久仓库和 run 结算层。

## Constraints

- **Tech stack**: 必须继续使用 Phaser 3 + React 19 + TypeScript + Vite。
- **Reuse**: 现有 `BattleScene` 与 `public/data/cards/*.json` 仍是战斗系统的 source of truth。
- **Scope**: 本次只做 planning artifacts，不开始实现。
- **Slice discipline**: 首个工作切片只允许 1 张固定拓扑秘境地图 + 小型随机内容池，先验证风险 / 收益闭环。
- **Persistence**: 先使用本地持久化（如 localStorage / 本地 JSON 驱动状态），不设计远程后端。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Phase 01 采用 1 张固定拓扑的原型秘境地图，并在节点内容上保留少量随机池 | 最快验证“爬塔 + 搜打撤”的核心张力 | — Pending |
| 玩家永久仓库先由 starter deck + 少量可携带道具 / 资源构成 | 先把“带进去 / 带出来 / 死了就失去”做真，再扩展 deckbuilder | — Pending |
| 战斗与 Boss 节点必须复用现有 `BattleScene` | 避免重复造轮子，缩短从规划到可玩切片的距离 | — Pending |
| 事件、商店、撤离点都要出现在 Phase 01 | 没有这些节点，就无法验证搜打撤地图闭环 | — Pending |

---
*Last updated: 2026-04-06 after converting the planning seed into executable Phase 01 artifacts*
