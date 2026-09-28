# CardGame 知识库

这里保存自由 Markdown 剧情、设定和制作规范。目录按章节、人物或主题组织，文件之间使用普通 Markdown 链接，图片使用普通图片引用。

- [工作台使用说明](./workbench.md)
- [卡牌生成工作流方案](./card-generation-workflow.md)
- [预览运行说明](./preview.md)
- [资料文档索引](../public/data/docs/index.md)
- [现有剧情编写指南](../public/data/docs/story-authoring-guide.md)
- [雾林遇狐：可玩剧情入口](./qa-fog-entry.md)
- [项目开发约定](../AGENTS.md)

目前游戏继续读取现有运行数据。Markdown 编译为可玩分支的约定（详见 dsh-worka-bench 的 docs/design/cardgame-ideal-desktop-design.md）：

- 文档 frontmatter 里 `scene: true` 表示这篇可被编译为游戏场景；其余文件永远是纯资料。
- 场景内标题为 `## 选项` 的章节下，链接列表即玩家分支；正文其他位置的链接永远只是作者参考。
