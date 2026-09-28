# 卡匣问心：正式游戏接入

正式入口是 `src/main.tsx → GameApp → game/main.ts`。文心素材由 `Preloader` 载入，供主菜单、大地图、据点、剧情、卡牌及战斗共用。运行时素材位于 `public/assets/wenxin/`；绘制适配器 `materials.js` 不含原型的自动战斗脚本。

## 接入范围

- 主菜单使用卡匣图；大地图、据点与剧情使用共用像素背景和灰绿、旧金配色。
- 所有卡牌视图使用共用卡框，卡名取自当前卡牌数据。已明确选择的卡面变体继续通过 `cardFaceAppearance` 保留。单位卡仍用原有攻击、生命和功法交互。
- 单位卡依据内容 ID 映射到灵狐、幼鹰、玄冰龟、烈焰狼、弟子与长老造型；未映射的卡仍保留卡牌视图。
- 战斗舞台沿用 640×360 透视投影和左右三槽。卡牌拖拽、召唤、攻击、受击及退场仍调用原战斗事件，伤害由原回调结算。布局中的左右场地区域与立绘站位对齐。
- 剧情立绘由 `WenxinStoryStage` 显示，分支、奖励、存档与预览启动继续由主线系统管理。

卡框来自已确认原型的 Canvas 输出，系列提示词位于 `public/assets/wenxin/series-prompts.json`。玄冰龟与烈焰狼的提示词分别位于 `series-turtle-prompt.json` 和 `series-wolf-prompt.json`。动态纹理使用 `NEAREST`，正文仍保持常规字体渲染。

## 验证

本次移入 main 后，素材映射、卡面偏好、地图、据点、战斗入口及当前剧情的定向测试通过，`bun run build-nolog` 通过。全仓 `tsc --noEmit` 仍有既有诊断；新增素材模块没有类型诊断。main 的浏览器实机画面还需在可连接的 browser-harness 环境中核验。
