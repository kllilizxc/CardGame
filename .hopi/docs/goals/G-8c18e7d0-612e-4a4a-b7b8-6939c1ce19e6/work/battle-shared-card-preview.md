---
id: battle-shared-card-preview
title: 统一战斗与战斗弹层的共享卡片预览
notBefore: null
dependsOn: []
contractRevision: 1
evidenceRefs:
  - E-R-13331d8c-9cc3-49e8-aea9-ec5a8d721872
  - E-R-cc6e9a80-99af-4a5b-a0c8-9dec14dda0e2
attempts: 0
kind: engineering
stage: done
---
## Objective

把战斗场景里分散的卡片预览入口统一到同一套共享预览宿主，包括战场卡牌、战斗日志里的卡名引用、卡组/弃牌堆浏览弹层，以及抽卡/多选弹层；统一打开、替换、关闭与清理行为，同时不改变战斗规则与主要操作流。

## Scope

- 重构或替换现有 `CardPreviewManager`，形成 battle scene 可复用的共享预览宿主与请求协议。
- 让 `BattleScene`、`BaseCardSprite`、`BattleLog`、`CardListView`、`DeckSelectionUI` 都通过同一套宿主更新预览。
- 在战斗模态弹层关闭、Scene 销毁和焦点失效时清理预览，避免遗留预览壳体或失效引用。

## Acceptance Criteria

- 战斗侧存在单一共享预览宿主；战场 hover、日志卡名、卡组/弃牌堆列表和抽卡选择弹层全部改走这套宿主，而不是依赖各自的临时壳体或隐式残留状态。
- 这些入口看到的预览容器、标题/来源信息、层级深度、过渡动画与关闭语义保持一致。
- 关闭 `CardListView` 或 `DeckSelectionUI`，或离开 `BattleScene` 时，会同步清理该上下文打开的预览；仅 `pointerout` 不会在正常浏览时强制闪断预览。
- 抽卡、选卡、查看牌库/弃牌堆、打牌与战斗日志 hover 仍然可用，不引入与预览无关的玩法改动。
- 增补或更新自动化覆盖，至少覆盖共享预览请求/清理行为，并让相关 `bun test` 目标通过。
