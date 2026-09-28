---
title: 雾中野狐
scene: true
nodeId: scene.qa-fog.mist-fox
chapter: 第一章
location: 青云宗山门
sublocation: 白叶草林地
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
backgroundAsset: assets/story/qa-fog/whiteleaf-clearing-v1.png
---
# 雾中野狐

被折断的白叶草一路伸向林内。雾气里，一只野狐守着散落的药篓，前爪缠着细细的蓝线。它没有扑上来，却也不肯放你过去。

你认得这不是药铺里的老人。野狐闻到你怀中的白叶草，压低身子，像是在防备又一次被夺走东西。

## 选项

- [护住药草，以卡匣挡开野狐](./qa-fog-battle-pending.md) <!-- story-choice: {"id":"choice.qa-fog.mist-fox.fight","effects":[{"kind":"startBattle","battle":{"battleId":"battle.qa-fog.mist-fox","encounterResourceId":"test_encounter_01","encounterId":"test_encounter_01","encounterFile":"data/encounters/test-enemy.json","deckResourceId":"deck.starter","deckFile":"data/decks/starter-deck.json","onVictoryNodeId":"scene.qa-fog.battle-victory","onDefeatNodeId":"scene.qa-fog.battle-defeat","launchText":"野狐从雾中跃出。先稳住卡匣，再护住药草。"}}]} -->
- [不惊动它，带药草退回林缘](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.mist-fox.retreat"} -->
