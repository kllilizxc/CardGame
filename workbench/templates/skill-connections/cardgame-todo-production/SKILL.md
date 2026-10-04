---
name: worka-cardgame-todo-production
description: Create or reopen the one production draft for an explicitly selected CardGame Todo.
eventScripts:
  cardgame.todo.productionRequested: scripts/create.ts
---

# CardGame 待办与制作

用户明确选择“转为制作单”后，按 Todo ID 查询当前事项，再以相同 `todoId` 幂等建立或打开制作单草稿。把实际制作单 ID 双向绑定到原 Todo，并建立对象关联。建立草稿不生成资源、不启动执行，也不采用候选。
