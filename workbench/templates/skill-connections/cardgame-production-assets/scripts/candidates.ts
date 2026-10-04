async function run(event: any, api: any) {
  const nodes = await api.describe({});
  const production = nodes.find((node: any) => node.noteId === event.noteId);
  const libraries = nodes.filter((node: any) => node.capabilities.actions.includes('registerCandidates'));
  if (!production?.capabilities.queries.includes('production') || !production.capabilities.actions.includes('recordCandidates') || libraries.length !== 1)
    return { outcome: 'agent', summary: '制作或资源库能力不明确' };
  const request = event.payload;
  if (!request?.projectId || !request?.productionId || !request?.requestId || !Array.isArray(request.candidates) || !request.candidates.length)
    return { outcome: 'agent', summary: '候选登记请求缺少制作单、请求 ID 或候选文件' };
  const current = await api.query({ noteId: production.noteId, name: 'production',
    input: { projectId: request.projectId, productionId: request.productionId }, codeVersion: production.codeVersion });
  if (!current?.production || current.production.projectId !== request.projectId)
    return { outcome: 'agent', summary: '找不到原制作单，未登记资源候选' };
  const library = libraries[0];
  const result = await api.action({ noteId: library.noteId, name: 'registerCandidates', codeVersion: library.codeVersion, operationId: 'register',
    input: { projectId: request.projectId, candidates: request.candidates } });
  const candidates = Array.isArray(result) ? result : result?.candidates;
  if (!Array.isArray(candidates) || candidates.length !== request.candidates.length || candidates.some((item: any) => !item?.id))
    return { outcome: 'agent', summary: '资源库回执缺少候选身份，请核对原操作' };
  await api.action({ noteId: production.noteId, name: 'recordCandidates', codeVersion: production.codeVersion, operationId: 'record',
    input: { projectId: request.projectId, productionId: request.productionId, ...(request.round ? { round: request.round } : {}),
      requestId: request.requestId, candidates } });
  for (const candidate of candidates) await api.bindingLink({ kind: 'asset-candidate',
    source: { noteId: production.noteId, objectId: request.productionId }, target: { noteId: library.noteId, objectId: candidate.id } });
  return { outcome: 'completed', summary: `已登记 ${candidates.length} 个未采用的资源候选`, title: '候选已登记' };
}
