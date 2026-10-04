import { useActions, useResource } from '@dsh-workbench/react';
import { Button } from '@heroui/react';
import { useRef, useState } from 'react';
export function CompanionContext({ projectId, production }: { projectId: string; production: any }) {
  const actions = useActions<typeof import('./actions')>();
  const context = useResource<any>('productionContext', { projectId, productionId: production.id });
  const choices = useResource<any>('companionChoices', { projectId }, { enabled: !production.todoId || !production.batch?.companion });
  const [todoId, setTodoId] = useState('');
  const [unitId, setUnitId] = useState('');
  const source = useResource<any>('sourceCard', { projectId, id: unitId }, { enabled: Boolean(unitId) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function bind() {
    if (inFlight.current || !todoId || !source.data) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await actions.linkCompanion({ projectId, productionId: production.id, baseRevision: production.revision, todoId, sourceCardId: unitId, sourceRevision: source.data.revision }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="cw-context"><summary>来源与关联</summary><div>
    <p>所属功能：{context.data?.feature?.title ?? '读取中…'}</p><p>关联待办：{context.data?.todo?.title ?? '尚未关联'}</p><p>配套单位：{context.data?.source?.name ?? '尚未选择'}</p>
    {(!production.todoId || !production.batch?.companion) && <>
      <label>关联已有待办<select aria-label="修复制作单待办关联" value={todoId} onChange={e => setTodoId(e.target.value)} disabled={busy}><option value="">选择待办</option>{(choices.data?.todos ?? []).map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>配套单位<select aria-label="修复制作单配套单位" value={unitId} onChange={e => setUnitId(e.target.value)} disabled={busy}><option value="">选择已有单位</option>{(choices.data?.units ?? []).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Button isDisabled={busy || !todoId || !source.data} onPress={() => void bind()}>{busy ? '保存关联…' : '保存来源关联'}</Button>
    </>}
    {(error || context.error) && <p role="alert">{error || context.error?.message}</p>}
  </div><style>{`.cw-context{margin:8px 0;font-size:13px;line-height:1.6}.cw-context summary{cursor:pointer;padding:8px 0}.cw-context>div{display:flex;flex-direction:column;gap:10px;min-width:0}.cw-context p{margin:0;overflow-wrap:anywhere}.cw-context label{display:flex;flex-direction:column;gap:6px}.cw-context select,.cw-feature select{width:100%;max-width:100%;min-width:0;min-height:44px;background:var(--wb-surface);color:var(--wb-ink);border:1px solid var(--wb-line);border-radius:var(--wb-radius-small);padding:8px}.cw-feature{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0}.cw-fields-single{grid-template-columns:minmax(0,1fr)!important}`}</style></details>;
}
