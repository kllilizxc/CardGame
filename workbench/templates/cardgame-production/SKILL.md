---
name: cardgame-production
description: 管理 CardGame AI 资源制作请求、轮次、候选和采用。
---

## 独立牌组：一句意图到整套草案

用户要一套20–30张牌组时，复用本制作便笺和已有关系，不要求逐张录入或手动编排。先查询知识规则、同类卡和功能项；为这项需求查找或创建功能项，随后用 createCardBatch 保存 brief、featureId 与 deckPlan={id,title,targetSize,entries:[]}。默认方案可为24张，但牌种与副本比例按打法决定。主题不明确时只问一个关键选择；不得虚构用户确认。

原生会话批量设计原创命名与可执行定义，用 setCardDrafts 一次保存 cards 和 deckPlan.entries=[{cardId,count}]。20–30指副本总数；每种1–3张，还须遵守卡牌自身上限。新ID不得撞正式卡库。不要调用 requestCardArt，不调用收费资源或外部执行；先停在整套草案确认。界面展示可读成果，用户通过原生对话调整整体策略或标注单张卡；不得另建表单、聊天或流程控制面板。

用户要求局部修改时，先读 cardBatch 定位制作单、确切 cardId 和当前 revision。定义用 saveCardDraft，数量方案用 saveDeckPlan，只修改受影响对象；素材与其他卡保留。查询中的 deckInspection 显示数量、标签目标组合提示、下一步、旧候选及 changedCardIds。简报变化后核对当前方案并保存，明确展示待重新确认。组合检查不等于平衡试玩。

confirmDeckDraft 只能由用户操作确认当前整套指纹，Agent不能代替用户。确认后 stageDeckCandidate 建立整个独立隔离候选并登记到原试玩便笺。候选逻辑试玩明确使用占位卡面，无生图；单卡插画仍可按已有流程另行制作。独立牌组保存为worka-ID.json，只在隔离试玩中替代默认入口；正式默认26张QA牌组不受影响。实际试玩后，修改仍回原制作单，再确认新候选。正式采用与撤销沿用功能进展对确切候选的用户操作。

## 卡牌生成工作流

用户已选择 **Codex 内置 imagegen** 作为插画生成方式。默认不调用 PixelLab、FLUX、Meshy 或其他收费 API。Worka 保存需求、人工修改、图片版本、模板及交付状态；没有内置生图能力的宿主必须停在可复制的生图交接，不把请求复制说成已生成。

六类卡牌流程：AI 草稿 → 可选微调 → Codex 插画 → 两套模板组装 → 独立试玩候选。所有动作使用 `cardWorkflow({operation, productionId, cardId?, baseRevision, ...})`，projectId 来自便笺配置。先查询 `cardBatch` 获取最新 production.revision 和各卡 stages。制作便笺 cwd 仍指向已登记的正式项目，不能在该目录用文件工具修改或提交；候选目录只能由 `integrateCard` 建立。禁止直接改便笺 state 保存卡牌；正式项目只能由功能进展的确切候选确认采用。

- `createCardBatch`：brief 与已有功能项 featureId；可传 cardIds 从现有卡牌库复制，或 cards 写入新卡定义。空批次等待 AI 草稿。用户在原生对话提出新 idea 时，先查询制作单和功能项，若批次为空就用 `setCardDrafts` 写入草稿，随后按当前 revision 调 `requestCardArt`；不要只回复一段卡牌文字而留下空批次。
- `setCardDrafts`：cards；只允许尚未人工确认的批次。支持 unit、artifact、talisman、field、pill、skill 六类。先查询同类现有卡与效果结构，再写入合法定义；新 ID 不得撞已有卡牌。丹药和技能在战斗初始配置中分别占一个槽位，最多各 3 个，满槽时建立候选会给出明确错误。
- `saveCardDraft`：cardId；definition / artBrief / presentation。保持 id、kind 不变。只改攻击、生命等数值时仅传新的 definition，不要把 artBrief 改写成“复用插画”之类的话；artBrief 的任何文字变化都会使当前插画版本失效。改可执行规则必须同时核对效果文案和 scriptId，不把文字改动当作规则实现。
- `approveCardDrafts`：兼容旧流程的定稿动作；新流程在准备插画或组装时自动固定当前草稿版本，不把定稿当作用户采用确认。
- `requestCardArt`：cardId；宿主的 Codex CLI 可用时会启动内置 `$imagegen`，后台自动回填图片、组装两套卡面并建立试玩候选。返回 `automaticGeneration: true` 后查询 `cardBatch` 跟踪各卡状态，不要在原生会话重复生图或调用付费 API。失败时该卡记录错误，可对当前草稿重试。CLI 不可用时返回 handoff，保留待回填状态并如实告知。
- `attachCardArt`：仅用于自动生图不可用时的回填。cardId、requestId，携带 `$CODEX_HOME/generated_images` 文件绝对路径作为 `generatedImagePath`；先重新查询 `cardBatch` 获取当前 `baseRevision`。服务只读取该目录内的真实文件，仍验证请求 ID 和草稿指纹；旧请求会被拒绝。手工上传兼容 `base64`，两种输入不能同时传。
- `assembleCardFaces`：cardId；同时组装青玉 jade 与宣纸 scroll 两个布局。生成完整预览和不含固定攻防数字的游戏贴图。
- `integrateCard`：cardId；校验原卡 revision 后在隔离 Git 快照中写入卡牌、两套主题素材，并将单位/法器/符箓/场地接入默认卡组，或将丹药/技能接入战斗初始槽位，生成确切提交，并自动登记到原试玩便笺。正式游戏文件保持不变。试玩验证后，用户在功能进展确认该候选；遇到源文件冲突须建立新候选。

模板是 `card-face.ts` 中的独立布局。presentation.themeId 只切换外观；zoom / focus 改变裁切并使旧组装过期。改数值使人工确认与组装过期，但保留插画；改 artBrief 需要新生图回执。两套已组装主题切换不重新生成插画。每张卡的状态单独派生，不能把批次请求的完成状态代替游戏交付。

现有资源制作工作流继续沿用下述协议；卡牌批次不能交给通用 `generate`。通用资源采用至正式游戏的旧入口已被拦截，需先扩展候选闭包，不得借执行台文件工具绕过确认。

先用 `upsertRequest` 保存草稿；草稿创建不调用模型。明确生成时提交
`businessKey`、不可变 requirement snapshot、scope、cwd 和稳定 requestId 给已有
`production` 关联。传输重试复用同一个 requestId；新轮次使用新 requestId，但保留
同一 businessKey 和 owner task。

`receiveResult` 校验 requestId、round 和 requirement revision；旧结果只能记录为
stale，不能覆盖新轮次。制作与资源库 Skill 连线只登记尚未采用的素材；`adoptAsset` 需要用户明确选择候选，采用资源版本也不等于将其加入正式游戏。不要把运行完成、试玩候选、用户确认或进入游戏混为一个状态。

否决与新一轮的区别：否决（`rejectCandidate`）是质量问题返修——标记该候选
（保留可见、不删除）并自动建一条高优先级、category 为"返修"的 Todo，context 深链接
回该制作单；新一轮（`newRound`）是需求不变再生成，不标记任何候选。不满意单个候选
用否决，整批都不满意才开新一轮。



## 已采用独立牌组的原创卡面续作

用户明确要求继续卡面制作时，保留本制作单和所有卡牌规则、数值、副本。逐张 saveCardDraft 仅调整 artBrief；用户已授权生图后才逐张 requestCardArt。整套牌组的自动生图完成后只组装两套主题，不调用单卡 integrateCard，不向默认牌组追加卡牌。可查询 cardBatch 跟踪每张插画与组装状态，失败如实报告。没有可用的内置生图能力时可由用户授权的 Codex 会话实际生成，再按当前回执 attachCardArt；不得以几何占位或脚本绘制伪称生成插画。

已采用牌组在建立素材更新候选前调用 prepareDeckArt，验证正式卡牌与当前草稿规则完全一致并绑定来源版本。所有当前插画和两套卡面完成后 stageDeckCandidate 建立整套含素材的隔离候选。已有规则确认保持有效；整套素材候选仍需真实试玩和功能进展对确切候选的采用动作。卡面展示与素材依赖由同一制作单保存，原默认牌组保持原字节；规则或副本来源已变更时先核对，不能绕过版本校验。
