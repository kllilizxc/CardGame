# 修仙卡牌（Phaser + React + TypeScript）

> 一款以修仙题材为背景的卡牌战斗原型，融合单位、法器、功法、丹药、技能等多套系统。该项目基于 Phaser 3 场景与 React 外壳构建，重点实现模块化的战场布局与数据驱动的战斗逻辑，方便继续扩展为完整游戏。

![battle-scene](screenshot.png)

---

## 特性速览

- **统一布局系统**：`BattleLayoutConfig` 统一描述所有 UI 面板和场地区域，可按分辨率或模式动态生成。
- **多管理器架构**：卡牌、法器、技能、丹药、战斗事件、功法效果均由独立 Manager 负责，降低耦合。
- **数据驱动内容**：卡牌、功法、遭遇均来自 `public/data` JSON，可无代码迭代内容。
- **薄大地图路由层**：`WorldMapScene` 读取 `public/data/world/world-map.json`，先把主菜单统一路由到青云镇 Hub 或青云外山试炼 Expedition，暂不拥有解锁、程序化移动或世界状态。
- **数据驱动 Hub / 城镇壳层**：`HubScene` 读取 `public/data/hub/town-shell.json` 渲染青云镇多地点入口，支持 `navigate` 小地点切换并通过本地 Story/Hub session 恢复位置；不同 `startStory.storyGraphFile` action 可启动或恢复主线与茶棚支线等多份 StoryScene 图。
- **StoryState 驱动剧情流**：`storyFlow` 严格校验 `story-graph.json` 的 StoryState 内容合同，`storyFlowViewModel` 将节点、结构化条件、效果应用、推荐理由与缺失节点警告转换为 Phaser 可渲染状态。
- **功法/Usage 机制**：`UsageManager` 记录武器使用情况，`UnitEffectManager` 解析 `gongfa-list.json` 并在回合事件中执行效果（如“引剑者”回收剑类法器）。
- **React ↔ Phaser 桥梁**：`EventBus` 使 React UI 与 Phaser 场景交互（如调试工具或面板控制）。

---

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 游戏引擎 | [Phaser 3.90.0](https://github.com/phaserjs/phaser) |
| 前端壳层 | [React 19](https://github.com/facebook/react) + [Vite 6](https://github.com/vitejs/vite) |
| 语言 | TypeScript 5.7 |
| 构建 | Vite + npm scripts |

---

## 快速开始

### 准备
- Node.js 18+（推荐 LTS）。

### 安装与运行
```bash
npm install
npm run dev       # http://localhost:8080，含日志上报
# 或
npm run dev-nolog # 关闭 log.js 匿名统计
```

构建产物：

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 生成 `dist/`，并发送一次 log.js 统计 |
| `npm run build-nolog` | 同上，跳过 log.js |

> **log.js** 仅收集模板名称 / 构建类型 / Phaser 版本。若需彻底禁用，可删除 `log.js` 并修改 `package.json` scripts。

---

## 项目结构

```
├─public/
│  ├─assets/               # 静态资源
│  └─data/                 # 游戏数据（卡牌、功法、遭遇…）
├─src/
│  ├─App.tsx               # React 根组件
│  ├─PhaserGame.tsx        # React 与 Phaser 的桥梁
│  └─game/
│     ├─main.ts            # Phaser Game 配置
│     ├─config/LayoutConfig.ts
│     ├─scenes/worldmap/WorldMapScene.ts
│     ├─scenes/story/StoryScene.ts
│     ├─scenes/battle/BattleScene.ts
│     ├─managers/          # 战斗子系统管理器
│     ├─objects/           # 卡牌、法器等精灵
│     └─ui/                # UI 面板、面板逻辑
└─docs/                    # 系统设计与重构记录
```

| 路径 | 作用 |
| --- | --- |
| `src/game/config/LayoutConfig.ts` | 定义 `BattleLayoutConfig` 接口与 `createDefaultLayout(width,height)`，集中管理面板/区域位置。 |
| `src/game/scenes/MainMenu.ts` | 标准启动菜单：由 `Boot -> Preloader -> MainMenu` 进入，并提供“进入大地图”按钮启动 `WorldMapScene`。 |
| `src/game/scenes/worldmap/WorldMapScene.ts` | 最小大地图壳层：读取 `public/data/world/world-map.json`，按目的地数据启动既有 `HubScene` 或 `ExpeditionScene`。 |
| `src/game/scenes/worldmap/worldMap.ts` | 大地图纯合同层：校验目的地 id / kind / 默认入口，并把 `hub` / `expedition` 目的地解析为场景启动 intent。 |
| `src/game/scenes/hub/HubScene.ts` | 最小 Hub / 城镇壳层：读取 `public/data/hub/town-shell.json`，渲染地点说明与行动按钮，按数据在城镇小地点间导航或启动 `StoryScene`。 |
| `src/game/scenes/story/StoryScene.ts` | 通用故事场景：按启动 payload 的 `storyGraphFile` 读取主线或支线剧情图，维护 `StoryState`，渲染剧情节点、元数据、条件化选项和终点重开按钮。 |
| `src/game/services/StoryHubSessionPersistence.ts` | Story / Hub 本地 session 边界：用 `cardgame.story-hub-session.v1` 保存 Hub 当前位置和按 `hubId + actionId + storyGraphFile` 分区的 StoryState 快照。 |
| `src/game/scenes/battle/BattleScene.ts` | 核心战场场景：加载数据、初始化 Manager、创建 UI、驱动回合逻辑与功法触发。 |
| `src/game/managers/*.ts` | 各子系统管理器：`CardManager`、`UnitEffectManager`、`UsageManager`、`SkillManager`、`PillManager` 等。 |
| `src/game/ui/*.ts` | UI 组件（战斗日志、卡牌预览、丹药槽、技能栏等），通过布局配置定位。 |
| `src/game/objects/*.ts` | Phaser 精灵与交互（单位卡、法器、符箓等）。 |
| `public/data` | JSON 内容库（卡牌、功法、卡组、遭遇等），配合 `public/data/types` 中的 TypeScript 类型使用。 |
| `docs/*.md` | 设计 / 重构 / Bug 记录，如 `ARTIFACT_SYSTEM.md`、`CARD_LIST_VIEW.md` 等。 |

---

## 运行时架构

### React 外壳
`src/main.tsx` → `App.tsx` / `GameApp.tsx` → `PhaserGame.tsx`。React 仅提供挂载容器及潜在的调试/外部 UI，核心游戏逻辑都在 Phaser。

### Phaser 游戏实例
`src/game/main.ts` 配置 Phaser（画布尺寸、渲染、场景）。标准启动链路为 `Boot -> Preloader -> MainMenu -> WorldMapScene -> HubScene | ExpeditionScene`：`Boot` 只加载预加载器所需的最小背景资源，`Preloader` 加载菜单资源后进入 `MainMenu`。玩家在 `MainMenu` 点击“进入大地图”后进入 `WorldMapScene`；`WorldMapScene` 读取 `public/data/world/world-map.json`，目前提供“青云镇”与“青云外山试炼”两个目的地，并按 `kind` 解析为 `HubScene` 或 `ExpeditionScene` 启动 intent。`HubScene` 继续读取 `public/data/hub/town-shell.json`，可先按 `navigate.targetLocationId` 在城镇小地点间切换并保存当前位置，再由不同 `startStory.storyGraphFile` action 启动或恢复 `StoryScene`，例如 `public/data/story/story-graph.json` 主线或 `public/data/story/qingyun-teahouse-rumors.json` 茶棚支线。`BattleScene` 会被 StoryScene 的 `battleLaunch` 往返复用，也会被 ExpeditionScene 的秘境战斗节点复用。

### WorldMapScene 生命周期
1. `preload`：载入 `data/world/world-map.json`。
2. `create`：用 `worldMap.ts` 校验大地图定义；重复目的地 id、缺失默认目的地或不支持的 `kind` 会在进入场景前失败，避免静默错误路由。
3. 玩家点击 `hub` 目的地：`WorldMapScene` 创建 `sceneKey: "HubScene"` 的启动 intent，进入既有青云镇 Hub；Hub 的故事启动 / 恢复逻辑保持不变。
4. 玩家点击 `expedition` 目的地：`WorldMapScene` 创建 `sceneKey: "ExpeditionScene"` 的启动 intent，进入既有青云外山试炼；秘境准备、地图遍历、战斗往返和结算循环保持不变。

### HubScene 生命周期
1. `preload`：载入 `data/hub/town-shell.json`。
2. `create`：校验 Hub / 城镇定义，从 `StoryHubSessionPersistence` 读取该 `hubId` 的已保存位置；若地点仍存在就恢复，否则回退到 `defaultLocationId`，随后渲染地点、说明和行动按钮，并发出 `EventBus.emit('current-scene-ready', this)`。
3. 玩家点击 `navigate` 行动：`HubScene` 根据该行动的 `targetLocationId` 切换当前地点、写入本地 session 并重新渲染；目标地点必须存在于同一个 Hub JSON 中，场景代码不硬编码目标 id。
4. 玩家点击 `startStory` 行动：`HubScene` 根据 `hubId + actionId + storyGraphFile` 查找已保存的 Story runtime snapshot；存在时将 `StoryState` 与 `selectedChoiceIds` 放入 launch payload 恢复进度，否则按该行动的 `storyGraphFile` 启动新故事。当前切片仍不包含商店、背包、奖励或秘境出口操作。

### StoryScene 生命周期
1. `preload`：载入启动 payload 指定的 `storyGraphFile`；未指定时默认使用 `data/story/story-graph.json`。
2. `create`：校验示例故事图；若 launch payload 携带保存的 `storyState`，则恢复该快照，否则进入 `entryNodeId`。来自 Hub 的启动会立即保存当前 Story runtime snapshot，并发出 `EventBus.emit('current-scene-ready', this)`。
3. 玩家点击选项：`storyFlowViewModel` 使用当前 `StoryState` 检查 `StoryCondition`，阻止不可见 / 不可选或缺失目标的选项；通过 `StoryEffect` 应用选择效果、目标节点跳转和目标节点 `onEnter` 效果。普通剧情推进后会按 `hubId + actionId + storyGraphFile` 保存 `StoryState` 与 `selectedChoiceIds`。若转移产出 `battleLaunch`，`StoryScene` 会以 source-aware story payload 启动 `BattleScene`，并在战斗胜负后按 `onVictoryNodeId` / `onDefeatNodeId` 回到剧情节点，再保存战斗结果后的快照；否则继续渲染当前剧情。如果抵达无可见选项的节点，场景显示终点提示和“重新开始故事”按钮，该按钮会把当前 Hub action 的故事进度重置到入口。`storyFlow` 在加载时只负责拒绝缺失节点、坏跳转等不可游玩的示例图。

### Story / Hub session persistence

`src/game/services/StoryHubSessionPersistence.ts` 是当前唯一允许直接读写 Story / Hub 本地 session 的边界。它使用版本化 key `cardgame.story-hub-session.v1`，存储两类快照：

- `hubs[hubId]`：当前 Hub location id、可选 status text 和更新时间。恢复时如果 location 已从当前 Hub JSON 删除，会安全回退到 `defaultLocationId`。
- `stories[hubId + actionId + storyGraphFile]`：由 Hub action 启动的 `StoryState`、`selectedChoiceIds`、可选 status text 和更新时间。该 key 会随 StoryScene → BattleScene → StoryScene 往返传递，确保战斗结果也写回同一个故事会话。

这只是本地单机 session 边界，不是云存档、完整 world-state ownership、背包 / 商店 / 奖励系统，也不复用 Expedition `RunSnapshot`。

### BattleScene 生命周期
1. `preload`：载入图片 / JSON（卡牌、功法等）。
2. `create`：创建布局、初始化各 Manager、注册事件、发出 `EventBus.emit('current-scene-ready', this)`。
3. `update`：驱动动画 / 状态（目前大多逻辑在 Manager 内处理）。

### 子系统 Manager
- **CardManager**：抽牌、摆放、hover/拖拽回调。整合 `BattleLayoutConfig` 区域，实现居中固定间距算法。
- **UnitEffectManager**：解析 `gongfa-list.json`，根据事件（如 `TurnEnd`）与条件(`ArtifactUsedThisTurn`)执行动作（如恢复弃牌卡）。
- **UsageManager**：记录 `category -> key -> count`，目前用来统计武器使用（剑类法器）。在回合结束前读取并在 `resetCategory` 时清空，方便扩展到符箓/技能等。
- **PillManager / SkillManager / ArtifactManager / FieldManager / BattleEventManager / CombatManager**：分别处理对应领域逻辑。

### UI 布局
`createDefaultLayout(width,height)` 返回一组 `ZoneConfig` / `PanelConfig`：
- `handZone`, `playerFieldZone`, `enemyFieldZone`, `fieldCardZone`
- `pillSlots`, `skillUI`, `cardPreview`, `battleLog`
- `deckButton`, `discardPileButton` 等

BattleScene 将配置传入各 UI 组件，真正的尺寸与位置只出现一次，方便日后根据分辨率、横竖屏或移动端再生成不同布局。

---

## 数据与内容

| 文件 | 说明 |
| --- | --- |
| `public/data/cards/units.json` | 单位卡定义，含 `attack`, `health`, `gongfaIds` 等。 |
| `public/data/cards/artifacts.json` | 法器数据（目标、武器类型、属性加成）。 |
| `public/data/gongfa/gongfa-list.json` | 功法 schema：事件、条件、动作、文案，通过 `UnitEffectManager` 解析。 |
| `public/data/decks/starter-deck.json` | 初始卡组。 |
| `public/data/encounters/*.json` | 敌方单位配置。 |
| `public/data/world/world-map.json` | 第一张薄大地图：声明青云镇 Hub 与青云外山试炼 Expedition 目的地，由 `WorldMapScene` 路由。 |
| `public/data/hub/town-shell.json` | 最小青云镇 Hub 壳层：多地点文案、`navigate.targetLocationId` 前后导航行动，以及多个 `startStory.storyGraphFile` 剧情入口。 |
| `public/data/story/story-graph.json` | StoryState 可执行剧情图：节点、初始状态、`visibleWhen` / `enabledWhen` 条件与 `effects` / `onEnter` 效果，由 `storyFlow` 转换为 UI 和状态迁移。 |
| `public/data/story/qingyun-teahouse-rumors.json` | 极短茶棚支线图：由茶棚 Hub action 启动，用来验证多故事图和 per-action Story/Hub session resume 隔离。 |
| `public/data/story/story-graph.compact.example.json` | 剧情作者可复制的最小 StoryState schema 示例，由 storyFlow 测试校验，避免 authoring 模板漂移。 |
| `public/data/types/*.ts` | 对应的 TypeScript 类型定义，供运行时和 IDE 补全。 |

内容迭代流程：修改 JSON → `npm run dev` 热重载 → 通过 Hub 入口、剧情视图、战斗日志或调试功能验证。

---

## 剧情流视图模型

`src/game/scenes/story/storyFlowViewModel.ts` 是剧情 UI 的纯函数层，也是当前故事视图模型和运行时转移的唯一拥有者：输入 StoryState-backed 剧情图与运行时 `StoryState`，输出当前节点文案、可见 / 可选选项、推荐状态、选择跳转结果、应用后的新 `StoryState` 和内容配置警告。它读取结构化 `StoryCondition` / `StoryEffect`，支持条件失败原因、属性门槛禁用、前置对话 / flag 解锁、选择效果、目标节点 `onEnter` 效果，以及 `startBattle` 效果产生的 `battleLaunch` 元数据。如果选项指向尚未配置的目标节点，视图模型会保留该选项但标记为不可选择，并提供中文警告，避免 StoryScene 因内容缺口崩溃。`src/game/scenes/story/storyFlow.ts` 保留为加载 Hub action 指向的 StoryState 图时的严格校验层，确保 checked-in 示例图本身可游玩，并校验 story battle trigger 的胜利 / 失败续接节点存在。`src/game/scenes/story/storyBattleRoundTrip.ts` 负责把 pure `battleLaunch` 包装成 BattleScene source-aware payload，并把 story battle result 路由回胜利 / 失败节点。主线示例图包含心性属性门槛、前置对话 / flag 解锁、山门广场、试炼石阶、队伍边缘、试炼钟台等小地点切换，并在试炼钟鸣后走一轮 StoryScene → BattleScene → StoryScene 的最小战斗往返；茶棚支线示例则证明同一 Hub 下第二份 StoryState 图可以独立启动和恢复。

---

## 功法与 Usage 流程

1. **记录使用**：当装备剑类法器成功时，`BattleScene.recordArtifactUsage` 调用 `usageManager.recordUsage('artifactWeapon','剑')`。
2. **回合结束**：`BattleScene.endTurn()` → `applyPlayerTurnEndEffects()`，构造 `GongfaRuntimeContext`（包含 `artifactUsage`）。
3. **条件判断**：`UnitEffectManager.areConditionsSatisfied` 检查 `ArtifactUsedThisTurn` 条件是否满足（weaponType + minimum）。
4. **执行动作**：如 `RecoverCardFromDiscard`，从弃牌堆取出目标卡牌（“引剑者”效果）。
5. **重置**：本回合功法结算后 `usageManager.resetCategory('artifactWeapon')`，确保下回合重新记录。

扩展：任意系统都可以通过 UsageManager 追踪（例如技能次数、符箓消耗），并在功法条件中新增对应类型。

---

## 自定义布局指南

1. 打开 `src/game/config/LayoutConfig.ts`。
2. 修改或新增 `BattleLayoutConfig` 字段（例如新面板 `artifactLog`）。
3. 更新 `createDefaultLayout(width,height)` 中对应区域，考虑比例/间距。
4. 在 `BattleScene` 中将新配置注入相关 UI（`this.createBattleLog(layout.battleLog)` 等）。
5. UI 组件内部只引用 `config.x/y/width/height`，避免再次硬编码。

> 建议保留一个“逻辑区域名称”与“Phaser 实际 Zone”一一对应的方式，方便 Manager 使用（如 CardManager 直接获取 `layout.handZone`）。

---

## Onboarding Checklist

1. **阅读 README 与 `docs/`**：了解现有系统，尤其是 `ARTIFACT_SYSTEM.md` & `CARD_LIST_VIEW.md`。
2. **运行 Dev 环境**：`npm run dev`，在浏览器中打开战斗场景。
3. **熟悉数据**：浏览 `public/data/cards` 与 `gongfa/gongfa-list.json`，理解字段。
4. **理解回合流**：从 `BattleScene.playerTurn()` / `enemyTurn()` / `endTurn()` 入手，观察 Manager 协作方式。
5. **尝试修改一张卡牌**：调整攻击力或功法，确认热重载与日志输出。
6. **阅读关键 Manager**：`CardManager`, `UnitEffectManager`, `UsageManager`, `ArtifactManager`，掌握职责边界。
7. **扩展/修复**：根据需求在 Manager 内实现，必要时更新 `LayoutConfig` 和相应 UI。

---

## 调试与常用技巧

- **BattleLog**：`src/game/ui/BattleLog.ts`，通过 `battleLog.addLog()`、`addGongfaLog()` 输出关键节点信息。
- **EventBus 调试**：React 层可通过 `EventBus.on` 监听场景事件，快速做外部工具。
- **热重载**：Vite 自动刷新；若遇到 Phaser 资源缓存问题，可在 `preload` 中使用 `this.load.reset()` 或清理缓存。
- **功法排查**：在 `UnitEffectManager.applyTurnEndEffectsForPlayerUnits` 临时输出 context（Usage、场上单位、弃牌堆）。
- **布局问题**：确认 `BattleScene` 中所有 UI 调用均使用 `layout.xxx`，并检查 `createDefaultLayout` 是否返回正确值。

---

## 部署

```bash
npm run build      # 或 npm run build-nolog
# 输出 dist/
```

将 `dist` 全量上传至任意静态服务器（Vercel、Netlify、OSS 等）。如需自定义 base path，请调整 `vite.config.ts` 中的 `base` 配置。

---

## 相关文档与参考

- `docs/ARTIFACT_SYSTEM.md`：法器流程、动画时序、交互细节。
- `docs/CARD_LIST_VIEW.md`：卡牌列表 UI 规划。
- `docs/REFACTORING_CARD_SPRITES.md`：卡牌精灵演进记录。
- `public/data/docs/story-authoring-guide.md`：剧情作者指南，说明 StoryState 图的写作流程、字段速查、compact schema 示例和验证命令。
- `public/data/docs/story-content-contracts.md`：剧情内容合同，定义 Hub-launched StoryState 图（如 `story-graph.json` 与 `qingyun-teahouse-rumors.json`）的 StoryState / StoryCondition / StoryEffect JSON 操作。
- Phaser 官方资源： [API 文档](https://newdocs.phaser.io)、[示例仓库](https://labs.phaser.io)。

如需讨论或提交 Issue，欢迎附上：
1. 复现步骤
2. 相关数据（卡牌/功法 ID）
3. 截图或 BattleLog 片段

祝开发顺利，玩得开心！
