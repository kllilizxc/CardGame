# 修仙卡牌（Phaser + React + TypeScript）

> 一款以修仙题材为背景的卡牌战斗原型，融合单位、法器、功法、丹药、技能等多套系统。该项目基于 Phaser 3 场景与 React 外壳构建，重点实现模块化的战场布局与数据驱动的战斗逻辑，方便继续扩展为完整游戏。

![battle-scene](screenshot.png)

---

## 特性速览

- **统一布局系统**：`BattleLayoutConfig` 统一描述所有 UI 面板和场地区域，可按分辨率或模式动态生成。
- **多管理器架构**：卡牌、法器、技能、丹药、战斗事件、功法效果均由独立 Manager 负责，降低耦合。
- **数据驱动内容**：卡牌、功法、遭遇均来自 `public/data` JSON，可无代码迭代内容。
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
│     ├─scenes/BattleScene.ts
│     ├─managers/          # 战斗子系统管理器
│     ├─objects/           # 卡牌、法器等精灵
│     └─ui/                # UI 面板、面板逻辑
└─docs/                    # 系统设计与重构记录
```

| 路径 | 作用 |
| --- | --- |
| `src/game/config/LayoutConfig.ts` | 定义 `BattleLayoutConfig` 接口与 `createDefaultLayout(width,height)`，集中管理面板/区域位置。 |
| `src/game/scenes/BattleScene.ts` | 核心战场场景：加载数据、初始化 Manager、创建 UI、驱动回合逻辑与功法触发。 |
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
`src/game/main.ts` 配置 Phaser（画布尺寸、渲染、场景）。当前仅注册 `BattleScene`，未来可拓展多个场景。

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
| `public/data/types/*.ts` | 对应的 TypeScript 类型定义，供运行时和 IDE 补全。 |

内容迭代流程：修改 JSON → `npm run dev` 热重载 → 通过战斗日志/调试功能验证。

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
- Phaser 官方资源： [API 文档](https://newdocs.phaser.io)、[示例仓库](https://labs.phaser.io)。

如需讨论或提交 Issue，欢迎附上：
1. 复现步骤
2. 相关数据（卡牌/功法 ID）
3. 截图或 BattleLog 片段

祝开发顺利，玩得开心！
