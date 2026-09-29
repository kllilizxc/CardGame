---
title: 再访药铺
scene: true
nodeId: scene.qa-fog.revisit
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
backgroundAsset: assets/story/qa-fog/apothecary-exterior-v1.png
---
# 再访药铺

老人记得你来过。他先看了看药篓，才继续说话。

## 对话

- 狐爷爷：你已经听过我的请求。今日又有什么发现？ <!-- story-line: {"id":"line.qa-fog.revisit","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [听他质问告密一事](./qa-fog-reproach.md) <!-- story-choice: {"id":"choice.qa-fog.revisit.reproach","visibleWhen":{"kind":"flag","flag":"qa-fog.reported","expected":true}} -->
- [再谈旧药方](./qa-fog-secret.md) <!-- story-choice: {"id":"choice.qa-fog.revisit.secret","visibleWhen":{"kind":"flag","flag":"qa-fog.reported","expected":false}} -->
- [继续寻找救治办法](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.revisit.gather","visibleWhen":{"kind":"not","condition":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}},"effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"gather"}]} -->
- [第三章再来求助](./qa-fog-chapter3.md) <!-- story-choice: {"id":"choice.qa-fog.revisit.chapter3","visibleWhen":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}} -->
