# CardGame 工作台（workbench/）

CardGame 项目在 Worka 工作台侧的代码：内容插件、便笺模板、技能连线配方与安装脚本。

这些代码于 2026-10-04 从 [dsh-worka-bench](../../dsh-worka-bench) 主仓库迁出（主仓库 commit `b2f0904` 之前的状态，含 `plugins/cardgame-content/src/content.ts` 一处未提交的本地修改），先落档于独立的 cardgame-workbench 仓库，同日迁入本仓库。迁出原因：worka 主仓库不再承载 cardgame 这类业务/游戏内容代码；cardgame 相关代码与游戏项目及其内容（`knowledge/` 等）同处演进。

## 目录结构（与主仓库原布局一致）

- `plugins/cardgame-content/` — CardGame 内容插件（内容索引、卡牌流水线、技能转换、媒体、预览适配等），索引的项目根即本仓库
- `templates/cardgame-library/`、`templates/cardgame-production/`、`templates/cardgame-todo/` — 卡牌库、卡牌制作、卡牌待办便笺模板（桌面上 cardgame 便笺的源码蓝本）
- `templates/skill-connections/cardgame-*/` — CardGame 相关的技能连线配方
- `scripts/` — CardGame 安装/迁移/激活脚本
- `tests/` — 对应的测试（含 `tests/react/cardgame-mode.test.tsx`）
- `docs/design/`、`docs/verification/` — 从主仓库 docs/ 迁入的 CardGame 设计与验证文档

注意：测试与脚本仍引用主仓库的 `src/`、`sdk/` 等模块（相对路径 `../../dsh-worka-bench/...` 或包名 `@dsh-workbench/runtime`），直接在本仓库运行需要后续接入相应依赖。
