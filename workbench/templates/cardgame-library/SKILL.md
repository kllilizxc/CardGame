---
name: cardgame-library
description: CardGame 知识库、卡牌库和资源库的统一检索与编辑便笺。通过 projectId 读取权威内容索引，使用稳定深链接打开文档、卡牌和资源。
---

# CardGame 内容库

当前实例身份由宿主提供。配置包含 `projectId`、`mode`、各领域便笺 ID，以及可能保留的 `resources` 注册资料。展示查询使用公开 queries；`registerCandidates` 仅登记未采用素材。便笺的 cwd 是已登记的正式项目，即使目录名含 temp 或 clone 也不是候选。原生会话不得用 Bash、Edit、Write、git commit 等文件工具在 cwd 修改内容；宿主会拒绝这些工具。卡牌改动先查询当前卡牌 revision 与 `featureChoices`，调用本便笺 `createCardWorkflow({itemIds:[cardId],featureId,draft?,expectedRevision?})` 得到制作单，再调用生产便笺 `cardWorkflow` 的 `saveCardDraft`、`assembleCardFaces`、`integrateCard`，由服务建立独立候选和登记原试玩便笺。完成试玩后仅由功能进展确认；知识文档和资源改动也须先进入候选闭包，不得直接采用。

知识库使用 Markdown 内部链接作为目录。侧边栏只登记各组资料的 `index.md` 入口；缺少目录时补写索引，保留既有正文和链接。不要用文件树或常驻结果列表替代 Markdown 目录。当前知识库搜索 UI 已按用户要求移除，需要另行确定交互后再实现；不要因后端支持搜索而自行恢复入口。

资源库保留媒体预览、版本浏览、检索、书签和引用定位。旧的资源版本采用、否决回退与元数据直接编辑动作会写正式项目，当前不从界面触发。需要返修时用待办记录具体对象和原因；正式资源改动必须先进入可试玩候选，再由所属功能项确认。

cards 和 assets 模式的展开视图顶部有"变化流"区（查询 `recentChanges`，cards 只看
kind='card'，assets 看 kind='asset'/'version'，点击条目定位到对应选中项）；两模式的
compact 视图同样显示最近 3 条变化，点击经 `cg:` 深链接展开便笺并定位。选中对象通过便笺原生会话上下文传给模型；打开会话或切换选中项不启动模型。不要再添加内容区的讨论入口。这些能力不涉及 knowledge 模式；
knowledge 的视图、compact 与"搜索 UI 不自行恢复"的纪律保持现状。

大正文、卡牌定义和二进制媒体不写入便笺 state。state 仅保留查询、视图、筛选和稳定书签。跨便笺定位使用 `model.ts` 导出的 `encodeContentRef`，格式为 `cg:` 加 URL 编码的 JSON。

## 剧情编译

- 文档 frontmatter 里 `scene: true` 表示这篇可被编译为游戏场景；其余文件永远是纯资料。
- 场景内标题为 `## 选项` 的章节下，链接列表即玩家分支；正文其他位置的链接永远只是作者参考。
- 新场景在 frontmatter 中写稳定 `nodeId`；需跨场景共享主角事实时，由同一剧情入口写 `shareFactsAcrossStories: true`。入口可用单行 JSON `initialState` 声明初始属性、关系、知识和任务阶段，场景可用单行 JSON `onEnter` 声明效果。旧文档没有这些字段时继续使用原路径 ID，不替用户批量改写。
- 场景背景使用 frontmatter `backgroundAsset: assets/story/<作品>/<版本>.png`；先把真实 PNG 登记为候选素材，再把 `{candidateId,path:"public/assets/story/<作品>/<版本>.png"}` 放进同一次剧情候选的 `assets`。路径按版本新建，不覆盖旧素材；编译与试玩会检查文件存在且与候选一致。没有真实文件时不要填写背景路径或冒称素材已完成。
- 需要条件或后果的选项独占一行，在 Markdown 链接后附 `<!-- story-choice: {"id":"choice.stable", "description":"简短说明行动或前提", "visibleWhen":{...}, "enabledWhen":{...}, "effects":[...]} -->`。`description` 可省略；提供时应给玩家可理解的说明，不重复按钮文字或暴露内部 ID。显式 ID 不随选项排序变化；角色知识使用 `knowledge` 条件及 `learnKnowledge` 效果，任务阶段使用 `questStage` / `setQuestStage`，单次结算用 `once` 包住效果。编译器与游戏使用同一 `StoryState` 规则词汇；未知规则报错，不作为自由文本跳过。
- 首次奖励已有卡牌时，在 `once.effects` 里使用 `{"kind":"grantCard","grantId":"quest.stable.reward","cardId":"CR_001","count":1}`，并在入口启用 `shareFactsAcrossStories: true`。`grantId` 是跨重试、重访和故事重开的唯一结算身份；不能把同一 ID 改指另一张卡。候选会核对 `cardId`、固定卡牌定义为只读依赖，试玩中领取后进入牌库，功能进展确认才把剧情内容写入正式游戏。
- 连续对白写在 `## 对话` 下，每句独占一行：`- 狐爷爷：桥上有雾。 <!-- story-line: {"id":"dlg.fox.001","speakerId":"npc.fox"} -->`。`id` 在整段故事里唯一且修改台词或插入前文时保持不变；`speakerId` 引用稳定人物身份，可加 `emotion`。简介正文写在该章节前，选项仍写在后面的 `## 选项`。编译器拒绝缺失或重复的对白 ID；游戏按段显示并以当前对白 ID 续读。
- 新人物随剧情候选的 `npcs` 参数提交，如 `[{"id":"npc.fox","name":"狐爷爷","description":"雾林医者","goal":"找回药方","abilities":{"医术":8}}]`。人物必须实际出现在本剧情对白，且对白的非主角 `speakerId` 必须存在于候选人物目录；候选同时固定或新增 `public/data/world/npcs.json`。游戏显示目录中的人物名称，修改名称不要求替换每句台词。已有角色直接引用其稳定 ID，不重复创建。需要人物立绘时，可在该人物上加 `portraitAsset:"assets/story/<作品>/<版本>.png"`；先登记真实 PNG 素材候选，再把 `{candidateId,path:"public/assets/story/<作品>/<版本>.png"}` 放入同一次剧情候选的 `assets`。游戏按 `speakerId` 显示立绘，玩家发言时收起；无立绘的人物继续使用现有画面。
- 人物能力门槛使用 `{"kind":"actorAbility","actorId":"npc.fox","ability":"医术","operator":">=","value":7}`，写入选项的 `visibleWhen` 或 `enabledWhen`。能力名和人物 ID 必须在候选人物目录中真实存在；缺失引用会拒绝候选。游戏以人物目录能力为初值，续读时保留存档里的数值。
- 道具数量门槛使用 `{"kind":"itemCount","itemId":"consumable.spirit-salve","operator":">=","value":1}`，从当前游戏仓库读取数量。效果可用 `{"kind":"consumeItem","transactionId":"quest.fox.salve","itemId":"consumable.spirit-salve","itemType":"consumable","count":1}` 或 `grantItem`；结算 ID 在整篇剧情唯一，奖励/消耗建议放入稳定 `once` 事件。目录 `public/data/world/items.artifacts.json` 必须包含对应 ID 和类型；剧情仓库变更需要 `shareFactsAcrossStories: true`。工具检查只写 `itemCount`，不附加 `consumeItem`。新道具随剧情候选的 `items` 参数提交，如 `[{"id":"tool.fox-silver-needle","name":"银针","itemType":"tool","type":"辨伤工具"},{"id":"consumable.white-leaf-herb","name":"白叶草","itemType":"consumable"}]`；每件新道具都需要在本剧情中被引用且有 `grantItem` 获得途径，不直接修改正式道具目录。需要图标时，可在任意新道具上加 `iconAsset:"assets/items/<分类>/<版本>.png"`；先登记真实 PNG 素材候选，并将 `{candidateId,path:"public/assets/items/<分类>/<版本>.png"}` 放进同一次剧情候选的 `assets`，游戏背包按道具目录引用显示。
- `compileStory` 的 `dryRun: true` 仍可检查；写入编译产物必须先进入候选，当前旧正式写入口会被拒绝。
- 制作新剧情或改写现有场景时，用本便笺的 `stageStoryCandidate({featureId,storyId,entryPath,brief,documents,referenceDocuments?,assets?,npcs?,items?,shops?,copyEdits?,launch?})`：`documents` 是本批改动且属于可达场景的 Markdown 路径、全文和当前 `expectedRevision`（新文件为 null）；`referenceDocuments` 是同一候选需要的新建或修改的普通 Markdown 索引页、人物资料等，使用相同的路径、全文和版本格式，不标记 `scene: true`。已有可玩剧情只修改资料时，可传 `documents: []`，但仍需使用该剧情现有的 `storyId`、`entryPath` 和游戏入口。章节、人物和主题仍用普通链接组织，不建立专用目录；场景和资料合计最多 64 篇。`assets` 只列这些场景实际引用的新背景、对白人物的新立绘和新道具的图标；`items` 的新增道具可按玩法明确设置布尔值 `droppable`，工具和任务物默认不可丢弃；法宝/工具如需装备，给出稳定 `equipSlot` 和 `attributeModifiers`（属性名到有限数值修正），不将加成写进基础属性；`launch` 指向已登记游戏中现有 Hub 的 `hubPath`、`locationId`、稳定 `actionId` 与入口 `label`。服务在隔离副本保存、编译、接入 Hub，登记确切候选并交给原试玩便笺；不要直接调用正式 `saveDocument` 或写文件。编辑已有剧情且游戏已有对应 Hub 行动时可省略 `launch`。
- 普通索引、人物资料或设定文档若不属于某段剧情，使用 `stageDocumentsCandidate({featureId,brief,documents:[{path,content,expectedRevision}]})`。`path` 是 `knowledge/` 下原有的 Markdown 路径，不另建专用目录；`content` 是全文，已有文件传当前 revision，新文件传 null。每批最多 64 篇，不写 `scene: true`。文档链接、搜索和反向引用继续使用知识库现有能力。候选只在隔离副本修改资料并登记到原试玩便笺；这里的试玩检查确认游戏仍可启动、资料文件与确切候选一致，不表示资料已变成游戏剧情。用户在功能进展确认后才写入正式项目，也可在那里撤销。
- 既有地图或据点的玩家文案要随剧情修改时，使用 `copyEdits:[{path,expectedRevision,edits:[{targetId,field,value}]}]`。`path` 只能是已存在的 `public/data/hub/*.json` 或 `public/data/world/world-map.json`，`expectedRevision` 是源文件 SHA-256；`targetId` 使用地图、目的地、据点、地点或行动的现有稳定 ID。只改对应对象已有的描述、摘要、详情、行动名称或状态文案，不改路由 ID、类型、文件路径及玩法数据。服务把改动加入同一确切候选和 `story-copy` 试玩检查；正式内容仍由功能进展确认。
- 同一冒险要在已有秘境商店新增或更新报价时，可给 `stageStoryCandidate` 增加 `shops:[{resourceId,nodeId,offers:[{id,label,description,cost:{spiritStones,items?},rewards:{cards,items,spiritStones}}]}]`。商店 `resourceId`、可达地图节点和道具/卡牌 ID 必须来自候选内容目录；道具堆叠写 `{id,itemType,count}`。报价和剧情一起进入确切候选，原试玩便笺检查通过后才可在功能进展确认，不能直接编辑正式商店 JSON。
- 编译结果里的 `diagnostics` 是唯一事实来源：出现 `severity: "error"` 表示没有写任何文件，按 diagnostics 修源文档后重跑，不要手改输出的 story JSON；历史编译记录用 query `storyBuilds` 查看。
