async function run(event: any, api: any) {
  const nodes = await api.describe({});
  const desk = nodes.find((node: any) => node.noteId === event.noteId);
  const todos = nodes.filter((node: any) => node.capabilities.actions.includes('feedback') && node.capabilities.queries.includes('todo'));
  if (!desk?.capabilities.queries.includes('task') || !desk.capabilities.queries.includes('progress') || todos.length !== 1)
    return { outcome: 'agent', summary: '执行进展或 Todo 能力不明确' };
  const taskId = event.payload?.delegationId;
  if (!taskId) return { outcome: 'agent', summary: '执行台事件缺少任务 ID' };
  const task = await api.query({ noteId: desk.noteId, name: 'task', input: { delegationId: taskId }, codeVersion: desk.codeVersion });
  const todo = todos[0];
  if (task?.source?.noteId !== todo.noteId || !task.source.itemId)
    return { outcome: 'completed', summary: '该任务不属于本 Todo 便笺', title: '无需同步 Todo' };
  const source = task.source.value;
  if (!source?.projectId) return { outcome: 'agent', summary: '原任务缺少项目身份' };
  const progress = await api.query({ noteId: desk.noteId, name: 'progress', input: { delegationId: taskId }, codeVersion: desk.codeVersion });
  const status = progress?.status === 'blocking' ? 'blocked' : progress?.status;
  if (!['todo', 'in_progress', 'blocked', 'done'].includes(status)) return { outcome: 'agent', summary: '任务进展状态无效' };
  const current = await api.query({ noteId: todo.noteId, name: 'todo', input: { projectId: source.projectId, id: task.source.itemId }, codeVersion: todo.codeVersion });
  if (!current?.item) return { outcome: 'agent', summary: '找不到原 Todo' };
  if (current.item.status === status && (!progress.conclusion || current.item.conclusion === progress.conclusion))
    return { outcome: 'completed', summary: '原 Todo 已是最新进展', title: '待办无变化' };
  await api.action({ noteId: todo.noteId, name: 'feedback', codeVersion: todo.codeVersion, operationId: `progress:${taskId}`,
    input: { projectId: source.projectId, itemId: task.source.itemId, status, conclusion: progress.conclusion || '任务状态已更新',
      requirementRevision: current.item.requirementRevision, requestId: event.id,
      execution: { deskNoteId: desk.noteId, delegationId: taskId, status: progress.status } } });
  return { outcome: 'completed', summary: `任务 ${taskId} 的进展已写回原 Todo`, title: '待办进展已同步' };
}
