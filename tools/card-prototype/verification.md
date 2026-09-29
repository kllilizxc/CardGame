# 样卡验证记录

2026-09-26。范围仅为 CR_001 的独立卡面实验。

- 已实际生成一张无字插画，并保存原图与完整提示词。
- 实验 TypeScript 检查通过：`bun node_modules/typescript/bin/tsc --project tools/card-prototype/tsconfig.json --noEmit`。
- 通过 browser-harness 在 Chrome 中实际查看分层卡面；发现并修复 Canvas 模式中文字 resolution 后置设置造成的放大错误。
- 点击攻击 +1 和受到 1 点伤害，画面与输入从 4/2 变为 5/1；刷新后草稿保持 5/1。
- 切换游戏原版与本次组装，原版使用现有 CardSprite，返回后样卡正常显示。
- 移动裁切滑条到 1.37×，确认主体构图变化；恢复初始样卡后回到 1×、4/2。
- 输入超长中文名称，实际出现超出标题区提示，PNG 导出按钮禁用。
- 实际查看深色、浅色背景及 390px 窄视口；窄视口没有页面横向溢出。
- 实尺寸切换完成后，卡面容器实测为 180 CSS px 宽。
- 实际点击 PNG 和参数导出，核对下载完成、PNG 540×780、JSON 中名称/数值/裁切与初始样卡一致。自动化浏览器下载需使用 Windows 原生反斜杠路径；该环境问题已解决。
- 成品见 [卡面](./output/CR_001-assembled.png)、[调试参数](./output/CR_001-card-face-draft.json)，原图与成品哈希记录在 [manifest](./manifest.json)。

未运行全量测试。未改写卡池、套牌、战斗效果或存档；未验证实战效果触发、卡牌平衡、跨平台字体一致性、所有卡种与所有战斗显示模式。未新增或启用 Worka 自动工作流。
