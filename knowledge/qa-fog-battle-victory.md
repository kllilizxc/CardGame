---
title: 雾狐退让
scene: true
nodeId: scene.qa-fog.battle-victory
chapter: 第一章
location: 青云宗山门
sublocation: 白叶草林地
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"once","eventId":"event.qa-fog.mist-fox-victory","effects":[{"kind":"setFlag","flag":"qa-fog.mist-fox-resolved","value":true},{"kind":"learnKnowledge","actorId":"player","knowledgeId":"qa-fog.blue-thread"}]}]
backgroundAsset: assets/story/qa-fog/whiteleaf-clearing-v1.png
---
# 雾狐退让

你挡住野狐的扑击，却没有再追。它退到树根后，前爪上的蓝线被枝条勾下一截。线头沾着药铺封包才会用的草灰；有人带着药材来过这里。

野狐叼走空药篓，雾中留下一条向山路延伸的足迹。你把蓝线收好，先带白叶草回药铺。

## 选项

- [回药铺照料伤者](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.battle-victory.return"} -->
