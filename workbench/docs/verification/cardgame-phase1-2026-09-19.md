# 卡牌工作台阶段一实施验收（2026-09-19）

对应设计：docs/design/cardgame-ideal-desktop-design.md 的"分阶段落地"阶段一。本轮为代码实施，未对运行中的桌面执行安装。

## 交付内容

| 项 | 内容 | 主要位置 |
| --- | --- | --- |
| 巡检查询 | ContentService 新增 query op `inspection`：断链、场景死路（`scene: true` + `## 选项` 章节内断链）、孤儿资源、卡牌缺图、资源缺元数据；SQL 层检测，游标分页 | plugins/cardgame-content/src/content.ts:2055 |
| 变化流查询 | 新增 query op `recentChanges`：文档/卡牌/资源/版本四类变更，按时间倒序 keyset 分页；无 schema 迁移 | plugins/cardgame-content/src/content.ts:2194 |
| 候选机检 + 自动采用 | `registerCandidates` 新增可选 `autoAdopt`：机检（字节非空、mime 嗅探一致、图片宽高/音频时长可解码）通过即自动采用，失败留候选并写机检报告；重复调用幂等 | content.ts:544、:2882 起 |
| 每日巡检 schedule | 安装脚本幂等注册 `cardgame:inspection`（每日 07:43，执行台 agent run）：跑 inspection → high/warning 建 Todo（category 巡检）→ 只报告不修复；用户暂停不被安装覆盖 | plugins/cardgame-content/schedules.ts；scripts/install-cardgame-workbench.ts:189 |
| 否决/返修 | workflow 新命令 `rejectCandidate`（标记候选 + 内联建高优先级返修 Todo，baseRevision + requestId 幂等）；生产便笺候选加「否决」（灰化标记、可选原因）；资源库详情加「否决当前版本」（有上一已采用版本则回退 + 建返修 Todo） | workflow.ts:1891；templates/cardgame-production；templates/cardgame-library |
| 变化流区 + 对话入口 | 卡牌库/资源库 expanded 顶部"变化流"区（点击定位）；compact 改为最近变化摘要；「就选中项对话」复用便笺自身主会话（agent.prepare + agent.run 带选中快照 + cg: 深链接，再 openSession）；知识库模式一行未动 | templates/cardgame-library/view.tsx、actions.ts |

模板白名单同步放行 `inspection`/`recentChanges` 两个 op（templates/cardgame-library/actions.ts:127）。

## 验证

- `bun run typecheck`（tsc × 2，含 native-client）：通过。
- `bun test` 十个卡牌相关测试文件：**60 pass / 0 fail，341 expect**。
- 模板 view.tsx（仓库 typecheck 未覆盖）单独 strict tsc + Bun.build 转译：通过。
- 容量回归 `CARDGAME_CONTENT_SCALE=1 bun test tests/cardgame-content-scale.test.ts`：1 pass（2 万图索引 28.2s，与既有量级一致）。

## 未交付与原因

- **微调传导链的剧情域已于当日补齐**（编译器 + `story_builds` 依赖记录 + 索引事件自动重编译，见 design 文档"微调同步"节实施状态）。实施中还修复了一个既有 bug：`moveDocument` 在保留文档身份时丢失移动后重写的出链（DB 与磁盘不一致），此前靠 watcher 延迟重索引掩盖。
- **提案标注人工来源**：依赖阶段三的来源标记，仍未实现。
- 运行中的桌面需重新执行安装脚本生效：`bun scripts/install-cardgame-workbench.ts`（模板代码、连接与巡检 schedule 均幂等更新；未在本轮执行）。
