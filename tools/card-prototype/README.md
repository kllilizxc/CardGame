# 单卡组装实验：青云山灵狐

这是可运行的单卡实验，尚未接入正式卡池或 Worka 工作流。

在游戏项目根目录启动：

```sh
bun run dev-nolog --host 127.0.0.1 --port 18080 --strictPort
```

打开 `http://localhost:18080/tools/card-prototype/`。

- 原始定义直接读取 `public/data/cards/units.json` 中的 `CR_001`，境界与星级复用游戏现有 helper。
- 样卡继承游戏的 `BaseCardSprite`，使用 Phaser 分层绘制；“游戏原版”调用现有 `CardSprite`，可比较布局。
- 插画由本次会话内置 imagegen 生成一次，完整提示词保存在 `art-prompt.txt`，源图保存在 `assets/spirit-fox-v1.png`。后续调试只在本机重组装。
- 可修改名称、攻防、显示文案、短句、放大与上下取景；草稿保存于独立 localStorage key，与游戏存档隔离。
- 修改文案不会更新可执行效果；攻击/伤害按钮验证显示更新，不模拟战斗结算。
- 可以切换实尺寸、原版对照、深浅背景，并导出当前 PNG 与调试参数 JSON。
- 过长名称/文案会显示诊断并阻止 PNG 导出，避免把截断的内容当成有效成品。
- 字体优先使用本机楷体，未复制系统字体。跨平台定稿前仍需固定可分发的中文字体。

仅检查本实验及直接导入代码：

```sh
bun node_modules/typescript/bin/tsc --project tools/card-prototype/tsconfig.json --noEmit
```

生成链和正式游戏接入在样卡调试确定后再提取。当前没有新增 Worka 生产能力，没有执行第三方图像 API 调用。
