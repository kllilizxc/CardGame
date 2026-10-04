# CardGame 内容工作台

七张主便笺共用项目文件与两个持久索引。Markdown、卡牌 JSON、采用的资源及版本清单属于游戏项目；制作请求、Todo、未采用候选和缓存属于 Worka 数据目录。便笺状态只保存当前视图与定位。

## 安装和升级

在 Worka 仓库运行：

```sh
bun scripts/install-cardgame-workbench.ts --prepare --project /home/kllilizxc/Code/CardGame
bun run build
bun scripts/start.ts --replace
# 在另一个终端运行
bun scripts/install-cardgame-workbench.ts --install
```

首次登记会建立 `CardGame/knowledge/index.md`、使用说明及预览适配器。已有同名文件保留。项目根由宿主 `.workbench/cardgame-projects.json` 登记，便笺不能自行授权任意目录。

安装器在原桌面查找或创建七张便笺，保留已有身份与状态；备份在 `.workbench/backups/cardgame/`，安装记录在 `.workbench/cardgame-workbench.json`。重复安装会检查便笺源码是否在上次安装后被用户修改，避免覆盖用户编辑。新桌面会建立七组 Skill 连线；已有旧连线的桌面须先盘点、规划并运行 `scripts/migrate-cardgame-skill-connections.ts`，安装器不会建立重叠关系。原有设计规范、记忆和功能进展入口保留。

## 内容和边界

- 内容库提供中文搜索、游标分页、Markdown CAS 保存、引用定位、重命名影响预览、卡牌校验及资源版本查询。
- 列表默认 100 条，索引负责过滤和排序。正文与媒体独立读取。局部关系最多 100 个节点。
- 媒体使用文件级签名 URL；不把宿主凭证或文件正文放入连线。图片生成 256 像素以内的静态缩略图；像素放大使用最近邻。音频元信息使用实际文件提取，选中后才解码波形。
- 目录监听排除依赖、构建产物和符号链接，逐目录注册非递归监听器。修改只刷新索引，不启动模型。
- 单卡试玩候选把所需素材写入隔离的 Git 快照；在功能进展确认该候选时，采用服务才将对应素材写入正式项目的 `public/assets/` 与 `asset-manifest.json`。通用资源的旧直接采用入口暂不可用于正式项目。
- 缩略图和检索数据可重新生成。当前 `content.sqlite` 同时保存移动后文档的稳定身份及未采用候选的登记信息，不能直接当缓存删除；重新扫描项目会保留这些身份。`cardgame-workflow.sqlite` 保存持久业务记录。备份应包含整个 `plugins/cardgame-content` 数据目录，而不只是游戏项目。

## 协作连接

`connections.ts` 定义七组持续的 Skill 关系：待办与执行台、执行台与试玩、制作与执行台、制作与资源库、待办与制作，以及两组按需读取的资料关系。明确交办、候选登记和资源采用使用带稳定请求 ID 的事件；连线脚本核对来源、调用公开能力并写回实际回执。资料关系没有自动事件。

Todo → 执行台交办开发事项；Todo → AI 资源生产只建立草稿。制作单通过执行台生成，执行结果回原制作单，再分别登记候选和采用资源。执行台交付明确版本的候选给试玩，运行回执回到原执行任务。打开引用、打开 Todo 草稿、查看原任务属于导航，不触发模型。

## 定时巡检

`schedules.ts` 定义一条每日巡检 schedule（`cardgame:inspection`，每天 07:43 触发执行台便笺）：agent 调用内容库 inspection 查询五类问题（broken-link、scene-dead-end、orphan-asset、card-missing-art、asset-missing-metadata），high/warning 逐条登记为"巡检"类 Todo，info 只计数；巡检只报告，不修改项目文件。安装器按稳定 ID 幂等 upsert，用户暂停后重装不会恢复运行。

## 试玩

沿用原候选预览的完整 UI：候选与运行入口、地址栏、状态、检查证据、启动／停止／重启及执行台技术处理。`feedbackInTodo:true` 仅增加体验反馈的 Todo 草稿入口；不要用简化页面替代这些操作。

`preview/preview.config.mjs` 是 v2 游戏适配器，安装到游戏知识库的 `tools/preview/`。单卡制作生成可检出的独立 Git 提交，并自动登记到原试玩便笺；宿主管理工作树、端口与进程。验证核对游戏入口、目标卡定义、两主题贴图和默认卡组。正式采用还要求用户在对应功能进展项确认精确候选。

每个候选有两个预览端：`web`（Vite 开发服务器，带 HMR，本机迭代用）与 `static`（`serve-static.mjs` 按候选 commit 缓存 `vite build` 产物并静态服务，远程分享用——请求少、哈希产物长缓存、public 素材走 ETag 协商）。源码变化后预览台显示"版本待更新"，重新启动 `static` 端即重建。

知识库普通 Markdown 文档可用 `stageDocumentsCandidate` 独立建立隔离候选，无需绑定剧情。输入沿用文档路径、全文与 `expectedRevision`；候选保留链接和反向引用，在原试玩便笺检查游戏入口及确切文档字节，功能进展负责确认采用和撤销。资料检查不代表文档已接入游戏玩法。

Worka 到 Codex 内置生图的自动交接已在可丢弃桌面以一张丹药实测；其他卡类仍需逐类验证。Markdown 剧情编译支持稳定 `storyId`、`nodeId`、选项旁 `story-choice` JSON 元数据、条件/效果、初始状态、跨剧情共享事实和 `backgroundAsset` 场景背景。启用 `shareFactsAcrossStories: true` 的剧情必须在入口声明 `storyId`（或由创作调用明确传入），为每个可达场景声明 `nodeId`，并为每条选项在 `story-choice` 中声明 `id`；入口声明与调用传入的 `storyId` 也必须一致。缺项或冲突会使编译报错并保留上一份可玩产物，避免移动文档或插入选项后改变存档含义。旧非共享场景仍可沿用路径/顺序 ID。知识库 `stageStoryCandidate` 在隔离副本保存可达场景、编译、接入 Hub，并可把已登记的 PNG 候选素材写入同一确切游戏候选。`grantCard` 奖励需要共享事实、稳定领取 ID 和已存在的卡牌 ID；候选把卡牌定义固定为只读依赖。候选身份还包含复制到试玩工作区的源码 Git tree，运行时代码变化需重建候选。正式游戏只经原功能进展确认采用；`compileStory` 在已登记项目上只开放 `dryRun`。

剧情候选登记到原试玩便笺时，会把实际接入的 Hub 与行动 ID 一并传给游戏预览链接，直接打开该剧情。未指定 `launch` 的已有剧情从内容目录里的现有行动确定入口；对应 Hub 文件也纳入候选依赖。适配器的 `story-route` 检查核对这一个入口，而非仅确认游戏里存在同名剧情。

同一剧情候选可用 `referenceDocuments` 携带普通 Markdown 索引页、人物资料等。它们沿用知识库现有文档、链接和版本校验，不参与场景编译；候选记录其文件依赖，确认采用与撤销一起处理。场景仍放在 `documents`，普通资料不得标记 `scene: true`。已有游戏入口的故事也可只提交资料修订，传 `documents: []`，其候选仅把实际变化的资料文件用于采用。当前这是原生对话可调用的候选能力，没有恢复知识库的手工源码编辑器。

`stageStoryCandidate` 的可选 `copyEdits` 可以把既有 Hub 和 `public/data/world/world-map.json` 的玩家可见文案与剧情一起放进隔离候选。每份文件要求当前 SHA-256，按稳定对象 ID 只修改已存在的描述、摘要、详情、行动名称或状态文案；文件路径、路由 ID、类型及玩法字段不能从此入口改动。相关文件进入候选变更和采用依赖，试玩的 `story-copy` 检查比对服务内容与确切候选；目标文件变化会使采用拒绝。这个接口尚未代替真实游戏中的各路线文案验收。

长对白场景可在 Markdown 的 `## 对话` 下逐句写 `story-line` 元数据，提供稳定台词 ID 与说话者 ID。编译后与简介、选项分开保存；游戏每次显示少量台词，Story/Hub 会话保存当前台词 ID。`stageStoryCandidate` 的可选 `npcs` 随同对白写入候选人物目录；非主角说话者必须存在，显示名称按人物目录解析。这个增量尚未证明真实章节的 500–1,000 条对白、章节分包和低内存运行。

选项条件可用 `actorAbility` 引用人物目录中的具体能力。候选服务校验人物 ID 与能力名、固定目录版本；v2 预览核对服务端读取的目录和人物能力引用。隔离合成样例已覆盖 20 章、20,000 条对白、3,000 个选项、5,000 个被读写引用的状态键，以及局部保存和分页；它不能代替真实文学章节、浏览器长期阅读及章节分包验收。

`itemCount` 条件读取当前游戏仓库；`grantItem`/`consumeItem` 效果使用稳定结算 ID，并与同一选择产生的卡牌奖励一次写入仓库。候选固定道具目录版本，预览检查引用是否存在。`stageStoryCandidate` 可用 `items` 在隔离候选中新增法宝、工具、消耗品、任务物和材料；定义必须被当前剧情领取或候选配方产出，作为材料输入的新道具仍需剧情领取途径，目录与剧情一起确认或撤销。新增道具可显式设置布尔值 `droppable`；游戏默认允许法宝、消耗品和材料丢弃，工具和任务物默认保留。法宝/工具可在候选中声明稳定 `equipSlot` 和有限数值的 `attributeModifiers`；游戏准备与探索背包可装备/卸下，剧情条件从基础属性和装备来源计算有效属性，装备状态随仓库和探索存档流转。消耗品可在候选中声明限量的 `useEffect: { kind: 'heal', amount }`，远征背包仅在受伤时允许使用，生命与道具数量在同一 active run 存档中变化；战斗开始/胜利回程沿用该生命值。已验证现有凝气膏的剧情消耗、归返绳只检查不消耗、刷新与重选不重复扣除；背包容量、丢弃、装备和独立使用有定向测试。装备与用药的界面操作已在隔离游戏副本点击，尚未在原 Worka 试玩便笺的确切用药候选中验收。商店材料交换已在原试玩便笺的确切 QA 候选中实际购买，并从原功能进展界面验证采用和撤销；正式 CardGame 未加入该 QA 报价或用药效果。

`stageStoryCandidate` 的可选 `recipes` 与剧情一起写入隔离的道具目录。配方按稳定 ID 声明材料、灵石成本和道具产物，输入输出必须引用候选目录里的道具；预览的 `story-recipes` 检查核对实际服务内容、候选源码和引用，采用时重新验证依赖。游戏准备页和探索背包可打开制作面板，先预检完整消耗、装备保护及背包容量，成功后一次保存材料、灵石和产物。原试玩便笺的确切 QA 候选已验证制作、材料不足及功能进展中的采用/撤销；正式 CardGame 没有加入该 QA 配方。完整雾林制作内容及用药候选的托管试玩仍待完成。

`stageStoryCandidate` 的可选 `shops` 可把已登记秘境商店的报价与当前剧情放进同一隔离候选。输入必须指向可达的已登记地图节点，报价中的道具与卡牌须在候选目录中存在；商店文件作为变更路径，地图及引用目录作为确切只读依赖。v2 试玩检查核对商店、地图和道具的服务内容与候选源码一致；只有对应功能项确认后才会写入正式项目，撤销恢复原商店内容。

`stageStoryCandidate` 的可选 `quests` 将稳定任务 ID、关联人物、阶段状态和当前目标写入候选任务目录。剧情初始状态、条件和效果使用同一任务 ID 与阶段 ID；候选建立时核对实际引用和人物目录，并要求新增任务剧情启用 `shareFactsAcrossStories`，试玩的 `story-quests` 检查对比服务内容与确切提交。CardGame 剧情场景、据点和大地图的任务日志从同一共享剧情存档读取阶段，选择后、离开剧情及重新进入时显示当前目标；未知旧阶段明确提示资料异常。采用与撤销仍由原功能进展处理，QA 任务不会默认写入正式游戏。

## 验证

```sh
bun run typecheck
bun test tests/cardgame-content.test.ts tests/cardgame-content-inspection.test.ts tests/cardgame-library.test.ts tests/cardgame-media.test.ts tests/cardgame-workflow.test.ts tests/cardgame-production-integration.test.ts tests/cardgame-connections.test.ts tests/cardgame-schedules.test.ts tests/media-capabilities.test.ts
CARDGAME_CONTENT_SCALE=1 bun test tests/cardgame-content-scale.test.ts
CARDGAME_NARRATIVE_SCALE=1 bun test tests/cardgame-narrative-scale.test.ts
```

容量测试只使用独立临时目录，不向真实 CardGame 填充模拟剧情或资源。测试日志报告实测索引、查询数据；浏览器和整仓回归的结论应与这些定向测试分别记录。
