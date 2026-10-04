---
name: worka-cardgame-production-desk
description: Deliver exact production rounds to the original execution task and reconcile their results.
eventScripts:
  cardgame.production.generationRequested: scripts/generate.ts
  tasks.changed: scripts/result.ts
---

# CardGame 制作与执行台

仅用户点击生成后处理已预留的制作轮次。按项目、制作单 ID、轮次和 `requestId` 核对冻结的需求，再用 `acceptRequirement` 交给执行台。同一制作单复用原任务；发现旧任务来源不一致时停止自动派发，先核对旧绑定。执行回执写回同一轮次，不将“接收交办”写成“生成完成”。

任务变化后只处理来源为本制作便笺的任务。到达终态时，核对执行证据和轮次、需求修订，再调用 `receiveResult`；回写 `{projectId,productionId,requestId,round,requirementRevision,status,conclusion,candidates}`。候选只引用指定输出目录中的实际文件，不能凭叙述编造路径或候选 ID。过期轮次只留历史，不覆盖当前轮次。失败仅记录事实，不自动开启新一轮。

资源生成、加工和导出由执行任务及其工具完成，不要求用户手工修图或补帧。产物写入该轮需求指定的输出目录，回执中的 `sourcePath` 指向可核验的真实文件。
