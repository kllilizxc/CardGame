---
name: worka-cardgame-todo-desk
description: Deliver one CardGame Todo to its original execution task and return verified progress.
eventScripts:
  cardgame.todo.delegationRequested: scripts/delegate.ts
  tasks.changed: scripts/progress.ts
---

# CardGame 待办与执行台

只处理用户明确交办的 Todo。按项目与 Todo ID 查询当前需求，核对请求中的需求修订，再调用执行台 `acceptRequirement`。同一 Todo 继续使用原任务；已有旧任务但来源身份不一致时先核对，不新建并行任务。执行台回执写回原 Todo，使用稳定请求 ID；任务结论只同步到原 Todo，不覆盖用户并发修改的需求。任务完成不等于试玩、资源采用或进入正式游戏。
