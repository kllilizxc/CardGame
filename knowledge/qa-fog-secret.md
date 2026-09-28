---
title: 失窃的药方
scene: true
nodeId: scene.qa-fog.secret
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"learnKnowledge","actorId":"player","knowledgeId":"qa-fog.recipe-stolen"},{"kind":"learnKnowledge","actorId":"player","knowledgeId":"qa-fog.fox-identity"}]
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 失窃的药方

老人说旧药方被盗，随后承认自己曾是隐姓埋名的医师。

## 对话

- 狐爷爷：若有人知道我的旧身份，药方就再也保不住。 <!-- story-line: {"id":"line.qa-fog.secret","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [答应保守他的秘密](./qa-fog-promised.md) <!-- story-choice: {"id":"choice.qa-fog.secret.promise","visibleWhen":{"kind":"all","conditions":[{"kind":"knowledge","actorId":"player","knowledgeId":"qa-fog.recipe-stolen"},{"kind":"flag","flag":"qa-fog.reported","expected":false},{"kind":"flag","flag":"qa-fog.promised","expected":false},{"kind":"not","condition":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}}]},"enabledWhen":{"kind":"attribute","attribute":"口才","operator":">=","value":6},"effects":[{"kind":"once","eventId":"event.qa-fog.promise","effects":[{"kind":"setFlag","flag":"qa-fog.promised","value":true},{"kind":"adjustRelation","relationId":"npc.qa-fog-fox","delta":10}]}]} -->
- [将身份告诉守卫](./qa-fog-guard.md) <!-- story-choice: {"id":"choice.qa-fog.secret.report","visibleWhen":{"kind":"knowledge","actorId":"player","knowledgeId":"qa-fog.fox-identity"}} -->
- [先去采药](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.secret.leave","visibleWhen":{"kind":"not","condition":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}},"effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"gather"}]} -->
- [先离开药方话题](./qa-fog-revisit.md) <!-- story-choice: {"id":"choice.qa-fog.secret.return"} -->
