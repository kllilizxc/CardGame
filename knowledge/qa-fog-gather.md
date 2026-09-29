---
title: 雾林采药
scene: true
nodeId: scene.qa-fog.gather
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"once","eventId":"event.qa-fog.gather-supplies","effects":[{"kind":"grantItem","transactionId":"tx.qa-fog.needle","itemId":"tool.qa-fog-silver-needle","itemType":"tool","count":1},{"kind":"grantItem","transactionId":"tx.qa-fog.herbs","itemId":"consumable.qa-fog-white-leaf","itemType":"consumable","count":2}]}]
backgroundAsset: assets/story/qa-fog/whiteleaf-clearing-v1.png
---
# 雾林采药

你在林边找到两株白叶草，药铺伙计借给你一根银针。银针用于检查，不会随施针消耗。

## 选项

- [交药草请医师照料](./qa-fog-healed.md) <!-- story-choice: {"id":"choice.qa-fog.gather.regular","enabledWhen":{"kind":"all","conditions":[{"kind":"itemCount","itemId":"consumable.qa-fog-white-leaf","operator":">=","value":1},{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"gather"},{"kind":"flag","flag":"qa-fog.alive","expected":true}]},"effects":[{"kind":"once","eventId":"event.qa-fog.regular-treatment","effects":[{"kind":"consumeItem","transactionId":"tx.qa-fog.regular-herb","itemId":"consumable.qa-fog-white-leaf","itemType":"consumable","count":1},{"kind":"adjustRelation","relationId":"npc.qa-fog-fox","delta":5},{"kind":"setFlag","flag":"qa-fog.regular-route","value":true}]}]} -->
- [回药铺尝试施针](./qa-fog-diagnosis.md) <!-- story-choice: {"id":"choice.qa-fog.gather.needle","enabledWhen":{"kind":"knowledge","actorId":"player","knowledgeId":"qa-fog.poisoned"}} -->
- [追查林中拖走药草的脚印](./qa-fog-mist-fox.md) <!-- story-choice: {"id":"choice.qa-fog.gather.track","visibleWhen":{"kind":"all","conditions":[{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"gather"},{"kind":"flag","flag":"qa-fog.mist-fox-resolved","expected":false}]}} -->
