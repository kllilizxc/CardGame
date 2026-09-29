---
title: 告知守卫
scene: true
nodeId: scene.qa-fog.guard
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"once","eventId":"event.qa-fog.report-to-guard","effects":[{"kind":"learnKnowledge","actorId":"npc.qa-fog-guard","knowledgeId":"qa-fog.fox-identity"},{"kind":"setFlag","flag":"qa-fog.reported","value":true},{"kind":"adjustRelation","relationId":"npc.qa-fog-fox","delta":-20}]}]
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 告知守卫

守卫听完旧医师的身份，当即记下此事。狐爷爷后来知道是你说的。

## 对话

- 守卫：我会核实药方的来历，但不会假装没有听见。 <!-- story-line: {"id":"line.qa-fog.guard","speakerId":"npc.qa-fog-guard"} -->

## 选项

- [回药铺面对狐爷爷](./qa-fog-revisit.md) <!-- story-choice: {"id":"choice.qa-fog.guard.return"} -->
- [仍去采药救人](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.guard.help","visibleWhen":{"kind":"not","condition":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}},"effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"gather"}]} -->
