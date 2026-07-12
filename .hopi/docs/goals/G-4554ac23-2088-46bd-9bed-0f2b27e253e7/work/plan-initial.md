---
id: plan-initial
title: Clarify and plan the Goal
notBefore: null
dependsOn: []
contractRevision: 1
evidenceRefs:
  - E-R-347c7ec2-ac34-432c-9dd2-02cff25406ad
attempts: 0
kind: planning
stage: done
---
## Objective

Clarify and plan: 以参考图 `.hopi/docs/assistant/attachments/9edc4a62f7ee4cbca9d8653dc9b9a9e96fe8d0099c3fef6d0cb4db87347d077a/yu-gi-oh-master-duel-deck-size.webp` 为基准，尽量还原项目中的卡组管理界面：优先对齐左右双栏结构、左侧主卡组/额外卡组分区与数量展示、右侧卡池列表及搜索/筛选/排序控制、整体信息密度、视觉层级和交互布局，同时保持现有核心卡组管理流程可用。

## Acceptance Criteria

- Material ambiguity is resolved or raised through targeted Attention.
- The design documents and sparse Engineering Work DAG are current.

## Accepted Inputs

- .hopi/docs/goals/G-4554ac23-2088-46bd-9bed-0f2b27e253e7/inputs/H-21e9647d-1854-439e-ae35-01c6b9658b2b/EV-46a09ef9-dc6e-4935-bb5a-b8a2ea821b10.md

## Planning Outcome

- No operator attention is required. The current saved-deck model is a single persisted `cards` stack, so the proposal keeps gameplay and persistence unchanged and treats `Main Deck / Extra Deck` as a deckbuilder-local presentation split for this Goal.
- The exact reference image `.hopi/docs/assistant/attachments/9edc4a62f7ee4cbca9d8653dc9b9a9e96fe8d0099c3fef6d0cb4db87347d077a/yu-gi-oh-master-duel-deck-size.webp` is carried into the engineering Work as the visual benchmark for layout, density, and control hierarchy.

## Proposed Design

- .hopi/docs/goals/G-4554ac23-2088-46bd-9bed-0f2b27e253e7/design/index.md

## Proposed Engineering Work

- .hopi/docs/goals/G-4554ac23-2088-46bd-9bed-0f2b27e253e7/work/deckbuilder-section-presentation.md
- .hopi/docs/goals/G-4554ac23-2088-46bd-9bed-0f2b27e253e7/work/deckbuilder-master-duel-panel-restore.md
