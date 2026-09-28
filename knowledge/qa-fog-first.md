---
title: 药铺初见
scene: true
nodeId: scene.qa-fog.first
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"setFlag","flag":"qa-fog.met","value":true}]
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 药铺初见

狐爷爷扶住门框，手边的药篓还空着。

## 对话

- 狐爷爷：雾林的白叶草能救急，可我今日走不开。 <!-- story-line: {"id":"line.qa-fog.first","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [问起失窃的药方](./qa-fog-secret.md) <!-- story-choice: {"id":"choice.qa-fog.first.ask-secret"} -->
- [留意他颤抖的手](./qa-fog-diagnosis.md) <!-- story-choice: {"id":"choice.qa-fog.first.observe","enabledWhen":{"kind":"attribute","attribute":"洞察","operator":">=","value":5}} -->
- [答应入林采药](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.first.gather","enabledWhen":{"kind":"all","conditions":[{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"available"},{"kind":"flag","flag":"qa-fog.alive","expected":true}]},"effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"gather"}]} -->
