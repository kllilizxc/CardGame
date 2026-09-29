# CardGame 预览运行说明

默认入口：web。权威 v2 项目描述为 [preview.config.mjs](./tools/preview/preview.config.mjs)。候选必须提供 game 仓库的确切 Git 提交；Worka 管理独立工作树、端口、依赖准备、进程与状态。

剧情候选可同时指定 `storyId`、`entryHubId` 和 `entryActionId`。预览链接会从内容目录定位该据点，再通过据点已有的剧情行动进入故事；普通游戏链接仍从主菜单开始。

单卡候选由制作服务自动登记到原试玩便笺。URL 按 project、candidate、commit、profile 隔离存档。自动 verify 检查游戏入口、目录、目标卡定义、两主题贴图和默认可玩卡组；实际剧情与战斗体验仍需在试玩便笺核对。正式源码采用只在对应功能进展项中确认。

[preview.mjs](./tools/preview/preview.mjs) 仅兼容旧 v1 候选，不作为新候选交付方式。
