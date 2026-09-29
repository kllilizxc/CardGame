---
title: 守密承诺
scene: true
nodeId: scene.qa-fog.promised
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 守密承诺

狐爷爷终于松开攥着药方的手，答应把所需药材告诉你。

## 对话

- 狐爷爷：此事只让你知道。山路边能找到白叶草。 <!-- story-line: {"id":"line.qa-fog.promised","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [备好银针并去采药](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.promised.gather","visibleWhen":{"kind":"not","condition":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}},"effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"gather"}]} -->
- [再查看他的伤势](./qa-fog-diagnosis.md) <!-- story-choice: {"id":"choice.qa-fog.promised.observe","enabledWhen":{"kind":"attribute","attribute":"洞察","operator":">=","value":5}} -->
