---
title: 退回林缘
scene: true
nodeId: scene.qa-fog.battle-defeat
chapter: 第一章
location: 青云宗山门
sublocation: 白叶草林地
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"once","eventId":"event.qa-fog.mist-fox-defeat","effects":[{"kind":"setFlag","flag":"qa-fog.mist-fox-resolved","value":true}]}]
backgroundAsset: assets/story/qa-fog/whiteleaf-clearing-v1.png
---
# 退回林缘

野狐占住药篓，你只得避开它，退到林边。好在怀中的两株白叶草没有丢失，救治狐爷爷仍来得及。

等雾散了再查药篓也不迟。眼下先把药草送回去。

## 选项

- [回药铺照料伤者](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.battle-defeat.return"} -->
