---
id: plan-initial
title: Clarify and plan the Goal
notBefore: null
dependsOn: []
contractRevision: 1
evidenceRefs:
  - E-R-2172d482-915a-4aa1-9afc-670546fbb948
attempts: 0
kind: planning
stage: done
---
## Objective

Clarify and plan: 统一整个游戏所有卡片预览能力，所有需要预览卡片的界面尽量改用同一套共享预览工具与交互表现，包括但不限于卡组管理、战斗、选择列表、悬浮提示或详情面板中的卡片预览；要求统一预览容器、信息层级、交互入口和关闭行为，同时保持现有核心流程可用，不引入与预览无关的玩法改动。

## Acceptance Criteria

- Material ambiguity is resolved or raised through targeted Attention.
- The design documents and sparse Engineering Work DAG are current.

## Accepted Inputs

- .hopi/docs/goals/G-8c18e7d0-612e-4a4a-b7b8-6939c1ce19e6/inputs/H-21e9647d-1854-439e-ae35-01c6b9658b2b/EV-be1700b1-6b34-47bb-95ed-ff729a2a2d96.md

## Planning Outcome

- Updated `design/index.md` with the shared preview host, information hierarchy, scope boundary, and close-behavior decisions for game-wide card preview.
- Proposed `battle-shared-card-preview` to unify battle, battle-log, and battle modal preview entry points under one host.
- Proposed `expedition-deckmanager-shared-card-preview`, dependent on the battle-side foundation, to replace the deck-management-specific focus pane with the shared preview tool.
