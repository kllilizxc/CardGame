# 青云入门教学关内容蓝图

本文把“青云入门教学关”从目标描述固化为后续内容 Generator 可分批实现的执行蓝图。它只定义故事、教学检查点、资源身份草案和确定性要求，不落地可玩 JSON，不改 content catalog，不改 MainMenu 入口，不写 TypeScript 运行时代码。

## 设计目标

- 教学关必须是一个可发布导向的小故事，而不是按钮说明集合。玩家要经历“凡人持卡匣求入青云宗 → 在山门证明心性与卡匣规则 → 被派往外山秘境完成一段固定试炼 → 带着收获撤离并获得临时入门资格”的闭环。
- 教学覆盖现有数据驱动路线：`MainMenu -> WorldMapScene -> HubScene | ExpeditionScene -> BattleScene`，并明确 Story/Hub session、Expedition active-run、Battle 返回各自来源的边界。
- 教学内容优先稳定、可复现、可验收；所有会影响玩法结果的随机点都必须被固定或用教程专用资源绕开。
- 本蓝图提出 `tutorial.qingyun-*` resourceId 草案，供后续实现拆分；现有 `story.qingyun-entry`、`hub.qingyun-town`、`phase01-*` 示例内容只能作为参考，不直接当最终教学关发布资源。

## 完整故事弧

### 起：山门脚下的凡人队伍

主角是一介没有灵根凭证的凡人，家破后只剩一只古旧卡匣。卡匣表面像凡俗木盒，实际是古代御兽法宝，能把灵兽、法器、符箓等收束成可按固定规则驱使的卡牌。青云宗今日开山收徒，主角从青云山麓大地图抵达青云镇，在山门集市与茶棚听到“问心阶不只看灵根，也看本心”的传闻。这里让玩家第一次拖拽大地图、进入 Hub 子地图，并理解“地点不是菜单项，而是空间标记”。

### 承：问心阶前的选择

玩家从青云镇或山门牌坊进入青云宗山门故事。队伍中有体弱少女被人群挤到边缘：玩家可以选择老实排队，也可以在心性条件满足时帮助她。帮助少女会触发青玉铃线索，排队则得到执事的秩序认可。两条路径最终都进入问心阶钟鸣节点，证明 Story 选择、条件、flag、关系变化和分支汇合。故事不把主角塑造成被长老无条件看中的天才，而是让卡匣规则在试炼中首次被看见。

### 转：卡匣演武与外山试炼

问心钟声让主角短暂陷入幻象，古旧卡匣自行展开成规则化战场。第一场战斗是安全演武：敌人是“问心残影”或低阶灵狐幻象，玩家按提示完成抽牌、召唤单位、装备法器、结束回合、自动攻击和胜利返回 Story。执事没有立刻收徒，而是要求主角到外山秘境完成一段实际试炼：在固定秘境路线中通过一个战斗节点、一个事件节点、一个商店/奖励节点和一个撤离节点。第二场战斗发生在秘境，验证同一 BattleScene 从 Expedition 来源启动并返回 Expedition。

### 合：带回证物，获得记名资格

玩家在外山试炼中拿到固定证物“青云试炼木牌”与少量灵石/基础符箓，选择撤离后回到大地图。山门执事确认主角没有灵根却能稳定驱使古代卡匣，给出“记名弟子，暂入外门旁听”的结论。故事收束为明确下一步：正式主线可以继续调查卡匣来源、少女青玉铃和外山秘境异动；教学关本身完成，不把正式奖励、首次启动强制教学、立绘、配音或 CG 绑定进本任务。

## 关卡黄金路径

1. `WorldMapScene` 打开教程大地图，默认中心对准青云山麓。
2. 玩家拖拽地图，点击“青云镇”标记进入 Hub。
3. `HubScene` 展示青云镇二级子地图，玩家点击“集市茶棚”标记，再点击“听试炼传闻”故事行动。
4. `StoryScene` 展示短传闻节点，玩家选择“记下问心阶旧事”，获得固定 flag 后回到教学叙事推进点。
5. 玩家从 Hub/WorldMap 进入“青云宗山门”Hub，点击“山门牌坊”标记，启动主线故事。
6. `StoryScene` 让玩家选择“帮助体弱少女”或“老实排队”。推荐黄金路径选择帮助少女，展示条件满足与 flag 记录；备选路径仍可汇合，不影响教学闭环。
7. 问心钟鸣触发第一场 Story-sourced Battle：玩家按固定手牌完成基础操作并胜利，返回 Story 胜利节点。
8. 故事引导玩家从大地图进入“青云外山教学试炼” Expedition。
9. `ExpeditionScene` 展示固定拓扑，玩家按指定路线进入战斗节点；第二场 Expedition-sourced Battle 胜利后返回秘境地图。
10. 玩家进入事件节点领取固定 outcome 奖励，进入商店节点购买固定教学商品或确认灵石不足提示，最后到撤离节点主动撤离。
11. 撤离结算回到大地图/山门收束文案，教学关完成。

## 战斗数量选择

本教学关采用 **2 场战斗**，不做 1 场，也不扩展到 3 场。

| 数量 | 结论 | 原因 |
| --- | --- | --- |
| 1 场 | 不足 | 只能证明 Battle 基础操作，无法同时验证 Story-sourced battle 返回 Story 与 Expedition-sourced battle 返回 Expedition。教学矩阵要求覆盖 Story 战斗触发和秘境战斗收束，1 场会漏掉一个来源边界。 |
| 2 场 | 采用 | 第一场在 Story 中安全教学基础操作；第二场在 Expedition 中验证秘境节点战斗、active-run 路线身份和战后返回地图。两场共享 BattleScene 操作，不重复教学复杂系统，覆盖足够且成本可控。 |
| 3 场 | 不采用 | 第三场通常会被设计成 boss 或进阶战斗，但教学关目标是入门闭环，不应把 boss、构筑深度、状态复杂组合或奖励经济提前塞进首关。后续正式主线可另开进阶教学。 |

## 教学检查点矩阵

| 检查点 | 剧情段落 | 教学目标 | 玩家动作 | 涉及系统 | 预计资源身份 | 确定性要求 | 验收点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TQ-01 | 青云山麓开场 | 认识大地图标记和拖拽，知道地点/秘境是空间节点 | 拖拽地图到青云镇，点击城镇标记 | WorldMap marker、拖拽/点击阈值、catalog worldMap resolve | `tutorial.qingyun-worldmap`；destination `destination.tutorial.qingyun-town` | 默认中心、标记坐标、点击阈值固定；不根据存档解锁改变教程路径 | 点击青云镇后进入 `HubScene`，状态文案说明“从大地图进入青云镇” |
| TQ-02 | 青云镇子地图 | 认识 Hub 二级地图：点击小地点后才出现行动面板 | 点击“集市茶棚”标记 | Hub sub-map presentation、Hub location selection、Story/Hub session 当前地点保存 | `tutorial.qingyun-hub-town`；location `location.tutorial.qingyun-town.teahouse` | 教程 Hub 使用专用 `hubId`，不读取正式青云镇旧位置；地图坐标固定 | 当前地点变为茶棚，行动面板显示“听试炼传闻”和“返回集市” |
| TQ-03 | 茶棚传闻 | 认识 Story 选择、条件可见、选择效果 | 选择“坐下听掌柜讲问心阶旧事” | Story graph、choice transition、flag/dialogue/effect | `tutorial.qingyun-story-teahouse-rumor` | 初始属性固定，使该选择必定 enabled；节点/选择顺序固定；无 AI 即时扩写 | 获得 `flag.tutorial.qingyun.heard_mind_stair_rumor`，故事进入传闻收束节点 |
| TQ-04 | 青云宗山门 | 认识大地图多 Hub 入口和独立 Hub session | 从大地图点击“青云宗山门”，进入山门 Hub 后点击“山门牌坊”行动 | WorldMap hub route、Hub startStory、Story/Hub session key | `tutorial.qingyun-hub-sect-gate`；`tutorial.qingyun-story-entry` | `hubId + actionId + storyGraphFile` 专用，不与现有 `story.qingyun-entry` 共享进度 | `StoryScene` 从入门主线入口节点开始，状态文案标明山门来源 |
| TQ-05 | 队伍中的少女 | 展示 Story 条件与分支：满足心性可帮助少女，不满足时应禁用或隐藏 | 黄金路径点击“帮助体弱少女”；备选点击“老实排队” | Story `enabledWhen`、flag、relation、dialogue record、分支汇合 | `tutorial.qingyun-story-entry`；choice `choice.tutorial.qingyun.help-frail-girl` | 初始 `心性` 固定为可选择；备选路径汇合节点固定；选择不使用概率 | 帮助路径记录少女关系与青玉铃线索；排队路径记录秩序认可；两者都能进入钟鸣节点 |
| TQ-06 | 问心演武 | 第一场 Battle：抽牌、初始手牌、召唤、装备/符箓、结束回合、自动攻击 | 按提示召唤低星单位，装备青云剑或使用基础符箓，结束回合 | Story `startBattle`、Battle deck/encounter resolve、Battle 基础交互、Battle -> Story result | `tutorial.qingyun-deck-casket-starter`；`tutorial.qingyun-encounter-mind-echo` | 牌序固定；初始 5 张固定；敌方单位/位置固定；敌方无随机行动；胜利节点固定 | 胜利返回 Story 节点 `node.tutorial.qingyun.mind-duel-victory`，失败返回可恢复节点且不阻断教学 |
| TQ-07 | 外山试炼入口 | 认识 Expedition 进入准备、路线身份和固定拓扑 | 从大地图点击“青云外山教学试炼” | WorldMap expedition target config、Expedition bootstrap、route-key active-run | `tutorial.qingyun-expedition-outer-mountain-map`；`tutorial.qingyun-world-seed` | `expeditionId + mapId` 专用，清晰隔离正式原型秘境；入口节点和可达节点固定 | Expedition 显示入口、战斗、事件、商店、撤离节点，当前可达节点符合黄金路径 |
| TQ-08 | 雾林伏击 | 第二场 Battle：验证 Expedition 节点战斗和返回秘境 | 点击战斗节点，胜利后回到 Expedition 地图 | Expedition battle payload、Battle encounter resolve、Battle -> Expedition result | `tutorial.qingyun-encounter-mist-fox`；`tutorial.qingyun-deck-casket-starter` 的秘境固定快照 | 遭遇固定；敌方位置固定；战斗后 node state 固定为 cleared；不随机掉落 | 战斗胜利后回到同一 Expedition targetConfig，战斗节点已完成，下游事件/商店节点可达 |
| TQ-09 | 遗落行囊 | 认识事件节点与奖励领取 | 点击事件节点并领取固定奖励 | Expedition event node、event outcome、reward claim、persistent carried bundle | `tutorial.qingyun-events-outer-mountain`；event `event.tutorial.qingyun.abandoned-cache` | 不使用 weighted pool 抽取；outcome 固定为“拾取护体符和 12 灵石” | 奖励只可领取一次，领取后 carried deck/items/spiritStones 变化可预期 |
| TQ-10 | 云游小贩 | 认识商店/奖励或灵石不足反馈 | 点击商店节点，购买“护体符补给”或查看固定不可购买商品 | Expedition shop node、shop offer state、purchase result | `tutorial.qingyun-shop-wayfarer`；offer `offer.tutorial.qingyun.guard-talisman` | 商品列表、价格、购买结果固定；不刷新商店，不随机商品 | 购买后灵石扣减与卡牌/物品加入固定；重复购买显示已购买 |
| TQ-11 | 绳桥撤离 | 认识主动撤离与战利品带回 | 点击撤离节点并确认撤离 | Expedition extract node、terminal resolution、persistent stash summary、return | `extract.tutorial.qingyun.rope-bridge` | 撤离点固定；结算摘要固定；不触发随机终局奖励 | 玩家保留教程中获得的卡/物品/灵石，active-run 清理或标记完成逻辑按教程设计执行 |
| TQ-12 | 山门收束 | 完成故事闭环并提示正式主线继续 | 阅读执事确认文案，结束教学 | Story/Hub/WorldMap 状态提示、完成 flag | `tutorial.qingyun-story-entry` 内的收束节点 | 完成 flag 固定；不授予正式存档奖励；不自动决定首次启动强制教学 | 玩家看到“记名弟子，暂入外门旁听”的结论，教学目标全部达成 |

## 剧情段落与资源草案

| 资源草案 | Catalog kind | 文件路径草案 | 拥有的稳定内容身份 | 说明 |
| --- | --- | --- | --- | --- |
| `tutorial.qingyun-worldmap` | `worldMap` | `data/world/tutorial-qingyun-world-map.json` | `worldmap.tutorial.qingyun`；`destination.tutorial.qingyun-town`；`destination.tutorial.qingyun-sect-gate`；`destination.tutorial.qingyun-outer-mountain` | 教学专用大地图，坐标和默认入口固定；避免污染正式 `worldmap.qingyun-region`。 |
| `tutorial.qingyun-hub-town` | `hub` | `data/hub/tutorial-qingyun-town.json` | `hub.tutorial.qingyun-town`；`location.tutorial.qingyun-town.gate-market`；`location.tutorial.qingyun-town.teahouse` | 青云镇教学 Hub，包含集市和茶棚两个二级地点。 |
| `tutorial.qingyun-hub-sect-gate` | `hub` | `data/hub/tutorial-qingyun-sect-gate.json` | `hub.tutorial.qingyun-sect-gate`；`location.tutorial.qingyun-sect-gate.archway` | 山门教学 Hub，独立 session key，避免复用正式山门进度。 |
| `tutorial.qingyun-story-teahouse-rumor` | `story` | `data/story/tutorial-qingyun-teahouse-rumor.json` | `story.tutorial.qingyun-teahouse-rumor`；`flag.tutorial.qingyun.heard_mind_stair_rumor` | 1-2 个节点的传闻故事，用于低成本教学 Story 选择与 flag。 |
| `tutorial.qingyun-story-entry` | `story` | `data/story/tutorial-qingyun-entry.json` | `story.tutorial.qingyun-entry`；`node.tutorial.qingyun.arrive`；`node.tutorial.qingyun.mind-bell`；`node.tutorial.qingyun.mind-duel-victory` | 主教学故事，覆盖条件分支、青玉铃线索、第一场 Story battle 与收束。 |
| `tutorial.qingyun-deck-casket-starter` | `deck` | `data/decks/tutorial-qingyun-casket-starter.json` | deck cards order owned by tutorial | 教程战斗固定牌序：低星单位、青云剑、护体符/治愈符等按教学步骤排列。 |
| `tutorial.qingyun-encounter-mind-echo` | `encounter` | `data/encounters/tutorial-qingyun-mind-echo.json` | `encounter.tutorial.qingyun-mind-echo` | Story 演武敌人，单单位或低血量幻象，保证基础操作可胜。 |
| `tutorial.qingyun-expedition-outer-mountain-map` | `expeditionMap` | `data/mijing/tutorial-qingyun-outer-mountain-map.json` | `expedition.tutorial.qingyun-outer-mountain`；`map.tutorial.qingyun-outer-mountain` | 固定 5 节点拓扑：入口 -> 战斗 -> 事件 -> 商店 -> 撤离。 |
| `tutorial.qingyun-events-outer-mountain` | `expeditionEvents` | `data/mijing/tutorial-qingyun-events.json` | `event.tutorial.qingyun.abandoned-cache`；`outcome.tutorial.qingyun.guard-talisman-cache` | 事件 outcome 固定或用单一 pool 项表达，避免 weighted 随机。 |
| `tutorial.qingyun-shop-wayfarer` | `expeditionShop` | `data/mijing/tutorial-qingyun-shop.json` | `shop.tutorial.qingyun.wayfarer`；`offer.tutorial.qingyun.guard-talisman` | 商品顺序、价格和购买结果固定。 |
| `tutorial.qingyun-encounter-mist-fox` | `encounter` | `data/encounters/tutorial-qingyun-mist-fox.json` | `encounter.tutorial.qingyun-mist-fox` | Expedition 战斗敌人；用于验证战斗返回秘境。 |
| `tutorial.qingyun-world-seed` | `worldSeed` | `data/world/tutorial-qingyun-initial-state.json` | 教学初始 stash、少量灵石、无正式奖励 | 教学 Expedition 的初始资源，避免依赖正式 `world.seed.initial-state`。 |

## 教程专用牌序草案

教学牌组不直接复用 `deck.starter`，因为当前 starter deck 是功能测试卡组，牌序经洗牌后无法保证首手教学体验。建议后续实现一个教程专用 deck，并为教程 battle 采用“预排 deck 且禁用洗牌”的内容语义。

建议前 8 张顺序：

1. 低星单位：教程专用“纸灵狐”。用于第一次召唤。
2. 低星单位：教程专用“木桩傀”。用于展示第二个单位位。
3. 法器：青云剑。用于装备单位。
4. 符箓：护体符。用于展示目标选择和护甲。
5. 符箓：火球符。用于展示即时伤害效果。
6. 备用单位：防止误操作后仍可完成战斗。
7. 青云剑。用于第二场秘境战斗补强。
8. 护体符。用于第二场秘境战斗的回合二抽牌。

首场 battle 的初始 5 张必须固定为第 1-5 张；第二场 battle 使用教程 Expedition carried deck 的固定快照，快照前 5 张同样来自上述顺序。文档和测试必须断言这条固定快照，避免运行时洗牌改变教学步骤。

## 无随机要求清单

| 随机点 | 当前风险来源 | 教学固定方案 | 验收方式 |
| --- | --- | --- | --- |
| 牌序/洗牌 | `BattleState.shuffleDeck()` 使用 `Math.random()` | 教程 battle 通过内容语义禁用洗牌并读取预排 deck；首手与后续抽牌顺序写入教程验收表 | 首场初始手牌恒为“单位、单位、青云剑、护体符、即时符箓”；第二场首手恒定 |
| 初始手牌 | Battle 开局抽 5 张 | 教程专用 deck 前 5 张就是首手，且不受存档 carried deck 污染 | 初始手牌名称和顺序可被内容/测试断言 |
| 遭遇选择 | Expedition 节点可引用不同 encounter；未来可能扩展 encounter pool | 教程 map battle 节点直接引用固定 encounter resourceId，敌方 cardId 与 position 固定 | Story battle 与 Expedition battle 的 enemy list 完全一致地复现 |
| 敌方目标选择 | 当前自动攻击按第一个存活防御者结算，未来 AI 可能加入策略或随机 | 教程战斗只使用当前确定性目标优先级；若未来引入 AI，教程 encounter 必须声明脚本化行动序列 | 战斗日志中攻击目标顺序固定 |
| 秘境事件 outcome | `createEventNodeView` 默认按 weighted pool + `Math.random()` 抽 outcome | 教程 event 使用单一 outcome，pool 内仅一项；不使用多项 weighted pool | 事件奖励恒为同一组卡/物品/灵石 |
| 商店商品 | 未来可能有商店刷新或随机报价 | 教程商店商品列表、价格、购买状态固定；无刷新 | 商品顺序、价格和购买后状态固定 |
| 路线拓扑 | 秘境地图可有分支；玩家自由选择会绕过教学 | 教程 map 采用线性黄金路径，非黄金节点不出现；若保留分支，也必须在检查点前禁用或说明 | 节点可达顺序固定为入口、战斗、事件、商店、撤离 |
| 检查点触发 | 存档恢复可能让玩家跳过 Hub/Story/Expedition 步骤 | 教程使用专用 resourceId、hubId、storyId、expeditionId、mapId 和 session key；开始教学时按教程入口创建新会话 | 老正式存档不会把教程地点、故事节点或 active-run 推到中途 |
| 奖励归属 | 事件、商店、撤离会改 carried bundle/persistent stash | 教程奖励只使用教程草案中的固定卡/物品/灵石；正式存档奖励不由本蓝图决定，验收只断言教程内 carried bundle | 撤离摘要可逐项断言，且不产生正式经济副作用 |
| 地图拖拽 | 拖拽本身不应改变玩法，只改变视图 | 大地图和 Hub 子地图初始中心、marker 坐标、click-vs-drag 阈值固定；不使用动态布局 | 同一分辨率下标记可见性与点击结果固定 |
| 非玩法动画随机 | `BattleAnimationManager` 中有粒子/抖动随机 | 不把动画粒子坐标纳入 gameplay 验收；视觉回归只看关键 UI 状态 | 文档和测试只断言结果状态、日志、资源变化 |

## 后续内容拆分顺序

1. **资源身份与 catalog 注册批次**：先实现完整可校验的 `tutorial.qingyun-*` 资源身份清单、schemaVersion、publicPath、domain id 对齐测试，不接入口，不改 MainMenu。
2. **WorldMap + Hub 路由批次**：实现教程大地图、青云镇 Hub、山门 Hub 与二级 marker；验收大地图拖拽、Hub 子地图选择、session key 隔离。
3. **Story 文字与条件批次**：实现茶棚传闻和山门入门故事；验收 choice 条件、flag/dialogue/relation、分支汇合。
4. **Story battle 批次**：添加教程 deck 与问心演武 encounter；实现固定牌序方案；验收 Battle -> Story 胜利/失败节点。
5. **Expedition 路线批次**：添加教程秘境 map/events/shop/encounter/world seed；验收入口、固定战斗、固定事件 outcome、固定商店、撤离结算、Battle -> Expedition 返回。
6. **端到端校验批次**：只做内容与路由验收，确认教学关从大地图到收束节点完整可复现；正式存档奖励、首次启动强制教学、立绘/配音/CG 继续保持不决策。

## 验收摘要

- 故事闭环完整：主角从青云山麓出发，经茶棚传闻、山门问心、卡匣演武、外山试炼、撤离回报，获得记名资格。
- 教学矩阵覆盖：大地图标记/拖拽、Hub 子地图、Story 选择/条件、Expedition 节点/事件/商店或奖励/撤离、Battle 基础操作与返回。
- 2 场战斗足够：一场 Story 来源，一场 Expedition 来源；不引入 boss 或复杂进阶系统。
- 所有 gameplay 随机点已有固定方案：牌序、初始手牌、遭遇、事件 outcome、路线、检查点、奖励和商店均可复现。
- ResourceId 草案统一使用 `tutorial.qingyun-*` 前缀，和现有示例内容隔离，便于后续按批次实现与评审。
