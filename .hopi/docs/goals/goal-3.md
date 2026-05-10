---
goalKey: goal-3
title: "调整为成熟的游戏架构"
status: active
autopilotEnabled: true
deployRequiresApproval: true
---

# 调整为成熟的游戏架构

## Objective

当前我们已经添加了主要的功能部分，但是不确定现在的代码架构是否成熟，是否能够承担后续大量剧本，卡片资源，地图资源等的开发，所以要在这个时候先调整好。比如是否能方便的用配置文件来描述地图/关卡/卡牌资源等，角色的属性是否有统一的配置地方，属性的效果是否可灵活配置修改，是否便于保存/加载功能，等等。

## Success Criteria

Content expansion should become versioned and data/config driven for stories, Hub locations, world-map destinations, Expedition maps, encounters, cards, statuses, and character/world data; runtime ownership should be explicit across content validation, scene routing, battle/effects, world/progression state, persistence, and UI; refactors must remain incremental and keep the game playable.

## Current Strategy

- Continue the incremental architecture-spine migration rather than a big-bang rewrite: harden one durable content/runtime/save boundary at a time, keep the game playable, and only promote small independently reviewable implementation slices.
- Preserve existing data-driven Story/Hub/WorldMap/Expedition patterns while moving shared contracts toward versioned catalog IDs, explicit runtime ownership, and tested save compatibility seams.

## Current Focus

After commits `630fcbe` / `d613926` (status ID validation / legacy armor alignment) and commits `ce0a4e6` / `8e245d0` (read-only save/world-state snapshot facade), the next architecture batch has three narrow, independent ready seams: catalog-backed runtime loading for Battle shared card/gongfa/status-definition resources; a pure in-memory versioned save/world-state document contract over the snapshot facade; and static catalog validation for unit `realmId` / artifact `gradeId` references against canonical config registries. Do not promote further work until one of these lands.

## Open Questions

- None recorded yet.
