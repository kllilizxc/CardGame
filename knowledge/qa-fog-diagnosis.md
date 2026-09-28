---
title: 察觉中毒
scene: true
nodeId: scene.qa-fog.diagnosis
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"learnKnowledge","actorId":"player","knowledgeId":"qa-fog.poisoned"}]
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 察觉中毒

他的手指发抖，腕上有细浅的紫痕。你意识到他中了毒。

## 对话

- 狐爷爷：你看出来了。若要施针，还得有银针与白叶草。 <!-- story-line: {"id":"line.qa-fog.diagnosis","speakerId":"npc.qa-fog-fox"} -->

## 选项

- [当场施针救治](./qa-fog-healed.md) <!-- story-choice: {"id":"choice.qa-fog.diagnosis.needle","visibleWhen":{"kind":"knowledge","actorId":"player","knowledgeId":"qa-fog.poisoned"},"enabledWhen":{"kind":"all","conditions":[{"kind":"attribute","attribute":"医术","operator":">=","value":4},{"kind":"itemCount","itemId":"tool.qa-fog-silver-needle","operator":">=","value":1},{"kind":"itemCount","itemId":"consumable.qa-fog-white-leaf","operator":">=","value":1},{"kind":"flag","flag":"qa-fog.hand-injured","expected":false},{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"gather"},{"kind":"flag","flag":"qa-fog.alive","expected":true}]},"effects":[{"kind":"once","eventId":"event.qa-fog.needle-treatment","effects":[{"kind":"consumeItem","transactionId":"tx.qa-fog.needle-herb","itemId":"consumable.qa-fog-white-leaf","itemType":"consumable","count":1},{"kind":"adjustRelation","relationId":"npc.qa-fog-fox","delta":8},{"kind":"setFlag","flag":"qa-fog.needle-route","value":true}]}]} -->
- [采药并借来银针](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.diagnosis.prepare","visibleWhen":{"kind":"not","condition":{"kind":"questStage","questId":"quest.qa-fog-heal-fox","stage":"completed"}},"effects":[{"kind":"setQuestStage","questId":"quest.qa-fog-heal-fox","stage":"gather"}]} -->
- [先退回药铺门口](./qa-fog-revisit.md) <!-- story-choice: {"id":"choice.qa-fog.diagnosis.return"} -->
