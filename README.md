# 修仙卡牌（Phaser + React + TypeScript）

> 一款以修仙题材为背景的卡牌战斗原型，融合单位、法器、功法、丹药、技能等多套系统。该项目基于 Phaser 3 场景与 React 外壳构建，重点实现模块化的战场布局与数据驱动的战斗逻辑，方便继续扩展为完整游戏。

![battle-scene](screenshot.png)

---

## 特性速览

- **统一布局系统**：`BattleLayoutConfig` 统一描述所有 UI 面板和场地区域，可按分辨率或模式动态生成。
- **多管理器架构**：卡牌、法器、技能、丹药、战斗事件、功法效果均由独立 Manager 负责，降低耦合。
- **数据驱动内容**：卡牌、功法、遭遇均来自 `public/data` JSON，可无代码迭代内容；`public/data/content-catalog.json` 作为版本化清单覆盖当前 checked-in 内容，`src/game/content/contentCatalog.ts` 既提供测试用纯校验（路径、JSON、领域 ID、首层 route-critical 引用、Hub `startStory.storyResourceId` / `storyGraphFile`、Story battle `encounterResourceId` / `deckResourceId`、Expedition battle/boss `payloadRef.encounterResourceId` / `encounterFile` 对齐），也提供运行时 resolver seam：`Preloader` 先加载 catalog，`WorldMapScene` 用稳定资源 ID `worldmap.qingyun-region` 解析并加载 checked-in world-map JSON，`HubScene` 用默认 / payload `hubResourceId` 解析并加载 checked-in Hub JSON，`StoryScene` 用 `storyResourceId`（默认 `story.qingyun-entry`，旧直启可用 `storyGraphFile` 反查 catalog `publicPath`）解析并加载 checked-in Story JSON；Story-sourced `BattleScene` 启动再用 `encounterResourceId` / `deckResourceId` 解析并加载遭遇与卡组 JSON，`encounterFile` / `deckFile` 保留为兼容别名；`ExpeditionScene` 启动用默认 / payload `worldStateResourceId`、`starterDeckResourceId`、`mapResourceId`、`eventsResourceId`、`shopResourceId` 解析 world-state seed、starter deck、地图、事件和商店 JSON，兼容文件字段仍提供 cache key 与 publicPath 对齐校验；Expedition-sourced Battle encounter 仍保留 payload `encounterFile` 加载边界；Battle 直启 / 默认启动则通过 catalog 默认资源 `test_encounter_02` / `deck.starter` 解析到 `data/encounters/medium-enemy.json` / `data/decks/starter-deck.json`，但继续使用 `currentEncounter` / `starterDeck` cache key 和这些路径作为兼容别名。
- **薄大地图路由层**：`WorldMapScene` 不再硬编码 world-map 文件路径，而是通过 runtime catalog 资源 ID `worldmap.qingyun-region` 解析到 `public/data/world/world-map.json`；大地图目的地持有 Hub / Hub location / Expedition 的目标身份、数据文件（如 `hubFile`、可选 `targetLocationId`、`mapFile`、事件/商店文件）和轻量空间展示元数据；主菜单进入后会显示可拖拽平移的大地图标记，再路由到青云镇 Hub、青云宗山门 Hub、集市茶棚 Hub 地点、青云外山试炼 Expedition 或青玉洞试炼 Expedition；Hub / Expedition 可用最小返回按钮回到大地图，并依赖各自本地 session / 按 route key 分区的 active run 恢复进度。
- **数据驱动 Hub / 城镇壳层**：`HubScene` 默认通过 catalog 资源 `hub.qingyun-town` 读取 `public/data/hub/town-shell.json` 渲染青云镇多地点入口，也可由大地图 payload 的 `hubResourceId` 读取 `public/data/hub/qingyun-sect-gate.json` 等第二个 Hub 文件；Hub JSON 自带轻量子地图 `presentation`（地图尺寸 / 初始中心 / 每地点 normalized 标记），玩家先在可拖拽 Hub 子地图选择地点，再使用该地点现有行动面板；Hub 目的地可用 `targetLocationId` 直接落到已声明地点，`startStory.storyResourceId` 提供 catalog-backed story 目标身份，`storyGraphFile` 仍是 StoryScene cache key / session key 的路径别名，并必须与 catalog `publicPath` 对齐，不同 `hubId + actionId + startStory.storyGraphFile` 会启动或恢复独立 StoryScene 进度。
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

> **log.js** 仅收集 package name / 构建类型 / Phaser 版本。若需彻底禁用，可删除 `log.js` 并修改 `package.json` scripts。

---

## 项目结构

```
├─.planning/               # 产品规划、需求与阶段计划
├─public/
│  ├─assets/               # 静态资源
│  └─data/
│     ├─docs/              # 内容规则、剧情、秘境与卡牌设计文档
│     ├─hub/               # Hub / 城镇入口数据
│     ├─story/             # StoryState 剧情图
│     └─world/             # 大地图 route 数据
├─src/
│  ├─App.tsx               # React 根组件
│  ├─PhaserGame.tsx        # React 与 Phaser 的桥梁
│  └─game/
│     ├─main.ts            # Phaser Game 配置
│     ├─content/           # 内容清单 manifest 的运行时 resolver seam 与纯校验 harness
│     ├─config/LayoutConfig.ts
│     ├─scenes/worldmap/WorldMapScene.ts
│     ├─scenes/story/StoryScene.ts
│     ├─scenes/battle/BattleScene.ts
│     ├─managers/          # 战斗子系统管理器
│     ├─objects/           # 卡牌、法器等精灵
│     └─ui/                # UI 面板、面板逻辑
└─vite/                    # Vite dev / prod 配置
```

| 路径 | 作用 |
| --- | --- |
| `src/game/config/LayoutConfig.ts` | 定义 `BattleLayoutConfig` 接口与 `createDefaultLayout(width,height)`，集中管理面板/区域位置。 |
| `src/game/scenes/MainMenu.ts` | 标准启动菜单：由 `Boot -> Preloader -> MainMenu` 进入，并提供“进入大地图”按钮启动 `WorldMapScene`。 |
| `src/game/scenes/worldmap/WorldMapScene.ts` | 最小大地图壳层：读取 `Preloader` 已加载的 content catalog，用 `worldmap.qingyun-region` 解析并加载 `public/data/world/world-map.json`，按目的地空间展示元数据渲染可拖拽平移的点击标记，启动既有 `HubScene` 或 `ExpeditionScene`，并显示从 route 场景返回时传入的状态文案。 |
| `src/game/scenes/worldmap/worldMap.ts` | 大地图纯合同层：校验目的地 id / kind / 默认入口 / 空间展示元数据，把 `hub` / `expedition` 目的地解析为场景启动 intent，并提供 Hub / Expedition 返回大地图的 typed intent。 |
| `src/game/scenes/hub/HubScene.ts` | 最小 Hub / 城镇壳层：读取 Hub JSON 的子地图 `presentation` 与地点行动数据，渲染可拖拽地点标记；选择标记或 `navigate` 行动会保存当前 Hub location，再显示该地点既有行动按钮或启动 `StoryScene`。 |
| `src/game/scenes/story/StoryScene.ts` | 通用故事场景：按启动 payload 的 `storyResourceId`（未显式提供时默认 `story.qingyun-entry`，旧直启 `storyGraphFile` 可反查 catalog `publicPath`）解析并加载主线或支线剧情图；`storyGraphFile` 仍提供稳定 cache key / session key，场景维护 `StoryState`，渲染剧情节点、元数据、条件化选项和终点重开按钮。 |
| `src/game/services/StoryHubSessionPersistence.ts` | Story / Hub 本地 session 边界：用 `cardgame.story-hub-session.v1` 保存 Hub 当前位置和按 `hubId + actionId + storyGraphFile` 分区的 StoryState 快照。 |
| `src/game/services/SaveCompatibility.ts` | 当前本地存档 / world-state 兼容性登记表：集中记录 Story/Hub session、永久仓库、按 route 分区 active run 的 owner、storage key、schema/key version、route-key 推导、legacy active-run key 和未来 migration 占位。 |
| `src/game/services/SaveWorldStateSnapshot.ts` | 只读 save / world-state 兼容性快照门面：复用 `SaveCompatibility` 元数据和现有 Story/Hub、永久仓库、route-keyed active run 读取边界，给后续统一存档工作提供单一观察视图，但不写入统一存档、不改 schema、不迁移格式。 |
| `src/game/state/GameWorldState.ts` | 当前游戏世界的 typed read-only view：在 `SaveWorldStateSnapshot` 之上投影 Story/Hub session、stored persistent stash 或 starter seed fallback、route-keyed active run identity/document 与 RunResolution metadata；不接管写入、不新增 storage key、不改变 bootstrap/save 行为。 |
| `src/game/state/GameWorldStateWrite.ts` | 当前游戏世界的窄口径聚合写入门面：只接受显式 storage adapter，按 `storyHubSession -> persistentStash -> activeRun` 固定顺序复用既有 slice writers 写入当前兼容 key，支持 nullable stash remove 与指定 route active-run save/clear；不接入 scene、restore/transfer 或新增统一存档 key。 |
| `src/game/services/SaveWorldStateDocument.ts` | 纯内存版本化 save / world-state 文档契约：把 `SaveWorldStateSnapshot` 转成可 clone / parse / validate 的 `SaveWorldStateDocument`，记录 `schemaVersion`、content type、owner metadata 与显式 no-op document migration boundary；不读写 localStorage、不新增 storage key、不执行真实 migration 或 restore flow。 |
| `src/game/services/SaveWorldStateDocumentRestorePlan.ts` | 把已验证的 `SaveWorldStateDocument` 转成 descriptor-only restore plan：当前只覆盖 Story/Hub session、全局 persistent stash、route-keyed active run，null owner slice 会变成显式 `removeItem`，legacy unscoped active-run key 保留为 `no-op`。 |
| `src/game/services/SaveWorldStateDocumentRestoreExecutor.ts` | 执行 restore plan 的注入式写入边界：只接受显式 target storage adapter，只应用 plan 中的 `setItem` / `removeItem` descriptor，并在写入前校验 descriptor 指向当前 owner key。 |
| `src/game/services/SaveWorldStateDocumentTransfer.ts` | 组合快照、文档、restore plan 与 executor 的 save document transfer 服务：从显式 source storage export document，再向显式 target storage restore；不读取 target、不把 restore 写回 source、不访问 ambient `globalThis.localStorage`。 |
| `src/game/services/SaveWorldStateDocumentTransferVerification.ts` | 注入式 save document transfer 的显式 verification/readback seam：在 restore 后用同一套 snapshot/document 代码从显式 target storage 重新导出 document，并返回 expected/actual document 差异；只使用调用方提供的 target adapter 做读回，不引入统一 save key、真实 migration 或 UI wiring。 |
| `src/game/services/SaveWorldStateDocumentMigration.ts` | 当前 v1 save document 的纯 migration pipeline/result seam：校验 schema/content metadata，返回 cloned document 和零 document migration report，并作为兼容 `migrateSaveWorldStateDocument` API 的委托目标。 |
| `src/game/services/SaveWorldStateDocumentCodec.ts` | 纯 JSON text codec boundary：把已验证的当前 `SaveWorldStateDocument` 导出成稳定 pretty JSON 文本，并把 JSON 文本解析后交给 migration pipeline，返回当前 schema document 与 migration report；不读写 localStorage、不新增统一 save key 或 UI wiring。 |
| `src/game/content/contentCatalog.ts` | 内容清单 resolver / 验证层：保留 public API 与跨资源校验编排，读取调用方提供的 catalog / public-file source，复用 WorldMap、Hub、Story 与 Expedition 纯校验器；资源读取、领域 ID 校验、loaded index 和 catalog resource-id/publicPath 解析辅助集中在 `src/game/content/contentCatalogValidationIndex.ts`，因此 `contentCatalog.ts` 只编排 checked-in 内容路径、领域 ID、首层 Hub / Story / Expedition 引用、Hub `startStory.storyResourceId`、Story battle resource ids、Expedition battle/boss `payloadRef.encounterResourceId` 是否解析到对应 kind 且 `publicPath` 等于运行时文件别名；同时通过 `contentCatalogCanonicalConfig.ts` 对 canonical `config.realm-presets` / `config.combat-baseline` / `config.artifact-grade` 做 pre-runtime shape / value consistency 校验（catalog kind/publicPath、顶层数组、展示字段、numeric value 唯一性、非负有限数值、攻血/加成 min-max、artifact star 范围、combat value 必须存在于 realm-presets），并校验 unit `realmId` / artifact `gradeId` 只引用 canonical registry；运行时目前迁移 `WorldMapScene` 入口资源、Hub 资源、Story 图资源、Story-sourced Battle 遭遇 / 卡组资源、Battle 直启 / 默认遭遇与 starter deck，以及 `ExpeditionScene` 的 world-state seed / starter deck / map / events / shop 目标资源：前三者分别通过 `worldmap.qingyun-region`、默认 / payload `hubResourceId`、`storyResourceId`（或兼容 `storyGraphFile` publicPath 反查）解析并加载 JSON，Story 战斗通过 `encounterResourceId` / `deckResourceId` 解析加载遭遇与卡组 JSON，Battle 直启 / 默认启动通过 `test_encounter_02` / `deck.starter` 解析加载 `data/encounters/medium-enemy.json` / `data/decks/starter-deck.json`，Battle 共享运行时资源通过 `cards.*` / `gongfa.list` / `status.definitions` 解析卡牌、功法和状态 JSON，并在 catalog 含 `config.combat-baseline` / `config.artifact-grade` 时把对应 JSON 注入 `RealmHelper` / `ArtifactHelper` 的运行时缓存；缺少这两个 config 运行时资源时 helper 保持 checked-in static import fallback，若存在但 kind 或 `publicPath` 不匹配则快速报错。ExpeditionScene 通过默认 / payload `worldStateResourceId`、`starterDeckResourceId`、`mapResourceId`、`eventsResourceId`、`shopResourceId` 解析加载 JSON；所有对应 `*File` 字段仍作为兼容别名和 cache-key 语义来源并必须与 catalog `publicPath` 对齐；direct/default Battle 继续使用 `currentEncounter` / `starterDeck` cache key，Expedition-sourced Battle encounter 仍按 payload `encounterFile` 路径加载。 |
| `src/game/content/contentIdRegistry.ts` | catalog-backed 内容 ID registry 与静态引用校验编排：登记卡牌、卡组、功法和世界物品 ID，并在运行前检查 deck/card/encounter/reward/gongfa 等跨资源引用；canonical status.definitions、canonical config / realm / grade，以及 canonical world seed / world-item / starter-stash 校验分别委托给专用模块。 |
| `src/game/content/contentCatalogWorldSeed.ts` | canonical world seed / world-item / starter-stash 专用校验模块：集中维护 `world.seed.initial-state` 与 `world.seed.items-artifacts` 的固定 kind/publicPath、world-item collection ID 注册和重复/缺失检查、starter stash `stashId` / `deckRef` / item id / `itemType` / `count` / `spiritStones` 引用与数值形状，以及 starter stash item 必须来自 canonical world-item registry 的约束。 |
| `src/game/content/contentCatalogCanonicalConfig.ts` | canonical `config.realm-presets` / `config.combat-baseline` / `config.artifact-grade` 专用校验模块：集中维护固定 catalog resourceId/publicPath、realm/grade ID 注册、numeric value 唯一性、display/numeric/min-max/star 形状校验、combat value 对 realm presets 的一致性，以及 unit `realmId` / artifact `gradeId` 对 canonical registry 的引用检查。 |
| `src/game/content/contentCatalogStatusDefinitions.ts` | canonical `status.definitions` 专用校验模块：集中维护 `public/data/config/status-definitions.json` 的 category/timing/effect/stack-consume 词汇、必填字符串/数值/布尔形状、重复 status id 注册，以及卡牌旧版 `applyStatus.statusId` 与功法 `ApplyStatus.statusId` 对 canonical 状态 ID 的引用检查。 |
| `src/game/scenes/battle/BattleScene.ts` | 核心战场场景：加载数据、初始化 Manager、创建 UI、驱动回合逻辑与功法触发。 |
| `src/game/managers/battle/*.ts` / `src/game/managers/common/*.ts` | 各子系统管理器：`CardManager`、`UnitEffectManager`、`UsageManager`、`SkillManager`、`PillManager` 等。 |
| `src/game/ui/battle/*.ts` / `src/game/ui/common/*.ts` | UI 组件（战斗日志、卡牌预览、丹药槽、技能栏等），通过布局配置定位。 |
| `src/game/objects/*.ts` | Phaser 精灵与交互（单位卡、法器、符箓等）。 |
| `public/data` | JSON 内容库（卡牌、功法、卡组、遭遇等），配合 `public/data/types` 中的 TypeScript 类型使用。 |
| `public/data/docs/*.md` | 内容规则、卡牌生成、剧情作者、秘境与世界观文档。 |
| `.planning/*.md` / `.planning/phases/**/*.md` | 产品目标、需求、路线图与 Phase 01 执行计划。 |

---

## 运行时架构

### React 外壳
`src/main.tsx` → `App.tsx` / `GameApp.tsx` → `PhaserGame.tsx`。React 仅提供挂载容器及潜在的调试/外部 UI，核心游戏逻辑都在 Phaser。

### Phaser 游戏实例
`src/game/main.ts` 配置 Phaser（画布尺寸、渲染、场景）。标准启动链路为 `Boot -> Preloader -> MainMenu -> WorldMapScene -> HubScene | ExpeditionScene`：`Boot` 只加载预加载器所需的最小背景资源，`Preloader` 加载 `data/content-catalog.json` 与菜单资源后进入 `MainMenu`。玩家在 `MainMenu` 点击“进入大地图”后进入 `WorldMapScene`；`WorldMapScene` 从已缓存的 runtime catalog 解析稳定资源 ID `worldmap.qingyun-region`，再加载其 `publicPath`（当前为 `public/data/world/world-map.json`），目前提供“青云镇”“青云宗山门”两个完整 Hub 目的地、“集市茶棚”Hub location 目的地与“青云外山试炼”“青玉洞试炼”两个 Expedition 目的地，并用每个目的地的 `presentation.position` / `icon` / `regionLabel` 渲染可拖拽平移的大地图点击标记，再按 `kind` 解析为 `HubScene` 或 `ExpeditionScene` 启动 intent；Hub 目的地可用 `targetLocationId` 直接落到同一 Hub 文件中的指定地点，目的地 payload 同时携带目标身份与目标数据文件，使 world-map JSON 成为 route target 与大地图空间布局的顶层 owner。`HubScene` 与 `ExpeditionScene` 都提供“返回大地图”的最小 route 回路：返回时只启动 `WorldMapScene` 并传递状态文案，不清理 Hub session 或 Expedition active run，因此玩家重新进入 route 时仍由既有持久化逻辑恢复位置 / run（显式 Hub location 目的地会覆盖保存位置并把该地点写回 session；Expedition active run 按规范化的 `expeditionId + mapId` 生成 `expedition:<expeditionId>:<mapId>` route key 分区存取，直接启动或缺少 world-map payload 时回退到 `phase01-first-playable-expedition / phase01-prototype-map`）。`HubScene` 默认通过 catalog 解析 `hub.qingyun-town` 到 `public/data/hub/town-shell.json`，从大地图启动时通过 payload 中的 `hubResourceId` 解析 Hub 文件，并要求兼容字段 `hubFile` 与 catalog `publicPath` 一致；它用 Hub JSON 顶层 `presentation.mapWidth` / `mapHeight` / `initialCenter` 创建可拖拽子地图，并把每个 `locations[].presentation.position` 转成地点标记。玩家点击标记会通过同一个 Story/Hub session 边界保存 `currentLocationId`，随后显示该地点现有行动面板；`navigate.targetLocationId` 行动仍可在 Hub 小地点间切换并保存当前位置，`startStory.storyResourceId` 会随 Hub-to-Story payload 传递但不改变 `hubId + actionId + startStory.storyGraphFile` 的恢复身份。青云镇的主线入口解析 `story.qingyun-entry` / `public/data/story/story-graph.json`，茶棚支线解析 `story.qingyun-teahouse-rumors` / `public/data/story/qingyun-teahouse-rumors.json`，青云宗山门则用自己的 Hub 文件和 action 指向 `story.qingyun-entry` / 同一主线图但独立保存进度；青玉洞试炼使用 `phase01-jade-cave-expedition / phase01-jade-cave-map`、`mapResourceId: phase01-jade-cave-map` 和 `data/mijing/jade-cave-map.json`，复用原型事件/商店/遭遇资源来证明第二个秘境 route 不共享青云外山试炼的 active run；直接启动 ExpeditionScene 时默认 target config 使用 `world.seed.initial-state`、`deck.starter`、`phase01-prototype-map`、`phase01-prototype-events`、`phase01-prototype-shop` 解析并加载对应 checked-in JSON，同时保留原 `*File` 字段和 cache key。`BattleScene` 会被 StoryScene 的 `battleLaunch` 往返复用，也会被 ExpeditionScene 的秘境战斗节点复用。

### WorldMapScene 生命周期
1. `preload`：读取 `Preloader` 已放入 JSON cache 的 `data/content-catalog.json`，用 `createContentCatalogResolver` 解析 `worldmap.qingyun-region`，并通过解析得到的 `publicPath` 载入 world-map JSON；若 catalog 缺失 / malformed、资源 ID 不存在、kind 不是 `worldMap`、或解析路径未能进入 JSON cache，会抛出包含 scene、resourceId 和路径的 actionable 错误。
2. `create`：用 `worldMap.ts` 校验大地图定义；重复目的地 id、缺失默认目的地、不支持的 `kind`、缺失 top-level `presentation` 或目的地空间标记数据都会在进入场景前失败，避免静默错误路由或不可点击标记。
3. `renderShell`：根据 `presentation.mapWidth` / `mapHeight` / `initialCenter` 创建大于视窗的地图 surface，并把每个目的地的 normalized `presentation.position` 转成 surface 坐标；玩家可在地图视窗内拖拽平移，surface 会被 clamp 到视窗边界内。
4. 玩家点击任一 `hub` 标记：`WorldMapScene` 创建 `sceneKey: "HubScene"` 的启动 intent，并把该目的地声明的 `destinationId` / `hubId` / `hubResourceId` / `hubFile` / 可选 `targetLocationId` 传给 Hub；青云镇与青云宗山门因此使用不同 Hub JSON 和本地 session 身份，集市茶棚则直接进入青云镇 Hub 中的茶棚地点。
5. 玩家点击 `expedition` 标记：`WorldMapScene` 创建 `sceneKey: "ExpeditionScene"` 的启动 intent，并把目的地声明的 `destinationId`、`expeditionId`、`mapId`、world-state / starter-deck / map / event / shop 资源 ID 与文件别名传给 Expedition；秘境准备、地图遍历、战斗往返和结算循环保持不变，战斗往返会保留这份 target config 与由 `expeditionId + mapId` 规范化生成的 route key。当前 checked-in Expedition 入口包括默认青云外山试炼（`phase01-first-playable-expedition / phase01-prototype-map`）和青玉洞试炼（`phase01-jade-cave-expedition / phase01-jade-cave-map`）；active run 的 load / save / clear 只作用于当前 `expeditionId + mapId`，避免多个世界地图 Expedition 入口互相覆盖或误恢复；`STASH_STORAGE_KEY` 仍是全局永久仓库，按 route 拆分 stash 属于后续经济 / ownership 设计，当前不在范围内。
6. Hub 或 Expedition 点击“返回大地图”：route 场景通过 `createWorldMapReturnIntent` 回到 `WorldMapScene`，只显示返回状态文案，不拥有或清除 Hub / Expedition 的恢复状态。

### HubScene 生命周期
1. `init` / `preload`：规范化启动 payload；若是直接启动则回退到 `hub.qingyun-town` / `data/hub/town-shell.json`，若来自大地图则解析 payload 指定的 `hubResourceId`。`HubScene` 从 `Preloader` 已缓存的 catalog 中要求该资源 kind 为 `hub`，catalog `publicPath` 必须等于兼容字段 `hubFile`，随后按 catalog `publicPath` 载入 Hub JSON（例如 `data/hub/qingyun-sect-gate.json`）。
2. `create`：校验 Hub / 城镇定义，并要求文件内 `hubId` 与启动 payload 的 `hubId` 一致；若世界地图 payload 带有 `targetLocationId`，优先进入该地点；否则从 `StoryHubSessionPersistence` 读取该 `hubId` 的已保存位置，若地点仍存在就恢复，否则回退到 `defaultLocationId`，随后渲染可拖拽地点子地图、当前地点说明和行动按钮，并发出 `EventBus.emit('current-scene-ready', this)`。
3. `renderShell`：根据 Hub 顶层 `presentation.mapWidth` / `mapHeight` / `initialCenter` 创建子地图 surface；每个 `locations[].presentation.position` 必须是 `0..1` normalized 坐标，并配有轻量 `icon` 和 `regionLabel`。青云镇的山门集市、集市茶棚会显示为空间标记；青云宗山门只有一个地点，也会安全显示为单标记 Hub。
4. 玩家点击 Hub 地点标记：`HubScene` 将该地点设为 `currentLocationId`，通过 `saveHubSessionSnapshot` 写回当前 `hubId` 的 Story/Hub session，然后重新渲染该地点既有行动面板；拖拽距离超过点击阈值时只平移地图，不切换地点。
5. 玩家点击 `navigate` 行动：`HubScene` 根据该行动的 `targetLocationId` 切换当前地点、写入该 `hubId` 下的本地 session 并重新渲染；目标地点必须存在于同一个 Hub JSON 中，场景代码不硬编码目标 id。
6. 玩家点击 `startStory` 行动：`HubScene` 根据 `hubId + actionId + storyGraphFile` 查找已保存的 Story runtime snapshot；存在时将 `StoryState` 与 `selectedChoiceIds` 放入 launch payload 恢复进度，否则按该行动的 `storyGraphFile` 启动新故事。launch payload 会携带可选 `storyResourceId` 作为 catalog/tooling 身份；StoryScene 用它解析 catalog `publicPath` 并加载 JSON，但 cache key 与 session key 仍使用 `storyGraphFile`，且 session key 不加入 `storyResourceId`。当前切片仍不包含商店、背包、奖励或秘境出口操作。
7. 玩家点击“返回大地图”：`HubScene` 先保存当前 Hub location，再回到 `WorldMapScene`；重新从大地图进入通用 Hub 目的地时继续使用 `StoryHubSessionPersistence` 恢复地点，进入带 `targetLocationId` 的 Hub location 目的地时则显式跳到该地点。

### StoryScene 生命周期
1. `preload`：从已缓存的 catalog 解析启动 payload 的 `storyResourceId`（未指定且为默认入口时使用 `story.qingyun-entry`；旧直启自定义 `storyGraphFile` 时按 catalog `publicPath` 反查），要求 catalog `publicPath` 等于启动 payload 的 `storyGraphFile`，并用稳定的 `storyGraph:${storyGraphFile}` cache key 加载该 JSON；未指定时默认使用 `data/story/story-graph.json`。
2. `create`：校验示例故事图；若 launch payload 携带保存的 `storyState`，则恢复该快照，否则进入 `entryNodeId`。来自 Hub 的启动会立即保存当前 Story runtime snapshot，并发出 `EventBus.emit('current-scene-ready', this)`。
3. 玩家点击选项：`storyFlowViewModel` 使用当前 `StoryState` 检查 `StoryCondition`，阻止不可见 / 不可选或缺失目标的选项；通过 `StoryEffect` 应用选择效果、目标节点跳转和目标节点 `onEnter` 效果。普通剧情推进后会按 `hubId + actionId + storyGraphFile` 保存 `StoryState` 与 `selectedChoiceIds`。若转移产出 `battleLaunch`，`StoryScene` 会以 source-aware story payload 启动 `BattleScene`，并在战斗胜负后按 `onVictoryNodeId` / `onDefeatNodeId` 回到剧情节点，再保存战斗结果后的快照；否则继续渲染当前剧情。如果抵达无可见选项的节点，场景显示终点提示和“重新开始故事”按钮，该按钮会把当前 Hub action 的故事进度重置到入口。`storyFlow` 在加载时只负责拒绝缺失节点、坏跳转等不可游玩的示例图。

### Story / Hub session persistence

`src/game/services/StoryHubSessionPersistence.ts` 是当前唯一允许直接读写 Story / Hub 本地 session 的边界。它使用版本化 key `cardgame.story-hub-session.v1`，存储两类快照：

- `hubs[hubId]`：当前 Hub location id、可选 status text 和更新时间。恢复时如果 location 已从当前 Hub JSON 删除，会安全回退到 `defaultLocationId`。
- `stories[hubId + actionId + storyGraphFile]`：由 Hub action 启动的 `StoryState`、`selectedChoiceIds`、可选 status text 和更新时间。该 key 会随 StoryScene → BattleScene → StoryScene 往返传递，确保战斗结果也写回同一个故事会话。

这只是本地单机 session 边界，不是云存档、完整 world-state ownership、背包 / 商店 / 奖励系统，也不复用 Expedition `RunSnapshot`。

### Local save compatibility registry and snapshot facade

`src/game/services/SaveCompatibility.ts` 是一个不拥有读写流程的兼容性登记表。它引用现有 persistence 常量，不新增 writer，也不改变 persisted JSON shape 或玩家可见的保存 / 恢复行为。

- Story / Hub session 仍由 `StoryHubSessionPersistence` 拥有，使用 `cardgame.story-hub-session.v1`，document `schemaVersion` 为 `1`。
- 永久仓库仍由 `RunPersistence` 拥有，使用 `cardgame.persistent-stash.v1`；storage key 带 `v1`，但 `PersistentStash` JSON 当前不内嵌 schema version。`RunPersistence` 的 stash 读写保留默认 localStorage / memory fallback，同时允许调用方注入 `Storage`-like adapter；`ExpeditionState.bootstrap` 的当前 bootstrap stash 持久化会经由 `GameWorldStatePersistentStashWrite` 计划 / 写回同一个 compatibility key，`RunResolution` 的终局 stash 写入仍沿用该 adapter，便于测试当前写入边界，但不引入统一 world-save writer。
- Active run 仍由 `RunPersistence` 拥有，canonical storage key 为 `cardgame.active-run.v1:expedition:<expeditionId>:<mapId>`；route identity 继续按运行时 persistence 的 `expeditionId + mapId` 规则 trim / fallback 到默认秘境身份。
- 兼容性登记保留 legacy active-run inventory：未分区旧 key `cardgame.active-run.v1`，以及旧 route-key 形式 `cardgame.active-run.v1:<raw routeKey>`，供现有 migration lookup / cleanup 语义对照。
- Migration hooks 目前是显式 no-op placeholders；只有未来任务明确改变持久化 schema 时才会加入真实迁移。
- `src/game/services/SaveWorldStateSnapshot.ts` 在上述登记表之上提供一个只读组合视图：读取 Story/Hub session document 快照、全局 persistent stash、指定 `activeRunLookup` / `activeRunIdentity` 的 route-keyed active run，以及 `RunResolution` 当前支持的终局 outcome 标签。读取后的 document 会经过对应 owner 的 `applySaveCompatibilityMigrations` hook chain（当前为 no-op，且不会把迁移结果写回 storage）。它只调用现有读取边界，因此会保留 Story/Hub corrupt / stale fallback、RunPersistence corrupt / stale active-run cleanup、legacy active-run lookup 兼容等既有语义；它不是 unified save writer，也不新增 storage key、schema migration、多档案或云同步。
- `src/game/state/GameWorldState.ts` 是快照之上的当前世界 typed read view：`createGameWorldState` 接收同一套显式 storage / active-run lookup 参数，并额外接收 checked-in world-state seed 与 starter deck seed；当 persistent stash 已存储时标记 `source: "stored-stash"`，缺失时用 `createPersistentStashFromWorldStateSeed` 生成只读 `source: "seed-fallback"` 视图但不保存它。返回的 Story/Hub、stash、active run keys/document 与 RunResolution metadata 都是深拷贝的 readonly 类型，用于后续 ownership 迁移前的读取聚合；它本身不保存 document、不改变 save document shape、storage keys、scene wiring 或经济结算语义。
- `src/game/state/GameWorldStatePersistentStashWrite.ts` 是 `GameWorldState` 之上的窄写入 seam：显式写入 API 要求调用方提供 `Storage`-like adapter，它会校验当前 persistent-stash compatibility 仍指向 `cardgame.persistent-stash.v1`，先为 stored-stash 或 seed-fallback document 生成深拷贝 write plan，再在 apply 步骤交给 `savePersistentStash` 写回同一个 key。`ExpeditionState.bootstrap` 使用同一 seam 物化当前 bootstrap stash，并保留既有默认 localStorage / memory fallback；该层只写永久仓库，不持久化 Story/Hub session、route-keyed active run、场景 UI、结算经济或 content 数据。
- `src/game/state/GameWorldStateWrite.ts` 是 Story/Hub、persistent-stash、active-run 三个已接受 slice writers 之上的聚合 plan/apply 门面：所有写入 API 都要求显式 storage adapter，不读取 ambient `globalThis.localStorage`；plan/result 固定记录并校验 `storyHubSession -> persistentStash -> activeRun` 顺序，克隆 compatibility 与 RunResolution metadata，直接 document 写入时可用 `null` persistent stash 表示删除当前 `cardgame.persistent-stash.v1`，也可针对指定 route active-run 写入或清理当前 canonical key 与兼容 legacy key。该层只面向现有 storage keys / JSON shapes，刻意不修改 scene，也不接入 `SaveWorldStateDocument` restore/transfer。
- `src/game/services/SaveWorldStateDocument.ts` 是快照之上的纯内存文档边界：调用方必须先通过 `createSaveWorldStateSnapshot` 取得只读 owner 视图，再用 `createSaveWorldStateDocument(snapshot)` 生成 `schemaVersion: 1`、`contentType: application/vnd.cardgame.save-world-state-document+json` 的 `SaveWorldStateDocument`。该文档保留 Story/Hub session、persistent stash、route-keyed active run keys / document、RunResolution outcome metadata，并把 compatibility entries 中的 migration hooks 降级成只含 description 的可序列化 metadata，避免把函数写入未来存档 JSON。`parseSaveWorldStateDocument` / `validateSaveWorldStateDocument` 只接受当前 schema 与当前 owner metadata；`cloneSaveWorldStateDocument` 和 `migrateSaveWorldStateDocument` 都返回深拷贝，当前 document migration boundary 明确为 no-op。该层不访问 localStorage，不新增 key，不改变 Story/Hub session、Expedition active-run、stash、corrupt/stale fallback 或 legacy active-run cleanup 语义。
- `src/game/services/SaveWorldStateDocumentRestorePlan.ts` 和 `SaveWorldStateDocumentRestoreExecutor.ts` 把恢复拆成“验证 document → 生成 descriptor → 注入式执行”。Restore plan 只指向当前 owner 的既有 storage key：Story/Hub 永远 `setItem` 当前 document，persistent stash 与 route-keyed active run 在 document slice 为 `null` 时生成 `removeItem`，legacy unscoped active-run key 只保留为显式 `no-op`，不会被写入或删除。Executor 在触碰 target storage 前校验 plan metadata、owner、route key 与 storage key，执行时只调用注入 target storage 的 `setItem` / `removeItem`。
- `src/game/services/SaveWorldStateDocumentTransfer.ts` 是当前的注入式 save document transfer 边界：`exportSaveWorldStateDocumentFromStorage` 从显式 `sourceStorage` 读取并构造 document，`restoreSaveWorldStateDocumentToStorage` 把调用方提供的 document 恢复到显式 `targetStorage`，`transferSaveWorldStateDocument` 组合两者做一次 source→target copy。source 读取仍沿用 snapshot 的坏 JSON 清理 / legacy active-run 兼容语义；target 阶段不读取 target，也不会把 restore 写回 source；测试用抛错的 ambient `globalThis.localStorage` 证明注入式 transfer 不依赖浏览器全局存储。该服务仍不是统一 save key、真实 migration、恢复 UI、scene wiring、profile/cloud save 或经济重构。
- `src/game/services/SaveWorldStateDocumentTransferVerification.ts` 为 transfer / restore 增加显式 readback seam：`restoreAndVerifySaveWorldStateDocumentToStorage` 先复用现有 document validator 与 restore plan/executor 写入显式 target，再用 `verifySaveWorldStateDocumentTransferReadback` 按 expected document 的 active-run identity 从同一个 target adapter 重新导出 document。verification 返回 `verified/status`、expected / actual document 和按 JSON path 标记的 `changed` / `missing` / `unexpected` 差异；它要求 target adapter 显式提供 `getItem/setItem/removeItem`，不会访问 ambient `globalThis.localStorage`。读回阶段刻意复用 snapshot/document 代码，因此仍保留现有 corrupt cleanup / legacy active-run lookup 语义；这不是统一 save key、真实 migration、恢复 UI、scene wiring、profile/cloud save 或经济/仓库语义变化。
- `src/game/services/SaveWorldStateDocumentMigration.ts` 是当前 `SaveWorldStateDocument` 的纯 document migration pipeline：v1→v1 身份迁移先校验 schema/content metadata，再通过现有 validator 返回深拷贝 document，并报告 `appliedDocumentMigrationCount: 0` / `appliedDocumentMigrations: []` 与 owner hook counts；`migrateSaveWorldStateDocument` 保留旧 API，只委托该 pipeline 后返回 document。该层不访问 localStorage，不新增 key，不改变 restore / transfer / verification adapters 或 route/session 语义。
- `src/game/services/SaveWorldStateDocumentCodec.ts` 是纯 JSON text codec：`serializeSaveWorldStateDocumentJsonText` 先复用当前 document validator，再输出带结尾换行的 2-space pretty JSON；`parseSaveWorldStateDocumentJsonText` 只负责 JSON 语法解析，然后把未知值交给 `migrateSaveWorldStateDocumentToCurrentSchema`，让 unsupported schema/content metadata 与 current-schema validation 继续由 migration/validator 边界裁决，并把 migration report 原样返回给调用方。该 codec 不接触 ambient `globalThis.localStorage`，也不新增统一 save key、浏览器文件选择器、localStorage 写入、profile/cloud save、restore UI 或 scene save/load 触发。

### BattleScene 生命周期
1. `preload`：载入图片 / JSON（卡牌、功法等）。
2. `create`：创建布局、初始化各 Manager、注册事件、发出 `EventBus.emit('current-scene-ready', this)`。
3. `update`：驱动动画 / 状态（目前大多逻辑在 Manager 内处理）。

### 子系统 Manager
- **CardManager**：抽牌、摆放、hover/拖拽回调。整合 `BattleLayoutConfig` 区域，实现居中固定间距算法。
- **UnitEffectManager**：解析 `gongfa-list.json`，根据事件（如 `TurnEnd`）触发功法动作；条件判断委托给纯 helper `gongfaConditionEvaluation`（覆盖 `ArtifactUsedThisTurn`、`UnitOnField`、`CardInHand`、`ArtifactEquipped`、武器标签 fallback 与 `maxStar` 表达式），动作执行通过 `gongfaOperationDispatch` 的 typed registry 分派：`RecoverCardFromDiscard` / `SearchCardFromDeck` / `DrawAndFilter` 由 `gongfaCardOperations` 统一适配运行时副作用，`GainArmor` 由 `gongfaArmorOperations` 适配当前护甲日志与状态副作用，`ImmediateAttack` 由 `gongfaAttackOperations` 适配现有攻击运行时。`card.star` / `artifact.star` 表达式上下文统一由纯 helper `gongfaExpressionContext` 从 trigger unit / equipped artifact stat 数据构建，卡牌筛选与数值表达式仍复用纯 helper `gongfaCardFilter` / `gongfaExpression`，尚未实现的动作只保留 warning + unexecuted 语义。
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
| `public/data/content-catalog.json` | 版本化内容清单：列出当前 WorldMap、Hub、Story、Expedition、卡组、遭遇、卡牌、状态、功法、配置和世界种子 JSON；测试用它做纯验证，运行时由 `Preloader` 先加载，并由 `WorldMapScene` / `HubScene` / `StoryScene` / `ExpeditionScene` / `BattleScene` 等 runtime scene 用稳定资源 ID 解析入口与目标资源路径；Battle 直启 / 默认启动的默认遭遇和 starter deck 也从这里解析。 |
| `public/data/world/world-map.json` | 第一张薄大地图：声明青云镇 Hub、青云宗山门 Hub、集市茶棚 Hub location、青云外山试炼 Expedition 与青玉洞试炼 Expedition 目的地，并持有各目的地的 target identity / content files / spatial presentation metadata，由 `WorldMapScene` 渲染为可拖拽地图标记并路由。 |
| `public/data/mijing/jade-cave-map.json` | 第二个 checked-in Expedition map：使用独立 `phase01-jade-cave-map` mapId 与青玉洞文案，复用原型事件、商店和遭遇文件来验证多秘境 active-run 隔离；battle/boss `payloadRef` 同时保留旧有 `ref` / `encounterFile` 并声明 catalog `encounterResourceId`。 |
| `public/data/hub/town-shell.json` | 最小青云镇 Hub 壳层：顶层子地图尺寸 / 初始中心、山门集市与茶棚地点标记、`navigate.targetLocationId` 前后导航行动，以及多个 `startStory.storyResourceId` + `storyGraphFile` 剧情入口。 |
| `public/data/hub/qingyun-sect-gate.json` | 第二个 checked-in Hub 目的地：青云宗山门单地点子地图入口，使用独立 `hubId` / actionId 指向既有主线故事图，验证多 Hub 目的地不共享 session 身份且 one-location Hub 可安全渲染。 |
| `public/data/story/story-graph.json` | StoryState 可执行剧情图：节点、初始状态、`visibleWhen` / `enabledWhen` 条件与 `effects` / `onEnter` 效果，由 `storyFlow` 转换为 UI 和状态迁移。 |
| `public/data/story/qingyun-teahouse-rumors.json` | 极短茶棚支线图：由茶棚 Hub action 启动，用来验证多故事图和 per-action Story/Hub session resume 隔离。 |
| `public/data/story/story-graph.compact.example.json` | 剧情作者可复制的最小 StoryState schema 示例，由 storyFlow 测试校验，避免 authoring 模板漂移。 |
| `public/data/types/*.ts` | 对应的 TypeScript 类型定义，供运行时和 IDE 补全。 |

内容迭代流程：修改 JSON → 更新 `public/data/content-catalog.json`（新增 / 移除内容文件时，尤其是顶层 `worldMap` 或 Hub 资源路径）→ `bun test src/game/content/contentCatalog.test.ts` 做清单与首层引用验证 → `npm run dev` 热重载 → 通过 MainMenu → WorldMap、Hub 入口、剧情视图、战斗日志或调试功能验证。新增或调整 Story `startBattle` 时，`encounterResourceId` / `deckResourceId` 必须指向 catalog 中的 `encounter` / `deck` 资源，且 `encounterFile` / `deckFile` 必须继续与 catalog `publicPath` 对齐以保留兼容别名。新增或调整 WorldMap Expedition 目的地时，`worldStateResourceId` / `starterDeckResourceId` / `mapResourceId` / `eventsResourceId` / `shopResourceId` 必须分别指向 `worldSeed` / `deck` / `expeditionMap` / `expeditionEvents` / `expeditionShop` catalog 资源，且对应 `*File` 兼容别名必须与 catalog `publicPath` 对齐；直接启动默认 ExpeditionScene 使用 `DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS`。新增或调整 Expedition battle/boss 节点时，`payloadRef.encounterResourceId` 必须指向 kind 为 `encounter` 的 catalog 资源，`payloadRef.encounterFile` 仍是 Expedition 战斗启动的运行时加载路径，`payloadRef.ref` 仍是遭遇内容 id。新增或调整初始世界 `stash.items` 时，item id 必须先登记在 canonical `world.seed.items-artifacts` 的对应集合中，`itemType` 要与集合类型一致，`count` 必须为正整数，`spiritStones` 必须为非负整数；`stash.deckRef` 可保留 checked-in `starter-deck` 文件别名，但必须能通过 catalog deck 资源解析。新增或调整卡牌旧版 `effects[].actions[]` 的 `applyStatus.statusId` 时，`statusId` 必须使用 `public/data/config/status-definitions.json` 中 `statuses[].id` 声明的规范状态 ID；`status-definitions.json` 是状态词汇的 catalog-backed canonical registry，不再保留 `shield` 这类旧称别名（护甲使用 `armor`）。

---

## 剧情流视图模型

`src/game/scenes/story/storyFlowViewModel.ts` 是剧情 UI 的纯函数层，也是当前故事视图模型和运行时转移的唯一拥有者：输入 StoryState-backed 剧情图与运行时 `StoryState`，输出当前节点文案、可见 / 可选选项、推荐状态、选择跳转结果、应用后的新 `StoryState` 和内容配置警告。它读取结构化 `StoryCondition` / `StoryEffect`，支持条件失败原因、属性门槛禁用、前置对话 / flag 解锁、选择效果、目标节点 `onEnter` 效果，以及 `startBattle` 效果产生的 `battleLaunch` 元数据。如果选项指向尚未配置的目标节点，视图模型会保留该选项但标记为不可选择，并提供中文警告，避免 StoryScene 因内容缺口崩溃。`src/game/scenes/story/storyFlow.ts` 保留为加载 Hub action 指向的 StoryState 图时的严格校验层，确保 checked-in 示例图本身可游玩，并校验 story battle trigger 的胜利 / 失败续接节点存在。Story-owned `startBattle` 现在同时声明 `encounterResourceId` / `deckResourceId`（供 `contentCatalog` 做纯校验并供 `BattleScene` 运行时解析）和 `encounterFile` / `deckFile`（保留为兼容别名与稳定 cache-key 语义的一部分，且必须与 catalog `publicPath` 对齐）。`src/game/scenes/story/storyBattleRoundTrip.ts` 负责把 pure `battleLaunch` 包装成 BattleScene source-aware payload，并把 story battle result 路由回胜利 / 失败节点。主线示例图包含心性属性门槛、前置对话 / flag 解锁、山门广场、试炼石阶、队伍边缘、试炼钟台等小地点切换，并在试炼钟鸣后走一轮 StoryScene → BattleScene → StoryScene 的最小战斗往返；茶棚支线示例证明同一 Hub 下第二份 StoryState 图可以独立启动和恢复；青云宗山门 Hub 则证明不同 `hubId` 即使指向同一主线图，也会用 `hubId + actionId + storyGraphFile` 独立分区 session。

---

## 功法与 Usage 流程

1. **记录使用**：当装备剑类法器成功时，`BattleScene.recordArtifactUsage` 调用 `usageManager.recordUsage('artifactWeapon','剑')`。
2. **回合结束**：`BattleScene.endTurn()` → `applyPlayerTurnEndEffects()`，构造 `GongfaRuntimeContext`（包含 `artifactUsage`）。
3. **条件判断**：`UnitEffectManager` 委托 `gongfaConditionEvaluation.areGongfaConditionsSatisfied` 检查 `ArtifactUsedThisTurn`、场上单位、手牌和已装备法器条件；`ArtifactEquipped.maxStar` 继续支持数字或 `gongfaExpression` 表达式，表达式上下文委托 `gongfaExpressionContext` 生成，缺少 trigger unit 时仍由条件调用方沿用 warning + 0 fallback。
4. **执行动作**：如 `RecoverCardFromDiscard`，`UnitEffectManager` 先组装 trigger unit、共享表达式上下文、战斗日志、战斗状态、攻击和卡牌流转上下文，再交给 `gongfaOperationDispatch`。dispatch registry 将已实现动作委托给对应 adapter：`gongfaCardOperations` 用 `gongfaCardFilter` 匹配 `CardFilter`（含 `maxStar` 表达式）后从弃牌堆 / 卡组移动目标卡牌，`gongfaArmorOperations` 应用现有 `armor` 状态与日志副作用，`gongfaAttackOperations` 复用当前 `CombatManager.performSingleAttack`。`artifact.star` 在无 equipped artifact 时由共享上下文固定为 0；`DrawCards` / `ModifyStats` / `DealDamage` / `ApplyStatus` / `AddLog` / `Custom` 仍按现有未实现路径 warning 并返回 unexecuted。
5. **重置**：本回合功法结算后 `usageManager.resetCategory('artifactWeapon')`，确保下回合重新记录。

扩展：任意系统都可以通过 UsageManager 追踪（例如技能次数、符箓消耗），并在功法条件中新增对应类型。

---

## 自定义布局指南

1. 打开 `src/game/config/LayoutConfig.ts`。
2. 修改或新增 `BattleLayoutConfig` 字段（例如新面板 `artifactLog`）。
3. 更新 `createDefaultLayout(width,height)` 中对应区域，考虑比例/间距。
4. 在 `src/game/managers/battle/ManagerFactory.ts` 或对应 UI manager 中注入新布局配置（现有 `BattleLog` 通过 `config.layout.battleLog` 构造）。
5. UI 组件内部只引用 `config.x/y/width/height`，避免再次硬编码。

> 建议保留一个“逻辑区域名称”与“Phaser 实际 Zone”一一对应的方式，方便 Manager 使用（如 CardManager 直接获取 `layout.handZone`）。

---

## Onboarding Checklist

1. **阅读 README、`.planning/PROJECT.md` 与 `.planning/REQUIREMENTS.md`**：了解产品目标、Phase 01 范围和长期约束；内容规则从 `public/data/docs/battle-rules.md`、`public/data/docs/秘境.md` 与 `public/data/docs/story-authoring-guide.md` 入手。
2. **运行 Dev 环境**：`npm run dev`，在浏览器中打开 `http://localhost:8080`，从主菜单进入大地图、Hub、秘境或战斗路径。
3. **熟悉数据**：浏览 `public/data/cards`、`public/data/gongfa/gongfa-list.json`、`public/data/world/world-map.json` 与 `public/data/story/*.json`，理解字段。
4. **理解回合流**：从 `src/game/scenes/battle/BattleScene.ts` 的 `endTurn()` / `getTurnContext()` 和 `src/game/managers/battle/TurnManager.ts` 的 `startPlayerTurn()` / `startEnemyTurn()` 入手，观察 Manager 协作方式。
5. **尝试修改一张卡牌**：调整攻击力或功法，确认热重载与日志输出。
6. **阅读关键 Manager**：`CardManager`, `UnitEffectManager`, `UsageManager`, `ArtifactManager`，掌握职责边界。
7. **扩展/修复**：根据需求在 Manager 内实现，必要时更新 `LayoutConfig` 和相应 UI。

---

## 调试与常用技巧

- **BattleLog**：`src/game/ui/battle/BattleLog.ts`，通过 `battleLog.addLog()`、`addGongfaLog()` 输出关键节点信息。
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

- `.planning/PROJECT.md`：产品定位、核心价值与当前约束。
- `.planning/REQUIREMENTS.md`：Phase 01 可检查需求与范围外项。
- `.planning/phases/01-first-playable-expedition/01-CONTEXT.md`：首个可玩秘境闭环的决策、上下文和 canonical refs。
- `public/data/docs/battle-rules.md`：战斗假设、卡牌类型与回合流程。
- `public/data/docs/CARD_GENERATION_GUIDE.md`：卡牌字段、数值与 AI 生成指南。
- `public/data/docs/CARD_DESIGN_RULES.md`：卡牌资源收益与强度约束。
- `public/data/docs/artifact-grade-guide.md`：法器品级、星级和属性基准。
- `public/data/docs/秘境.md`：秘境探索、搜打撤循环与节点语义。
- `public/data/docs/story-authoring-guide.md`：剧情作者指南，说明 StoryState 图的写作流程、字段速查、compact schema 示例和验证命令。
- `public/data/docs/story-content-contracts.md`：剧情内容合同，定义 Hub-launched StoryState 图（如 `story-graph.json` 与 `qingyun-teahouse-rumors.json`）的 StoryState / StoryCondition / StoryEffect JSON 操作。
- Phaser 官方资源： [API 文档](https://newdocs.phaser.io)、[示例仓库](https://labs.phaser.io)。

如需讨论或提交 Issue，欢迎附上：
1. 复现步骤
2. 相关数据（卡牌/功法 ID）
3. 截图或 BattleLog 片段

祝开发顺利，玩得开心！
