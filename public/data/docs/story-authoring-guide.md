# Story Authoring Guide

本指南面向剧情作者和内容实现者，说明如何新增或扩展 `StoryScene` 可游玩的 StoryState 剧情图。字段合同的完整定义见 `public/data/docs/story-content-contracts.md`；最小可校验示例见 `public/data/story/story-graph.compact.example.json`。

## 当前 source of truth

- **可游玩主线文件**：`public/data/story/story-graph.json`
- **紧凑 schema 示例**：`public/data/story/story-graph.compact.example.json`
- **运行时状态类型**：`src/game/types/story.ts`
- **严格内容校验**：`src/game/scenes/story/storyFlow.ts`
- **渲染与跳转视图模型**：`src/game/scenes/story/storyFlowViewModel.ts`

新增真实剧情时优先编辑 `story-graph.json`。不要把只存在于 prose 的状态变化当作剧情事实：后续分支需要读取的内容必须写进 `visibleWhen`、`enabledWhen`、`effects` 或 `onEnter`。

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
bun test src/game/scenes/story/*.test.ts src/game/state/StoryState.test.ts
bun test src/game/types/storyContent.test.ts
npm run build-nolog
```

如果只改 `story-graph.json` 或 compact example，至少运行第一条命令。改动 standalone `story-graph.executable.json` 时再运行第二条命令。涉及 UI/runtime TypeScript 时运行构建命令。
