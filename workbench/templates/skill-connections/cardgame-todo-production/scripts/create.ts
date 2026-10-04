async function run(event: any, api: any) {
  const nodes = await api.describe({});
  const todo = nodes.find((node: any) => node.noteId === event.noteId);
  const productions = nodes.filter((node: any) => node.capabilities.actions.includes('upsertRequest') && node.capabilities.actions.includes('bindTodo'));
  if (!todo?.capabilities.queries.includes('todo') || productions.length !== 1)
    return { outcome: 'agent', summary: 'Todo 或制作便笺能力不明确' };
  const request = event.payload;
  if (!request?.projectId || !request?.todoId || !request?.brief)
    return { outcome: 'agent', summary: '制作请求缺少项目、Todo 或说明' };
  const current = await api.query({ noteId: todo.noteId, name: 'todo', input: { projectId: request.projectId, id: request.todoId }, codeVersion: todo.codeVersion });
  if (!current?.item || current.item.projectId !== request.projectId)
    return { outcome: 'agent', summary: '找不到原 Todo，未建立制作单' };
  const production = productions[0];
  const created = await api.action({ noteId: production.noteId, name: 'upsertRequest', codeVersion: production.codeVersion, operationId: 'upsert',
    input: { ...request, todoId: current.item.id, ...(current.item.productionId ? { productionId: current.item.productionId } : {}) } });
  const productionId = created?.production?.id;
  if (!productionId) return { outcome: 'agent', summary: '制作便笺已返回回执但缺少制作单 ID，请核对原操作' };
  await api.action({ noteId: production.noteId, name: 'bindTodo', codeVersion: production.codeVersion, operationId: 'bind',
    input: { projectId: request.projectId, todoId: current.item.id, productionId } });
  await api.bindingLink({ kind: 'production', source: { noteId: todo.noteId, objectId: current.item.id },
    target: { noteId: production.noteId, objectId: productionId } });
  return { outcome: 'completed', summary: `制作单 ${productionId} 已与原 Todo 绑定；尚未开始生成`, title: '制作单草稿已建立' };
}
