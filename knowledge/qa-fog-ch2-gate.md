---
title: 山门前的问答
scene: true
nodeId: scene.qa-fog.ch2.gate
chapter: 第二章
location: 青云宗山门
sublocation: 青云宗山门
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.qingyun-sect-gate.archway
timeHint: 雨前
backgroundAsset: assets/story/qa-fog/apothecary-exterior-v1.png
---
# 山门前的问答

守卫把一张受潮的封桥告示压在石狮下。告示的日期比药铺账页早了半年。

## 对话

- 守卫：药铺的人今天走得勤，老人可好些了？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.001","speakerId":"npc.qa-fog-guard"} -->
- 主角：退了烧，能自己整理旧账。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.002","speakerId":"player"} -->
- 守卫：那就好。你看告示，是想走桥？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.003","speakerId":"npc.qa-fog-guard"} -->
- 主角：我想知道为什么封桥。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.004","speakerId":"player"} -->
- 守卫：桥没断，是桥下有人点过引雾的灯。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.005","speakerId":"npc.qa-fog-guard"} -->
- 主角：什么灯能引来雾？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.006","speakerId":"player"} -->
- 守卫：蓝色的灯芯，烧完留一种细线似的灰。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.007","speakerId":"npc.qa-fog-guard"} -->
- 主角：你见过那灰吗？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.008","speakerId":"player"} -->
- 守卫：见过，擦不掉，遇水反倒更亮。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.009","speakerId":"npc.qa-fog-guard"} -->
- 主角：账页上也提到一条蓝线。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.010","speakerId":"player"} -->
- 守卫：你的话到这儿停住了。是你还没查实，还是不愿说？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.011","speakerId":"npc.qa-fog-guard"} -->
- 主角：两样都有。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.012","speakerId":"player"} -->
- 守卫：我不会逼你把猜测当证词。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.013","speakerId":"npc.qa-fog-guard"} -->
- 主角：桥封了以后还有人过吗？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.014","speakerId":"player"} -->
- 守卫：有。有人夜里把警绳解开，天亮又系回去。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.015","speakerId":"npc.qa-fog-guard"} -->
- 主角：你为何不守在桥边？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.016","speakerId":"player"} -->
- 守卫：守过三夜，只见水往上游走。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.017","speakerId":"npc.qa-fog-guard"} -->
- 主角：水不可能倒流。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.018","speakerId":"player"} -->
- 守卫：所以我没把这句写进公文。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.019","speakerId":"npc.qa-fog-guard"} -->
- 主角：封桥告示是谁签的？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.020","speakerId":"player"} -->
- 守卫：是我。要是判断错了，也该我担。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.021","speakerId":"npc.qa-fog-guard"} -->
- 主角：你愿意陪我重看桥下吗？ <!-- story-line: {"id":"line.qa-fog.ch2.gate.022","speakerId":"player"} -->
- 守卫：愿意，但先说清你希望我知道多少。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.023","speakerId":"npc.qa-fog-guard"} -->
- 主角：我还要想一想。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.024","speakerId":"player"} -->
- 守卫：可以。决定前先看脚下的雨痕，别看我的脸色。 <!-- story-line: {"id":"line.qa-fog.ch2.gate.025","speakerId":"npc.qa-fog-guard"} -->

## 选项

- [把账页的压痕交给守卫核对](./qa-fog-ch2-share.md) <!-- story-choice: {"id":"choice.qa-fog.ch2.gate.share","effects":[{"kind":"once","eventId":"event.qa-fog.ch2.share-ledger","effects":[{"kind":"setFlag","flag":"qa-fog.ch2.shared-ledger","value":true},{"kind":"learnKnowledge","actorId":"npc.qa-fog-guard","knowledgeId":"qa-fog.ch2.ledger-clue"}]}]} -->
- [先收好压痕，自己探路](./qa-fog-ch2-hold.md) <!-- story-choice: {"id":"choice.qa-fog.ch2.gate.hold","effects":[{"kind":"once","eventId":"event.qa-fog.ch2.hold-ledger","effects":[{"kind":"setFlag","flag":"qa-fog.ch2.held-ledger","value":true},{"kind":"adjustRelation","relationId":"npc.qa-fog-fox","delta":5}]}]} -->
