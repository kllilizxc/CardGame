---
title: 药柜边的辨脉课
scene: true
nodeId: scene.qa-fog.pulse-lesson
chapter: 第一章
location: 青云宗山门
sublocation: 雾林药铺
locationId: location.qingyun-sect-gate.archway
sublocationId: sublocation.fog-clinic
timeHint: 白天
onEnter: [{"kind":"once","eventId":"event.qa-fog.pulse-lesson","effects":[{"kind":"adjustAttribute","attribute":"医术","delta":2},{"kind":"setFlag","flag":"qa-fog.learned-pulse","value":true}]}]
backgroundAsset: assets/story/qa-fog/apothecary-interior-v1.png
---
# 药柜边的辨脉课

狐爷爷扶着药柜，教你从呼吸、腕脉和指尖的颜色判断毒势。学会辨脉后，你的医术提升 2 点；真正施针仍需银针和白叶草。

## 对话

- 狐爷爷：先别急着拿针。看我的呼吸，是急，还是乱？ <!-- story-line: {"id":"line.qa-fog.pulse-lesson.001","speakerId":"npc.qa-fog-fox"} -->
- 主角：呼吸不急，可每隔几下就会停顿。 <!-- story-line: {"id":"line.qa-fog.pulse-lesson.002","speakerId":"player"} -->
- 狐爷爷：再看指尖。紫色只到第一节，毒还没有走到心口。 <!-- story-line: {"id":"line.qa-fog.pulse-lesson.003","speakerId":"npc.qa-fog-fox"} -->
- 主角：难怪手会发抖，脉却还稳得住。 <!-- story-line: {"id":"line.qa-fog.pulse-lesson.004","speakerId":"player"} -->
- 狐爷爷：你看明白了。记住，下针之前还要备好银针和白叶草。 <!-- story-line: {"id":"line.qa-fog.pulse-lesson.005","speakerId":"npc.qa-fog-fox"} -->
- 主角：我先去采药，再回来试。 <!-- story-line: {"id":"line.qa-fog.pulse-lesson.006","speakerId":"player"} -->

## 选项

- [记住要领，回到药柜前](./qa-fog-diagnosis.md) <!-- story-choice: {"id":"choice.qa-fog.pulse-lesson.return"} -->
