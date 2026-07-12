# 统一整个游戏的卡片预览工具 Design

## Problem

统一整个游戏所有卡片预览能力，所有需要预览卡片的界面尽量改用同一套共享预览工具与交互表现，包括但不限于卡组管理、战斗、选择列表、悬浮提示或详情面板中的卡片预览；要求统一预览容器、信息层级、交互入口和关闭行为，同时保持现有核心流程可用，不引入与预览无关的玩法改动。

## Current Design

- `BattleScene` 通过 `CardPreviewManager` 监听 `showCardPreview` / `showCardPreviewFromData`，但这套预览只在战斗场景内显式接线。
- `BaseCardSprite` 的 hover 会发出预览事件，并且刻意不在 `pointerout` 时隐藏；`CardListView` 和 `DeckSelectionUI` 依赖这条副作用链，关闭弹层时没有统一清理预览。
- `BattleLog` 既能从活体精灵发起预览，也能从快照数据回退发起预览，但它的 `hideCardPreview` 语义与战斗主预览当前并不一致。
- `DeckManagementPanel` 自己绘制了一套 metadata 驱动的“焦点牌面”，没有复用战斗侧已有的预览容器或牌面渲染。
- `ExpeditionScene` 已经预加载了卡组管理所需的卡牌 JSON 资源并构建 metadata，因此卡组管理缺的不是数据来源，而是共享预览宿主与统一触发协议。

## Established Decisions

### Shared Preview Host

- 每个需要卡片预览的 Scene 只拥有一个共享预览宿主，负责当前激活预览的显示、替换、清理与销毁。
- 预览请求统一为共享协议，允许从活体卡片精灵、完整卡牌数据，或 `cardId + resolver context` 发起。
- 预览宿主独占外层容器、层级深度、入退场动画、标题/来源文案与关闭控件；调用方不再各自绘制独立预览壳。

### Shared Content Hierarchy

- 核心预览内容统一为真实卡牌牌面，使用现有卡片渲染并切到 `hover` 模式展示完整信息。
- 统一信息层级为：预览标题/来源信息、主牌面、可选的次级上下文区。
- 场景特有的辅助信息只能挂到统一壳体的次级上下文区，例如卡组管理里的库存/卡组数量、规则提醒；不得再分叉出另一套牌面容器。

### Interaction And Dismissal

- hover、键盘焦点切换，以及显式点击条目/卡牌，都更新到同一个当前预览。
- `pointerout` 本身不负责关闭预览，避免在滚动列表、日志悬停或卡组管理切换焦点时闪烁。
- 关闭行为统一为：显式关闭操作、`ESC`、所属弹层关闭、Scene 切换/销毁，或调用方在焦点失效时主动 clear。
- 任何模态列表或选择弹层在关闭时都必须清掉自己打开的预览，不能留下孤儿预览容器。

### Scope For This Goal

- 当前快照里确认需要统一的个体卡片预览入口包括：
  - 战斗中的手牌/场地卡片 hover
  - `BattleLog` 里的卡名悬停预览
  - `CardListView` 的卡组/弃牌堆浏览弹层
  - `DeckSelectionUI` 的抽选/多选卡牌弹层
  - `DeckManagementPanel` 的编辑区、浏览区与焦点牌面
- 以下相邻能力保持现状，除非后续显式接入共享宿主：
  - 丹药 tooltip
  - 卡牌内部的功法与状态微型 tooltip
  - 大地图/城镇地点预览
  - 战斗技能按钮

## Implementation Notes

- `ExpeditionScene` 已预加载 deckbuilder metadata 所依赖的卡牌内容资源，因此卡组管理应直接复用这些缓存中的完整卡牌数据来渲染统一牌面，而不是继续扩张 metadata-only 的牌面实现。
- `CardSpriteFactory` 当前只支持 `unit`、`artifact`、`talisman`、`field`、`pill` 牌面；共享预览的首轮落地以这些已支持的牌种为准，`skill` 如需牌面化预览应作为后续明确扩展。

## Engineering Work

- `battle-shared-card-preview`
- `expedition-deckmanager-shared-card-preview`
