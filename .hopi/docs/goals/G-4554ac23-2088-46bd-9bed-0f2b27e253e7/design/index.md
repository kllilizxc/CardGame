# 尽量还原参考图的卡组管理界面 Design

## Problem

以参考图 `.hopi/docs/assistant/attachments/9edc4a62f7ee4cbca9d8653dc9b9a9e96fe8d0099c3fef6d0cb4db87347d077a/yu-gi-oh-master-duel-deck-size.webp` 为基准，尽量还原项目中的卡组管理界面：优先对齐左右双栏结构、左侧主卡组/额外卡组分区与数量展示、右侧卡池列表及搜索/筛选/排序控制、整体信息密度、视觉层级和交互布局，同时保持现有核心卡组管理流程可用。

## Established Decisions

### Scope Boundary

- 参考图 `.hopi/docs/assistant/attachments/9edc4a62f7ee4cbca9d8653dc9b9a9e96fe8d0099c3fef6d0cb4db87347d077a/yu-gi-oh-master-duel-deck-size.webp` 只作为卡组管理界面的视觉与布局基准。
- 本 Goal 不改 `PersistentStash`、`SavedDeck`、远征带入、战斗启动负载或现有 `20-40` 张卡的出征校验语义。

### Main Deck / Extra Deck Presentation

- 新界面引入 deckbuilder 本地的分区呈现：`main` 与 `extra`。
- 由于当前持久化卡组只有单个 `cards` 栈、没有额外卡组规则，本 Goal 先把所有既有持久化卡牌默认映射到 `main`；`extra` 作为可见的次级分区与数量展示保留出来，默认可为空，供后续规则扩展。
- 分区数量只服务于界面呈现；现有玩法校验仍基于持久化卡组总张数。

### Default Layout Target

- 默认 `1920x1080` 卡组管理态应读作一块宽屏双栏工作板：左侧约 `58-60%` 为卡组画布，右侧约 `40-42%` 为卡池与控制区。
- 左栏层级固定为：卡组名头条、紧凑卡组切换与动作区、`Main Deck` 分区与数量、`Extra Deck` 分区与数量。
- 右栏层级固定为：卡池标题或 tab 风格头、单条搜索框、紧凑筛选/排序/重置控制、稠密卡池网格。

### Density And Interaction

- 默认态从“文字说明优先的列表”改成“缩略图优先的网格”。在默认 deck-manager frame 下，左侧主卡组至少能一行展示 `8` 张卡，右侧卡池至少能一行展示 `5` 张卡。
- 卡牌详情保持次级且按需展开，不能在默认态持续挤占左右双网格的主视图。
- 现有核心流程必须继续可用：切换卡组、新建、重命名、删除、`+1`、快速加满、`-1`、清空单卡、关闭并返回远征准备。
- 允许用参考图式的 tab/按钮外观强化层级，但只有现有卡池视图需要真实交互，不新增空白模式或死链入口。

### Verification Boundary

- 为分区视图模型与抽离后的布局计算补齐单元测试。
- 为重构后的 deck manager 默认态补充或更新 smoke 级覆盖，确保结构、密度和现有 stash 变更流程可回归验证。
