# CardGame 工作台实施与验收记录

验收日期：2026-09-19（Asia/Hong_Kong）。项目：`/home/kllilizxc/Code/CardGame`；工作台实现：`/home/kllilizxc/Code/dsh-worka-bench`。

## 已安装的范围

原卡牌游戏桌面已升级为知识库、卡牌库、资源库、AI 资源生产、Todo、执行台、试玩七张主便笺。现有知识库、Todo、执行台、试玩身份与原连接 ID 保留，功能进展及其他辅助便笺保留。十四条主协作连接均关闭自动监听，区分五条资料参考和九条交办／回执。

Markdown 和现有卡牌 JSON 仍为项目内权威文件。正式资源使用不可变版本文件与清单；采用版本不改已有正文引用。候选、制作单和 Todo 持久化在 Worka 数据目录。深链接携带内容定位，不作为执行入口。

知识库提供自由 Markdown 编辑、普通链接和图片、中文及短语搜索、反向引用、有限关系图、移动影响与版本冲突保护。图库与卡牌查询在 SQLite 中过滤、排序和分页，前端列表保留最多五页。生产便笺负责制作输入、候选和采用；实际运行仍交给执行台。试玩沿用原候选预览的完整操作和技术信息，体验反馈入口通往 Todo。

## 自动验证

- `bun run typecheck`：通过。
- 知识库、卡牌库、资源库、生产、Todo、执行台及试玩视图的独立严格 TypeScript 检查：通过。
- `bun run build`：通过；真实宿主加载扩展并成功发布便笺。
- 内容、图库动作、媒体、实际文件生产交付集成、连接、媒体授权、HTTP Range、试玩视图及连线布局：58 项通过。
- 工作流：12 项通过，包括 10,000 条 Todo、10,000 条制作记录、重复请求、重启恢复、过期回执、采用失败和草稿不触发 AI。
- 满量内容测试：1 项通过。上述定向检查合计 71 项。

真实文件集成测试使用实际 ContentService 与 WorkflowService，依次接收制作结果、登记候选、解析候选媒体、采用正式资源、读取正式文件，并核对返回的候选／资源／版本身份。仅外部 AI 执行被替换为测试产物，不用伪造的资源后端回执代替集成。

完整 `bun test` 曾尝试，但执行台相关断言与预览生命周期测试出现失败及超时，运行已终止；本记录不宣称整仓回归全绿。

Luna max 子代理在干净的 detached `HEAD aa18bc1` 工作树中对照复跑 `tests/execution-note.test.ts`：基线与当前树均为 84 pass／63 fail／600 expects。该文件间接导入候选预览测试；一组失败由基线已要求 `originNoteId`、旧 fixture 未提供导致，其余执行状态和 runCalls 断言在基线也复现。本轮未改动这些模型和测试。另有 core execution 测试在 Bun 下无法加载 `node:sqlite` 的运行环境错误，不能据此声明 Node 24 宿主失败。

收尾时独立复跑 `tests/preview-lifecycle.test.ts`，8 项全部通过（10.17 秒）；模板严格类型检查及 28 项知识库／试玩相关检查也再次通过。主桌面读回核验为 7 张有效运行便笺、14 条 `watch:false` 主连接。最终安装备份为 `.workbench/backups/cardgame/2026-09-18T20-16-30-664Z`。

## 后端容量实测

固定机器：Intel i5-12600KF、16 个逻辑处理器；WSL2 Debian，Linux 6.6.87.2，报告内存约 31 GiB；Bun 1.3.13。宿主运行环境 Node 24.21.0。

测试数据在独立临时目录生成：3,000 篇中文 Markdown、3,000 张卡牌、20,000 项图片、600 项音频、实际 SQL 计数 100,000 条资源版本。其中一项资源有 5,000 条版本，用于验证历史分页。图片为有效 64×64 PNG；这验证条目量与分页，不等同于大尺寸原画或长音频的解码压力。

| 指标 | 实测 |
|---|---:|
| 首次建立内容索引 | 30,645 ms |
| 中文文档查询，100 条 | 5 ms |
| 卡牌查询，100 条 | 6 ms |
| 资源查询，100 条 | 36 ms |
| 历史版本查询，100 条 | 2 ms |
| 连续 20 轮有界查询 | 554 ms |
| 进程 RSS：开始／索引就绪／连续查询后 | 83／226／264 MiB |

这些是本机一次运行的观测值，不是跨机器性能承诺，也不是延迟分位数。初次容量运行发现测试数据的版本数量公式少生成 10,000 条；修正 fixture 后按实际数据库计数重新运行并通过。

## 浏览器验证

真实 CardGame 资源库已成功加载缩略图及原图。资源跳转知识库显示独立引用目标与来源列表，不读取图片作为 Markdown。“记到 Todo”显示资源 ID 和明确版本，仅打开草稿，事项数量仍为零。

满量资源浏览在隔离的“CardGame 容量验收（临时）”桌面进行，Chrome 153.0.8010.50。连续加载 101 页（约 10,100 个条目）并滚动到每页底部，列表始终最多保留 500 条，最终 DOM 中只有 24 个资源项和 24 个图片元素、零音频元素；稳定后其中 12 张可见图片完成加载。经主动 GC 后，便笺渲染进程的 JavaScript 堆在第 1／21／61／101 页分别为 23,552,440／24,501,516／24,729,792／24,810,416 字节，约从 22.5 MiB 增至 23.7 MiB。这是 JS 堆，不是浏览器进程总内存。

另行验证了从多页列表底部筛选为单条结果：显示一项，滚动位置归零。5,000 条历史版本按 100 条加载，查看旧版本不会采用它。真实卡牌并排比较已读取完整 JSON，包括规则效果和数值。

Markdown 的中文跨文件锚点能定位到目标标题；相对图片先加载预览，点击后显示原图。实际浏览发现并修复了相对图片重复解析路径、列表数据引用不稳定导致图片反复重建，以及列表缩短后虚拟滚动保留旧位置的问题。

临时容量桌面已归档、项目登记已移除。停止本次启动的宿主后，只删除经路径核对的 scale 项目数据库行和两处临时 fixture 目录；正式 cardgame 数据保留，SQLite 完整性检查返回 ok。宿主已重新启动，主桌面七张便笺已安装最终修复。容量测试未交办真实 AI 任务。

## UI 纠正（用户反馈后）

第一版过度重做知识库，并用 `playOnly` 页面隐藏了预览的既有操作。根据用户反馈，知识库恢复原“资料入口＋正文”两栏、原 compact 资料摘要和默认首入口阅读。搜索与目录按需展开，文件管理放入菜单；恢复资料间返回、重新读取及 Mermaid，项目内 Markdown 仍使用同一持久内容后端。预览移除简化页面，恢复候选／运行入口、地址、刷新、状态、技术详情、重启、停止、全屏和执行台修复；`feedbackInTodo` 只控制 Todo 草稿快捷入口。

浏览器检查了资料链接与返回、项目链接与返回、搜索展开、源码编辑入口和 390px 窄屏正文，窄屏滚动宽度等于视口宽度。主桌面预览空态已使用原完整工具栏。知识库／候选预览定向测试 30 项通过，项目与模板类型检查通过。定向安装仅发布 knowledge 与 preview，保留其它便笺布局和连接。

## 后续边界

后续按用户进一步要求，知识库已移除搜索入口、文件树和文件结果列表；目录统一由 Markdown 链接组织。新增 `CardGame/public/data/docs/index.md` 收录 12 份游戏资料，并补入 `knowledge/index.md` 链接。侧边栏为设计规范、记忆、CardGame 项目知识、游戏资料四个索引入口。浏览器读回确认搜索／文件树控件数为零，游戏资料索引含 12 个链接，进入正文与返回索引正常；项目和模板类型检查通过。

`content.sqlite` 当前同时保存检索数据、移动后文档身份及候选登记，是混合持久库，不能直接当缓存删除。保留数据库重新扫描可更新派生索引；备份须包含整个 Worka `plugins/cardgame-content` 数据目录。独立可丢弃索引与身份账本的物理分库尚未实施。

模型选择、具体素材生成链、Markdown 到可玩剧情的编译约定按规划留待后续。现有游戏预览适配器已启动并验证入口和内容数据，浏览器已见游戏主菜单；这不代表全部剧情和战斗行为均已验收。

## Todo UI restoration (2026-09-19 03:45 UTC)

- Restored the original todo-note compact view and three-column kanban, categories, priorities, inline editing, quick entry and delegation controls. The durable CardGame workflow remains the data source.
- Added legacy action adapters with revision checks; deleting retains an audit record and refuses active delegated work. Clear-completed uses explicitly loaded IDs.
- Validation: 4 compatibility tests and 12 workflow tests passed; root and template TypeScript checks passed; build and diff checks passed. Browser confirmed the live three-column board and column quick-add form with priority controls. No AI generation was triggered.
- Published only the existing Todo note; identity and connections preserved. Latest backup: `.workbench/backups/cardgame/2026-09-19T03-45-03-192Z`.
