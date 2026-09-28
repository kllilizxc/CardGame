---
title: 守卫手里的账页
scene: true
nodeId: scene.qa-fog.ch3.guard-copy
chapter: 第三章
location: 青云宗山门
sublocation: 青云宗山门
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.qingyun-sect-gate.archway
timeHint: 夜晚
onEnter: [{"kind":"once","eventId":"event.qa-fog.ch3.guard-patrol","effects":[{"kind":"setFlag","flag":"qa-fog.ch3.guard-patrol","value":true}]}]
backgroundAsset: assets/story/qa-fog/apothecary-exterior-v1.png
---
# 守卫手里的账页

守卫照着你白天给的压痕，已经派人守住了旧桥上游。

## 对话

- 守卫：我记得你交来的只有压痕，不是嫌疑人的名字。 <!-- story-line: {"id":"line.qa-fog.ch3.guard-copy.001","speakerId":"npc.qa-fog-guard"} -->
- 主角：残页显出蓝线的来路，桥下还有人活动。 <!-- story-line: {"id":"line.qa-fog.ch3.guard-copy.002","speakerId":"player"} -->
- 守卫：我让人守上游，不去堵桥洞的出口。 <!-- story-line: {"id":"line.qa-fog.ch3.guard-copy.003","speakerId":"npc.qa-fog-guard"} -->
- 主角：给那个人留退路？ <!-- story-line: {"id":"line.qa-fog.ch3.guard-copy.004","speakerId":"player"} -->
- 守卫：也给我们留问话的机会。你从药草坡看蓝线，我在河岸接应。 <!-- story-line: {"id":"line.qa-fog.ch3.guard-copy.005","speakerId":"npc.qa-fog-guard"} -->

## 选项

- [循河岸的蓝线前行](./qa-fog-blue-thread.md) <!-- story-choice: {"id":"choice.qa-fog.ch3.guard-copy.blue-thread"} -->
