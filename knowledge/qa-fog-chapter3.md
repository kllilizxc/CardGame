---
title: 第三章求助
scene: true
nodeId: scene.qa-fog.chapter3
chapter: 第三章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 夜晚
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 第三章求助

夜里雾林的路再度封住。你来问狐爷爷可有旧药方留下的线索。

## 对话

- 狐爷爷：我记得你做过什么，也记得你答应过什么。 <!-- story-line: {"id":"line.qa-fog.chapter3","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [请他指出隐秘山路](./qa-fog-trusted.md) <!-- story-choice: {"id":"choice.qa-fog.chapter3.trusted","visibleWhen":{"kind":"all","conditions":[{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"},{"kind":"flag","flag":"qa-fog.alive","expected":true},{"kind":"relation","relationId":"npc.qa-fog-fox","operator":">=","value":30},{"kind":"flag","flag":"qa-fog.promised","expected":true},{"kind":"flag","flag":"qa-fog.reported","expected":false},{"kind":"actorAbility","actorId":"npc.qa-fog-fox","ability":"医术","operator":">=","value":6}]}} -->
- [另寻同行者](./qa-fog-alternative.md) <!-- story-choice: {"id":"choice.qa-fog.chapter3.alternative","visibleWhen":{"kind":"not","condition":{"kind":"all","conditions":[{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"},{"kind":"flag","flag":"qa-fog.alive","expected":true},{"kind":"relation","relationId":"npc.qa-fog-fox","operator":">=","value":30},{"kind":"flag","flag":"qa-fog.promised","expected":true},{"kind":"flag","flag":"qa-fog.reported","expected":false},{"kind":"actorAbility","actorId":"npc.qa-fog-fox","ability":"医术","operator":">=","value":6}]}}} -->
