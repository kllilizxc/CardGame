# AI 资源生产

The production note owns briefs, pinned content references, rounds, bounded
candidate references, execution bindings, and the separate adoption fact. A
draft is saved by `upsertRequest`; only the explicit Generate action submits
the immutable requirement snapshot to the existing execution note.

Generation, candidate registration, asset adoption, and game integration are
separate facts. Receiving a completed generation result never marks a Todo
done. Candidates stay references to the asset backend so this note does not
copy media or an unbounded history into note state.

# 卡牌生成与卡面主题

在卡牌库选中卡牌，点击“制作卡面”，或在 AI 资源生产中新建卡牌工作流。新批次通过原生便笺对话生成结构化草稿，随后由宿主 Codex CLI 生图、回填、组装并建立试玩候选。正式游戏只接受在功能进展中确认的确切候选。

插画默认由 Codex 内置 imagegen 生成；若 CLI 不可用，制作单保留可复制任务与手工回填入口。工作流保存于现有制作单，资源复用 CardGame 版本库。主题包括青玉与宣纸，预览、模板版本和游戏动态数值分开保存。支持单位、法器、符箓、场地、丹药和技能；后两类进入战斗槽位与技能栏。

中文 PNG 导出依赖宿主 CJK 字体。可在私有 `cardgame-projects.json` 的项目中配置 `cardFaceFont: {file: "本机字体绝对路径", family: "字体族名称"}`，或使用系统已安装的 Noto Serif CJK SC。字体文件和本机配置不随公共仓库发布。
