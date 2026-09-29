---
title: 雾中交锋
scene: true
nodeId: scene.qa-fog.battle-pending
chapter: 第一章
location: 青云宗山门
sublocation: 白叶草林地
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
backgroundAsset: assets/story/qa-fog/whiteleaf-clearing-v1.png
---
# 雾中交锋

卡匣展开，野狐跃上石头。若交锋中断，你还可以退回林缘照料伤者；胜负会由战斗结算。

## 选项

- [退回林缘](./qa-fog-gather.md) <!-- story-choice: {"id":"choice.qa-fog.battle-pending.retreat"} -->
- [战斗胜利后继续](./qa-fog-battle-victory.md) <!-- story-choice: {"id":"choice.qa-fog.battle-pending.victory","visibleWhen":{"kind":"flag","flag":"qa-fog.manual-battle-result","expected":true}} -->
- [战斗失利后继续](./qa-fog-battle-defeat.md) <!-- story-choice: {"id":"choice.qa-fog.battle-pending.defeat","visibleWhen":{"kind":"flag","flag":"qa-fog.manual-battle-result","expected":true}} -->
