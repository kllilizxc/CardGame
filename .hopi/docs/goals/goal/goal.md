---
goalKey: goal
title: "新建教学关"
status: active
autopilotEnabled: true
deployRequiresApproval: true
---

# 新建教学关

## Objective

- 用一个完整的剧本/故事串起一个教学关卡，要有一个起承转合的小故事，不要 demo 样式的糊弄
- 需要覆盖所有玩法：秘境，战斗，地图等等
- 尽量只有 1-3 次战斗覆盖所有知识点，不要太多
- 教学时没有任何随机性，卡组固定，出牌顺序固定；除非教学目的完成后让玩家随意结束战斗
- 做教学模式时考虑代码结构，不要和常规战斗过于耦合

## Success Criteria

满足上述所有条件，最后成品不需要改动即可发布上市试玩。

可执行化标准：

- 教学关以独立、可重复进入的教学模式呈现；普通大地图 / Hub / 故事 / 秘境 / 战斗默认流程不能因为教学关而改变随机性、存档、牌序或 route 语义。
- 教学内容必须是一个完整的青云入门小故事，至少有明确的起、承、转、合，并把教学提示嵌入剧情与关卡目标，而不是孤立按钮说明或临时 demo。
- 教学覆盖大地图、Hub 子地图、故事选择、秘境节点、战斗、奖励 / 撤离 / 返回等现有核心玩法；首版目标是 1-3 场战斗，默认规划为 2 场，除非后续剧本矩阵证明 1 场足够。
- 教学完成前所有影响玩法结果的随机性都必须由显式教学配置固定：牌库顺序、初始手牌、秘境事件结果、遭遇、路线和教学检查点。教学目的完成后的自由结束阶段可以放开。
- 教学模式通过数据资源、启动 payload、纯校验和小型 opt-in runtime seams 接入现有系统；禁止通过全局 monkeypatch、硬编码一次性 TutorialScene 或修改常规战斗默认行为来实现。

## Brainstorming Clarification Outcome

### 项目上下文

- 当前标准入口是 `Boot -> Preloader -> MainMenu -> WorldMapScene -> HubScene | ExpeditionScene -> BattleScene`；故事可经 Hub action 启动，Story battle 已能 source-aware 往返 BattleScene。
- 现有内容资源已 catalog-backed：`public/data/content-catalog.json` 覆盖 WorldMap、Hub、Story、Expedition、Deck、Encounter、Card、Status、Gongfa、Config 和 world seed。
- 当前 gameplay 确定性基础已覆盖两处核心随机点：Battle 牌库启动可通过显式 `deterministicBattleSetup.deckOrder = preserve-json-order` 保留 JSON 牌序，Expedition 非战斗事件可通过显式 fixed outcome 选择固定结果；普通 Story / Expedition / direct/default Battle 默认仍保持现有随机 / 洗牌语义。动画抖动等表现随机不属于首批 gameplay 确定性边界。
- 现有 Qingyun 世界观、Hub、主线 Story、秘境和战斗资源可复用为风格参考，但不能把现有示例图当作最终教学关直接发布；教学需要自己的剧本矩阵和资源身份。

### 澄清后的工作假设

- 教学关优先做成 MainMenu 可进入的独立教学模式，而不是强制覆盖普通新游戏流程；后续若要首启强制教学，需要单独产品决策。
- 教学故事沿用青云宗入门 / 山门试炼语境，走一条短而完整的“求道入门”小闭环：山脚集市获知规则、山门问心学习地图/故事选择、秘境试炼学习探索与奖励、演武收束学习战斗胜利/撤离后返回。
- 首批实现先补“内容设计”和“确定性 runtime seam”，再做 playable wiring；这样避免在剧情、路线和无随机要求未落地前堆出 demo 式硬编码关卡。
- 教学专属资源应使用稳定 ID 命名（例如 `tutorial.qingyun-*`），并通过 content catalog / 现有验证链路纳入检查。

### 方案比较

1. **选择：数据驱动独立教学模式 + opt-in 确定性 seam**
   - 优点：复用现有 WorldMap / Hub / Story / Expedition / Battle 资产边界，教学可作为发布内容维护；普通玩法默认不变；后续可扩展检查点、引导文案和教程重置。
   - 代价：第一轮需要先做剧本矩阵和确定性 seam，不能立刻产出看似可玩的 demo。

2. **不选：硬编码 `TutorialScene` 串场**
   - 优点：短期最快。
   - 问题：会绕过现有内容合同和 route/save/battle 语义，后续每次玩法变化都要双维护，且很容易变成 demo 式糊弄。

3. **不选：直接改造现有主线 / 默认秘境为教学**
   - 优点：少加资源。
   - 问题：会污染普通试玩节奏和已有示例内容，难以保证教程可重复、无随机且不影响普通存档。

## Current Strategy

- 2026-05-14 再次复核当前 `dev` 后修正记忆：教程战斗固定牌序 seam 已经存在于当前 checkout（`DeterministicBattleSetup`、Story/Expedition payload 克隆、`createBattleDeckStartupPlan`、`BattleScene` 条件洗牌），且 focused tests 通过；不要再把它当成缺口重复提升。
- 当前已真实落地的是两类基础：教程 Expedition 方向的 `tutorial.qingyun-*` 秘境 map/events/shop/worldSeed/deck/encounter 资源、固定 Expedition event outcome seam、外山试炼路线 / 商店 / 撤离验证；以及 Battle 牌库启动的 opt-in 固定牌序 seam。普通 Expedition 默认 weighted random、route-key active-run、普通 Story / Expedition / default Battle 洗牌语义仍应保持不变。
- 本轮只恢复两个仍缺失的基础缺口：`public/data/docs/tutorial-mainline.md` 教学剧本矩阵文档，以及缺失的教程 WorldMap / Hub / Story resource skeleton 与 content catalog 校验。旧分支 `hopi-task-0d629aae`、`hopi-task-e5ec20c9` 可作为参考，但 Generator 必须在当前 `dev` 上窄幅移植，不能回退已落地的教程 Expedition 内容或重复改 Battle seam。
- 教程前置的资源骨架与剧本矩阵已经落地验证。现在可以解封并推进大地图与 Hub 内容、以及故事与首场战斗内容。随后再接 MainMenu 教学入口、教程 session/reset、提示 UI 和端到端 smoke。

## Current Focus

- 2026-05-14 最新评估：`tutorial-mainmenu-entry` 正在执行中。
- `tutorial-hint-ui`（实现教学关卡中嵌入的提示 UI 逻辑）依赖于 `tutorial-mainmenu-entry`，因此本轮 Planner 暂不派发新任务，等待入口逻辑落地后再推进 UI 提示和最后的 e2e 验证。

## Open Questions

- 暂无阻塞问题。若后续要把教学改成首次启动强制流程、加入配音/CG/角色立绘、或允许教程影响正式存档，需要先单独决策。
