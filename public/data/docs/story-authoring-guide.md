# Story Authoring Guide

本指南面向剧情作者和内容实现者，说明如何新增或扩展 `StoryScene` 可游玩的 StoryState 剧情图。字段合同的完整定义见 `public/data/docs/story-content-contracts.md`；最小可校验示例见 `public/data/story/story-graph.compact.example.json`。

## 当前 source of truth

- **青云镇 Hub 入口文件**：`public/data/hub/town-shell.json`（`navigate.targetLocationId` 在城镇小地点间切换；`startStory.storyGraphFile` 指向要启动的剧情图）
- **青云宗山门 Hub 入口文件**：`public/data/hub/qingyun-sect-gate.json`（第二个大地图 Hub 目的地，使用独立 `hubId` / actionId 指向既有主线图）
- **World map 入口文件**：`public/data/world/world-map.json`（Hub 目的地可用可选 `targetLocationId` 直接落到某个已声明的 Hub 小地点，例如集市茶棚；也可指向不同 Hub 文件，例如青云宗山门）
- **可游玩主线文件**：`public/data/story/story-graph.json`
- **茶棚支线文件**：`public/data/story/qingyun-teahouse-rumors.json`（第二个 Hub-launched 图，用于证明多图与 per-action resume 隔离）
- **紧凑 schema 示例**：`public/data/story/story-graph.compact.example.json`
- **运行时状态类型**：`src/game/types/story.ts`
- **严格内容校验**：`src/game/scenes/story/storyFlow.ts`
- **渲染与跳转视图模型**：`src/game/scenes/story/storyFlowViewModel.ts`

扩展主线时优先编辑 `story-graph.json`；新增短支线或章节时可以像 `qingyun-teahouse-rumors.json` 一样新增独立 StoryState 图，并在对应 Hub 文件（例如 `public/data/hub/town-shell.json` 或 `public/data/hub/qingyun-sect-gate.json`）中添加唯一 `startStory` action 指向它。每个 Hub 的 `hubId`、action `id` 与 `storyGraphFile` 都是本地 Story/Hub session key 的一部分，改名会让旧进度不再匹配。如果需要在 Hub 小地点之间移动，新增或修改 `navigate.targetLocationId`；如果需要大地图直接进入某个 Hub 小地点，在 `public/data/world/world-map.json` 添加新的 Hub destination 并设置 `targetLocationId`。不要在 `HubScene` 或 `StoryScene` 里硬编码新路径或地点 id。不要把只存在于 prose 的状态变化当作剧情事实：后续分支需要读取的内容必须写进 `visibleWhen`、`enabledWhen`、`effects` 或 `onEnter`。

## 推荐写作流程

1. **先画节点骨架**：列出入口、关键分支、阶段终点；每个节点只承载一个清晰剧情 beat。
2. **固定稳定 ID**：`storyId`、node id、choice id、flag、dialogue id、location id、relation id 都使用稳定命名。改名会破坏存档和测试引用。
3. **补 `initialState`**：至少提供入口 `locationId`、`sublocationId`，并初始化本章会使用的 attributes、relations、flags。
4. **写 nodes**：为每个节点写 `title`、`summary`、`detail`、章节、地点、小地点、时间提示和 tags；进入节点时必然发生的状态变化放入 `onEnter`。
5. **连 choices**：每个 choice 的 `from` / `to` 必须指向存在的 node；显示控制用 `visibleWhen`，可见但暂不可选用 `enabledWhen`。
6. **用结构化效果记录后果**：选择造成的 flag、对话记录、属性/关系变化写入 `effects`；目标节点的位置变化或必然对话记录写入目标 node 的 `onEnter`。
7. **本地验证**：运行 story 相关测试，确认图结构、条件、效果和跳转结果仍然可执行。

## 字段速查

### Root

| 字段 | 用法 |
| --- | --- |
| `storyId` | 稳定剧情 ID，例如 `story.qingyun-entry`。 |
| `title` | 给调试、编辑器或未来章节选择 UI 使用的显示名。 |
| `entryNodeId` | 首次进入剧情时加载的 node id。 |
| `initialState` | StoryState 初始值；`storyFlow` 会自动补入 `storyId` 和入口 `nodeId`。 |
| `nodes` | 所有剧情节点。 |
| `choices` | 所有节点之间的有向边。 |

### Node

| 字段 | 用法 |
| --- | --- |
| `id` | 节点稳定 ID，全图唯一。 |
| `type` | 当前约定写 `story`；校验器会把可游玩节点规范化为 story。 |
| `title` / `summary` / `detail` | UI 标题、摘要和正文。 |
| `tags` | 用于内容筛选和作者语义标注。 |
| `chapter` / `location` / `sublocation` / `timeHint` | UI 副标题来源。 |
| `locationId` / `sublocationId` | StoryState 的确定性地点标识，不要只依赖中文地点名。 |
| `onEnter` | 抵达该节点时必然应用的 `StoryEffect[]`。 |
| `aiHints` | 可选生成提示；用于扩写语气、主题和禁忌，不参与运行时判定。 |

### Choice

| 字段 | 用法 |
| --- | --- |
| `id` | 选项稳定 ID，全图唯一。 |
| `from` / `to` | 起点和目标 node id。 |
| `text` / `description` | 玩家看到的选项文案和说明。 |
| `visibleWhen` | 不满足时隐藏选项。适合剧透、互斥路线或不应暴露的信息。 |
| `enabledWhen` | 不满足时保留选项但禁用，并显示失败原因。适合属性门槛和已知目标。 |
| `effects` | 选择后立即应用的 `StoryEffect[]`。目标节点跳转会由视图模型自动追加。 |
| `flags` | 供 UI/作者识别的标签，不等同于运行时 `flags`。 |

### Story battle trigger

当剧情选择要引发战斗时，在 choice `effects` 或目标 node `onEnter` 中加入：

```json
{
  "kind": "startBattle",
  "battle": {
    "battleId": "story.chapter.first-duel",
    "encounterId": "test_encounter_01",
    "encounterFile": "data/encounters/test-enemy.json",
    "deckFile": "data/decks/starter-deck.json",
    "onVictoryNodeId": "node.after_victory",
    "onDefeatNodeId": "node.after_defeat",
    "launchText": "执事示意你以卡匣应战。"
  }
}
```

`onVictoryNodeId` 和 `onDefeatNodeId` 必须指向同一剧情图中已经存在的节点。`StoryScene` 会把 `battleLaunch` 元数据连同当前 `StoryState` 包装为 source-aware payload，启动 `BattleScene`，并在战斗结束后分别回到胜利或失败续接节点。

### Hub town actions

`public/data/hub/town-shell.json` 的每个 `locations[].actions[]` 目前只支持两种数据驱动行动：

```json
{
  "id": "action.visit-town-teahouse",
  "kind": "navigate",
  "label": "去茶棚打听消息",
  "description": "在同一个 HubScene 内切换到集市旁的茶棚；当前位置会保存到本地 Story/Hub session。",
  "targetLocationId": "location.qingyun-town.teahouse",
  "statusText": "你穿过集市，来到茶棚边听散修议论今日试炼。"
}
```

`navigate.targetLocationId` 必须引用同一个 Hub 文件中已经声明的 `locations[].id`。Hub 会按 `hubId` 保存当前地点；如果后续内容删除了已保存地点，运行时会安全回退到 `defaultLocationId`，所以修改地点 id 时要把它视为会影响玩家本地 session 的持久 ID。

```json
{
  "id": "action.start-qingyun-entry-story",
  "kind": "startStory",
  "label": "前往青云宗山门",
  "description": "启动 public/data/story/story-graph.json 中的青云宗入门主线。",
  "storyGraphFile": "data/story/story-graph.json",
  "statusText": "从青云镇出发，主线故事已开启。"
}
```

`startStory.storyGraphFile` 由 `HubScene` 传给 `StoryScene`，并会在 StoryScene 触发 BattleScene 往返时继续保留。Hub 启动故事时会用 `hubId + actionId + storyGraphFile` 查找本地 Story runtime snapshot；同一个 action 再次启动会恢复已保存的 `StoryState` 和 `selectedChoiceIds`，终点页的“重新开始故事”会把该 action 的进度重置到入口。不要把商店、背包、奖励、秘境出口、完整 world-state 或云存档塞进当前 Hub action；这些需要先定义新的数据合同。

同一个 Hub 可以声明多个 `startStory` action；多个 Hub 也可以指向同一个故事图，只要 `hubId` 和 action id 是稳定且清晰分离的。当前青云镇示例中，山门集市的 `action.start-qingyun-entry-story` 指向 `data/story/story-graph.json`，茶棚的 `action.start-teahouse-rumors-story` 指向 `data/story/qingyun-teahouse-rumors.json`；青云宗山门的 `action.start-sect-gate-entry-story` 也指向 `data/story/story-graph.json`，但用 `hub.qingyun-sect-gate` 单独保存进度。它们必须使用不同 action id，并各自维护独立 Story runtime snapshot；不要通过复用 action id 后只替换文件名来“覆盖”已有入口。

## Compact schema example

`public/data/story/story-graph.compact.example.json` 是一个两节点、一选项的最小可游玩示例，并由 `src/game/scenes/story/storyFlow.test.ts` 校验。它展示了：

- root 必需字段和 `initialState`；
- 入口 node 的 `onEnter` flag；
- 带 `enabledWhen` 属性门槛的 choice；
- choice `effects` 设置 flag；
- 终点 node 的 `onEnter` 位置迁移。

新增作者模板时优先复制这个 compact example，再替换 ID 和文案；不要从较长的主线示例里手动删字段，容易漏掉必需字段或保留错误引用。

## 条件与效果使用原则

- `visibleWhen` 控制“玩家是否知道这个选择存在”。如果只是属性不足，应优先用 `enabledWhen`，让 UI 给出明确原因。
- `onEnter` 适合“只要抵达节点就发生”的事实，例如移动小地点、记录关键对话、设置阶段 flag。
- `effects` 适合“因为选择而发生”的事实，例如帮助 NPC、关系变化、属性变化。
- `startBattle` 只声明战斗启动意图和结果分支；`StoryScene` / `BattleScene` 负责按该元数据启动战斗、回填胜负，并继续到明确的胜利或失败节点。
- 关系和属性使用数字；缺失属性在条件判断中按 `0` 处理，但作者应在 `initialState` 显式初始化本章会用到的关键值。
- flag、dialogue id、node id 不要复用自然语言句子；使用稳定命名空间，例如 `story.sect_entry.helped_frail_girl`。

## 验证命令

```bash
bun test src/game/services/StoryHubSessionPersistence.test.ts src/game/scenes/hub/hubTown.test.ts src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts
bun test src/game/types/storyContent.test.ts
npm run build-nolog
```

如果只改 `story-graph.json`、`qingyun-teahouse-rumors.json`、`town-shell.json` 或 compact example，至少运行第一条命令。改动 standalone `story-graph.executable.json` 时再运行第二条命令。涉及 UI/runtime TypeScript 时运行构建命令。
