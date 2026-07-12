---
id: G-4493b889-d235-4331-9f10-ecf2af04e31d
title: 将整体UI风格改成更古风游戏主题，更友好
lifecycle: done
priority: 0
contractRevision: 4
completionAttentionId: completion-ui-theme-refresh-fed425c3-9230-4579-a725-5ae376d33022
---
## Objective

- 有一套UI组件库
- 风格更加古风游戏像素
- 文案数量，字号，按钮大小更友好，界面更精简

## Constraints

- None recorded.

## Non-Goals

- None recorded.

## Success Criteria

- Planner must define measurable success criteria.

## Accepted Inbox Instruction EV-234a80b9-a4be-47cc-b714-35ab26e815f9

进入秘境->管理卡组->返回->确认带入秘境 这条路径会报错

## Accepted Inbox Instruction EV-f9235410-4a0b-452a-afd8-e26d7f5fe617

还是报错：
phaser.js?v=4078f318:8456      Phaser v3.90.0 (WebGL | Web Audio)  https://phaser.io/v390
installHook.js:1      Phaser v3.90.0 (WebGL | Web Audio)  https://phaser.io/v390
phaser.js?v=4078f318:17957 Uncaught TypeError: Cannot read properties of undefined (reading 'sys')
    at Rectangle2.disableInteractive (phaser.js?v=4078f318:17957:32)
    at ExpeditionScene.setEntryTransitionBlocker (ExpeditionScene.ts:563:41)
    at ExpeditionScene.destroyDepartureHandoffOverlay (ExpeditionScene.ts:583:14)
    at ExpeditionScene.init (ExpeditionScene.ts:144:14)
    at SceneManager2.bootScene (phaser.js?v=4078f318:110712:34)
    at SceneManager2.start (phaser.js?v=4078f318:111271:26)
    at SceneManager2.processQueue (phaser.js?v=4078f318:110590:37)
    at SceneManager2.update (phaser.js?v=4078f318:110768:26)
    at Game2.step (phaser.js?v=4078f318:8624:32)
    at TimeStep2.step (phaser.js?v=4078f318:9078:26)

## Accepted Inbox Instruction EV-36d017ab-a7d5-489f-9fcc-df31daa51273

同样路径还有报错：
