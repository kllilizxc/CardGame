import type { CardgameNotes } from './connections';

export interface CardgameScheduleInput {
  id: string;
  name: string;
  rule: string;
  noteId: string;
  prompt: string;
}

/** Schedules run agents against the project; they never mutate content directly. */
export function cardgameSchedules(notes: CardgameNotes, projectId: string): CardgameScheduleInput[] {
  return [
    {
      id: 'cardgame:inspection',
      name: '卡牌内容巡检',
      rule: '07:43',
      noteId: notes.execution,
      prompt: [
        `每日巡检 CardGame 项目（projectId：${projectId}）的内容健康度，发现登记到 Todo 便笺 ${notes.todo}。`,
        '1. 通过内容库便笺的 query 资源调用 inspection 查询，输入 {projectId}（不传 kinds，覆盖全部五类：broken-link、scene-dead-end、orphan-asset、card-missing-art、asset-missing-metadata）；返回带 nextCursor 时用 cursor 继续查询直到取完。',
        `2. 对 severity 为 high 或 warning 的每条 finding，调用 action.invoke {noteId:"${notes.todo}",action:"createTodo",input:{title,description,priority,category:"巡检",context}} 登记一条 Todo：title 定位到具体文件、卡牌或资源（含 finding 的 kind 与 ref.path 或 ref.id），description 写 finding.detail，priority 按 severity 映射（high→high、warning→medium），context 保留 {kind,ref,severity}。同一 finding 已存在未完成的巡检 Todo 时不重复登记。info 级 finding 只在结论中计数，不建 Todo。`,
        '3. 巡检只报告不修复：即使看似可机械修复（失效链接、孤立资源等），也不改动任何项目文件、卡牌 JSON 或索引。',
        '4. 结论汇总本次 counts 中各 kind 的发现数量与新建 Todo 数量，作为本次 run 的结论。',
      ].join('\n'),
    },
  ];
}
