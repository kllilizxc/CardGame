---
id: expedition-deckmanager-shared-card-preview
title: 将秘境卡组管理接入共享卡片预览
notBefore: null
dependsOn:
  - battle-shared-card-preview
contractRevision: 1
evidenceRefs: []
attempts: 0
kind: engineering
stage: generate
---
## Objective

将 `DeckManagementPanel` 当前自绘的 metadata 焦点牌面切换到共享卡片预览宿主，统一卡组管理里的牌面容器、信息层级、触发入口和关闭行为，同时保留卡组编辑、库存核对和准备出发流程。

## Scope

- 在 `ExpeditionScene` 中接入与战斗侧同源的共享预览宿主。
- 让 `DeckManagementPanel` 的编辑区、浏览区、键盘焦点与点击行为都驱动这套共享预览，而不是维护独立的牌面壳体。
- 复用 expedition 已加载的卡牌 JSON 缓存，按 `cardId` 解析完整卡牌数据渲染真实牌面；只有在缺数据或牌种暂不支持时才允许 metadata 回退。
- 保留卡组/库存相关辅助信息，但把它们收敛到统一预览壳体的次级上下文区，而不是另一套焦点牌面布局。

## Acceptance Criteria

- `DeckManagementPanel` 不再维护独立的焦点牌面实现；编辑区和浏览区的卡牌行/卡牌格都驱动共享预览宿主。
- 秘境侧看到的预览壳体、信息层级和关闭行为与设计文档定义一致，并与战斗侧共享同一套核心预览工具。
- 卡组管理中的主预览默认来自完整卡牌数据解析，而不是 metadata-only 文案拼装；回退路径被限制在缺失或暂不支持的内容上。
- 打开/关闭卡组管理、切换焦点、滚动列表、键盘导航、增减卡牌与返回准备界面的核心流程保持可用，不引入与预览无关的规则改动。
- 增补或更新自动化覆盖，至少覆盖 expedition 侧的卡牌解析与焦点切换行为，并让相关 `bun test` 目标通过。
