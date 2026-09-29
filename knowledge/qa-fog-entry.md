---
title: 雾林药铺
scene: true
nodeId: scene.qa-fog.entry
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
shareFactsAcrossStories: true
initialState: {"attributes":{"口才":4,"洞察":5,"医术":2},"relations":{"npc.qa-fog-fox":20},"flags":{"qa-fog.alive":true,"qa-fog.hand-injured":false},"questStages":{"quest.qa-fog-heal-fox":"available"}}
backgroundAsset: assets/story/qa-fog/apothecary-exterior-v1.png
---
# 雾林药铺

药铺紧邻雾林入口。屋檐下的老人抬头望向来客。

## 选项

- [初次向老人打招呼](./qa-fog-first.md) <!-- story-choice: {"id":"choice.qa-fog.entry.first","visibleWhen":{"kind":"flag","flag":"qa-fog.met","expected":false}} -->
- [再次走进药铺](./qa-fog-revisit.md) <!-- story-choice: {"id":"choice.qa-fog.entry.return","visibleWhen":{"kind":"flag","flag":"qa-fog.met","expected":true}} -->
