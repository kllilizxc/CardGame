---
title: 被问起告密
scene: true
nodeId: scene.qa-fog.reproach
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 被问起告密

狐爷爷没有忘记守卫来访。他感谢你仍肯救人，却不再向你托付秘密。

## 对话

- 狐爷爷：药可以交给我；至于旧事，就别再说你会守口如瓶。 <!-- story-line: {"id":"line.qa-fog.reproach","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [继续采药](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.reproach.help","visibleWhen":{"kind":"not","condition":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}},"effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"gather"}]} -->
- [第三章再来求助](./qa-fog-chapter3.md) <!-- story-choice: {"id":"choice.qa-fog.reproach.chapter3","visibleWhen":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}} -->
