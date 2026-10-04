---
name: worka-cardgame-production-assets
description: Register production candidates and adopt an explicitly selected version with exact receipts.
eventScripts:
  cardgame.production.candidatesRequested: scripts/candidates.ts
  cardgame.production.adoptionRequested: scripts/adopt.ts
---

# CardGame 制作与资源库

制作结果只登记为候选，保留实际文件路径、候选 ID 和技术元数据。资源库的 `registerCandidates` 回执是候选身份的来源；回填制作记录后才完成联动。采用是独立的用户操作：先核对制作单已有候选，再调用资源库 `adoptVersion`，把实际资源 ID 和版本 ID 写回制作记录。重试沿用同一请求和连线操作 ID，不重复登记或采用。候选登记、采用和进入正式游戏是三个不同事实。

未采用候选保存在 Worka 项目数据中。采用时由资源库把选中的明确版本写入 CardGame 正式文件和清单，并保留历史；不改动剧情或卡牌的使用位置，也不启动新执行任务。
