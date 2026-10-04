async function run(event: any, api: any) {
  const nodes = await api.describe({});
  const desk = nodes.find((node: any) => node.noteId === event.noteId);
  const productions = nodes.filter((node: any) => node.capabilities.actions.includes('receiveResult'));
  if (!desk?.capabilities.queries.includes('task') || productions.length !== 1)
    return { outcome: 'agent', summary: '制作结果或执行台能力不明确' };
  const delegationId = event.payload?.delegationId;
  if (!delegationId) return { outcome: 'agent', summary: '任务事件缺少稳定 ID' };
  const task = await api.query({ noteId: desk.noteId, name: 'task', input: { delegationId }, codeVersion: desk.codeVersion });
  if (task?.source?.noteId !== productions[0].noteId)
    return { outcome: 'completed', summary: '该任务不是 CardGame 制作请求', title: '无需同步制作' };
  if (!['completed', 'done', 'failed', 'cancelled', 'needs-input'].includes(task.status))
    return { outcome: 'completed', summary: '制作任务仍在进行，等待实际结果', title: '等待执行结果' };
  return { outcome: 'agent', summary: '制作任务已到终态；需核对产物文件、原轮次和需求修订后写回制作结果' };
}
