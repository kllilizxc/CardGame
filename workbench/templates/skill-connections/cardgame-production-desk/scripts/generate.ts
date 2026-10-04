async function run(event: any, api: any) {
  const nodes = await api.describe({});
  const production = nodes.find((node: any) => node.noteId === event.noteId);
  const desks = nodes.filter((node: any) => node.capabilities.actions.includes('acceptRequirement') && node.capabilities.queries.includes('task'));
  if (!production?.capabilities.queries.includes('production') || !production.capabilities.actions.includes('bindExecution') || desks.length !== 1)
    return { outcome: 'agent', summary: '制作或执行台能力不明确' };
  const request = event.payload;
  if (!request?.projectId || !request?.productionId || !request?.requestId || !request?.submit?.goal)
    return { outcome: 'agent', summary: '制作请求缺少项目、制作单或冻结目标' };
  const current = await api.query({ noteId: production.noteId, name: 'production',
    input: { projectId: request.projectId, productionId: request.productionId }, codeVersion: production.codeVersion });
  const item = current?.production;
  const round = item?.rounds?.find((value: any) => value.requestId === request.requestId && value.round === request.round);
  if (!round || item.projectId !== request.projectId || round.requirementRevision !== request.submit.requirement?.requirementRevision)
    return { outcome: 'agent', summary: '制作轮次或需求修订已变化，未交办执行' };
  const desk = desks[0], source = { noteId: production.noteId, objectId: item.id };
  let delegationId = item.execution?.delegationId;
  if (delegationId) {
    const task = await api.query({ noteId: desk.noteId, name: 'task', input: { delegationId }, codeVersion: desk.codeVersion });
    if (!task || task.source?.noteId !== production.noteId || task.source?.itemId !== item.id || task.archived || task.status === 'paused')
      return { outcome: 'agent', summary: '原制作任务来源或状态需要人工核对，未创建新任务' };
  }
  const result = await api.action({ noteId: desk.noteId, name: 'acceptRequirement', codeVersion: desk.codeVersion, operationId: 'dispatch',
    input: { source: { ...source, revision: String(round.dispatchRevision), value: request.submit }, updateId: request.requestId,
      goal: request.submit.goal, scope: request.submit.scope, ...(request.submit.cwd ? { cwd: request.submit.cwd } : {}),
      delivery: delegationId ? 'steer' : 'queue', ...(delegationId ? { delegationId } : {}) } });
  if (!result?.delegationId) return { outcome: 'agent', summary: '执行台回执缺少任务 ID，请核对原操作' };
  await api.action({ noteId: production.noteId, name: 'bindExecution', codeVersion: production.codeVersion, operationId: 'bind',
    input: { projectId: request.projectId, productionId: item.id, requestId: request.requestId,
      receipt: { status: 'accepted', result: { ...result, deskNoteId: desk.noteId } } } });
  await api.bindingLink({ kind: 'production-execution', source, target: { noteId: desk.noteId, objectId: result.delegationId } });
  return { outcome: 'completed', summary: `制作轮次 ${round.round} 已交给执行任务 ${result.delegationId}`, title: '制作已交办' };
}
