async function run(event: any, api: any) {
  const nodes = await api.describe({});
  const todo = nodes.find((node: any) => node.noteId === event.noteId);
  const desks = nodes.filter((node: any) => node.capabilities.actions.includes('acceptRequirement') && node.capabilities.queries.includes('task'));
  if (!todo?.capabilities.queries.includes('todo') || !todo.capabilities.actions.includes('bindExecution') || desks.length !== 1)
    return { outcome: 'agent', summary: '待办或执行台能力不明确' };
  const request = event.payload;
  if (!request?.projectId || !request?.todoId || !request?.requestId || !request?.payload?.goal)
    return { outcome: 'agent', summary: '交办请求缺少项目、事项或稳定请求 ID' };
  const current = await api.query({ noteId: todo.noteId, name: 'todo', input: { projectId: request.projectId, id: request.todoId }, codeVersion: todo.codeVersion });
  const item = current?.item;
  if (!item || item.projectId !== request.projectId || item.requirementRevision !== request.requirementRevision)
    return { outcome: 'agent', summary: 'Todo 要求已变化，需要重新确认交办' };
  if (item.productionId)
    return { outcome: 'agent', summary: '此资源事项已有制作单，请从原制作单明确生成，不另建 Todo 执行任务' };
  const desk = desks[0], source = { noteId: todo.noteId, objectId: item.id };
  const binding = await api.bindingList({ ref: source });
  const ids = [...new Set(binding.filter((entry: any) => entry.kind === 'delegation' && entry.target.noteId === desk.noteId).map((entry: any) => entry.target.objectId))];
  if (ids.length > 1) return { outcome: 'agent', summary: '同一 Todo 已绑定多个执行任务' };
  let delegationId = ids[0] || item.execution?.delegationId;
  if (delegationId) {
    const task = await api.query({ noteId: desk.noteId, name: 'task', input: { delegationId }, codeVersion: desk.codeVersion });
    if (!task || task.source?.noteId !== todo.noteId || task.source?.itemId !== item.id || task.archived || task.status === 'paused')
      return { outcome: 'agent', summary: '原执行任务来源或状态需要人工核对，未创建新任务' };
  }
  const result = await api.action({ noteId: desk.noteId, name: 'acceptRequirement', codeVersion: desk.codeVersion, operationId: 'delegate',
    input: { source: { ...source, revision: String(item.requirementRevision), value: item }, updateId: request.requestId,
      goal: request.payload.goal, scope: request.payload.scope, ...(request.payload.cwd ? { cwd: request.payload.cwd } : {}),
      delivery: delegationId ? 'steer' : 'queue', ...(delegationId ? { delegationId } : {}) } });
  if (!result?.delegationId) return { outcome: 'agent', summary: '执行台接收回执缺少任务 ID，请核对原操作' };
  await api.action({ noteId: todo.noteId, name: 'bindExecution', codeVersion: todo.codeVersion, operationId: 'bind',
    input: { projectId: request.projectId, todoId: item.id, requestId: request.requestId,
      receipt: { status: 'accepted', result: { ...result, deskNoteId: desk.noteId } } } });
  await api.bindingLink({ kind: 'delegation', source, target: { noteId: desk.noteId, objectId: result.delegationId } });
  return { outcome: 'completed', summary: `Todo 已交办给执行任务 ${result.delegationId}`, title: '已交办执行台' };
}
