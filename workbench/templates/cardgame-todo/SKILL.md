---
name: cardgame-todo
description: 管理 CardGame 项目需求、缺陷、反馈和开发交办。
---

Todo 保存要做什么、为什么和当前状态。使用稳定 `itemId`；修改需求时携带
`baseRevision`，收到执行反馈时只更新状态、结论和执行绑定，保留用户同时修改的
标题与正文。`delegateTodo` 发布带稳定请求 ID 的交办事件，由 Skill 连线继续原执行台任务；不要在 Todo
便笺内启动 agent。

保留原 Todo 的 compact 快速添加和 expanded 三栏看板，以及分类、优先级、卡片内编辑和交办交互。用户已明确否定列表／详情替换版；数据与协作能力通过兼容层接入，不因新增后端能力重做 UI。

生产请求用 `productionRequest` 创建草稿并打开生产便笺。草稿不会生成素材；生成、
候选注册和采用均由生产流程显式触发。
