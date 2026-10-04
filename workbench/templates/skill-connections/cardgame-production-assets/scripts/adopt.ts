async function run(event: any, api: any) {
  const nodes = await api.describe({});
  const production = nodes.find((node: any) => node.noteId === event.noteId);
  const libraries = nodes.filter((node: any) => node.capabilities.actions.includes('adoptVersion'));
  if (!production?.capabilities.queries.includes('production') || !production.capabilities.actions.includes('recordAdoption') || libraries.length !== 1)
    return { outcome: 'agent', summary: '制作或资源采用能力不明确' };
  const request = event.payload;
  if (!request?.projectId || !request?.productionId || !request?.candidateId || !request?.requestId)
    return { outcome: 'agent', summary: '采用请求缺少制作单、候选或请求 ID' };
  const current = await api.query({ noteId: production.noteId, name: 'production',
    input: { projectId: request.projectId, productionId: request.productionId }, codeVersion: production.codeVersion });
  const item = current?.production;
  const candidate = item?.candidateRefs?.find((value: any) => (value.id || value.key || value.assetId) === request.candidateId);
  if (!candidate || item.projectId !== request.projectId)
    return { outcome: 'agent', summary: '候选不属于当前制作单，未采用资源' };
  const library = libraries[0];
  const result = await api.action({ noteId: library.noteId, name: 'adoptVersion', codeVersion: library.codeVersion, operationId: 'adopt',
    input: { projectId: request.projectId, candidateId: request.candidateId,
      ...(request.assetId || candidate.assetId ? { assetId: request.assetId || candidate.assetId } : {}),
      ...(request.versionId || candidate.versionId ? { versionId: request.versionId || candidate.versionId } : {}) } });
  const assetId = result?.id || result?.assetId, versionId = result?.currentVersionId || result?.versionId;
  if (!assetId || !versionId) return { outcome: 'agent', summary: '资源采用回执缺少资源或版本 ID，请核对原操作' };
  await api.action({ noteId: production.noteId, name: 'recordAdoption', codeVersion: production.codeVersion, operationId: 'record',
    input: { projectId: request.projectId, productionId: request.productionId, candidateId: request.candidateId,
      assetId, versionId, requestId: request.requestId } });
  await api.bindingLink({ kind: 'adopted-asset', source: { noteId: production.noteId, objectId: request.productionId },
    target: { noteId: library.noteId, objectId: assetId } });
  return { outcome: 'completed', summary: `候选 ${request.candidateId} 已采用为资源 ${assetId} 的版本 ${versionId}`, title: '资源版本已采用' };
}
