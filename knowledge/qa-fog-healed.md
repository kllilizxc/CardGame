---
title: 委托完成
scene: true
nodeId: scene.qa-fog.healed
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"once","eventId":"event.qa-fog.quest-complete","effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"completed"},{"kind":"grantCard","grantId":"grant.qa-fog.fox-card","cardId":"CR_001","count":1}]}]
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 委托完成

药草发挥了作用。狐爷爷慢慢稳住呼吸，送你一张灵狐卡作为谢礼。

## 对话

- 狐爷爷：这份恩情我记得，卡牌请你收下。 <!-- story-line: {"id":"line.qa-fog.healed","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [第三章前来求助](./qa-fog-chapter3.md) <!-- story-choice: {"id":"choice.qa-fog.healed.chapter3"} -->
- [回药铺门口再访](./qa-fog-entry.md) <!-- story-choice: {"id":"choice.qa-fog.healed.entry"} -->
