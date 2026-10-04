import type { WorkaExtensionHost } from '../../../src/host';
import type { NoteRecord } from '../../../src/core/types';
const quote = (value: string) => JSON.stringify(value);
async function readDetail(host: WorkaExtensionHost, noteId: string, projectId: string, op: string, id: string): Promise<Record<string, unknown> | undefined> {
 const value = await host.runtime.resources?.read({ name: 'extension.cardgame-content.query', input: {projectId, op, ...(op === 'production' ? { productionId: id } : {id})} }, { access: { noteId, version: (await host.app.note(noteId)).value.codeVersion ?? '', caller: {kind: 'system'} } });
 const data = value?.data;
 return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
}

export async function cardgameSelectionLines(host: WorkaExtensionHost, note: NoteRecord): Promise<string[]> {
    const config = await host.app.core.readRecord<Record<string, unknown>>('states', `${note.id}:config`).catch(() => undefined)
    const projectId = config?.value?.projectId
    if (typeof projectId !== 'string' || !projectId.trim()) return []
    const state = await host.app.core.readRecord<Record<string, any>>('states', note.stateRef).catch(() => undefined)
    const mode = config?.value?.mode
    const kind = (config?.value?.catalogRef as {kind?: unknown} | undefined)?.kind
    const selection: Array<{op: string; id: string}> = []
    if (mode === 'cards') for (const id of state?.value?.views?.cardsSelection ?? []) if (typeof id === 'string') selection.push({op: 'card', id})
    if (mode === 'assets' && typeof state?.value?.views?.assetsSelection === 'string') selection.push({op: 'asset', id: state.value.views.assetsSelection})
    if (mode === 'knowledge' && typeof state?.value?.views?.knowledgeSelection?.path === 'string') selection.push({op: 'document', id: state.value.views.knowledgeSelection.path})
    if (kind === 'production' && typeof state?.value?.selectedId === 'string') selection.push({op: 'production', id: state.value.selectedId})
    const projectRoot = config?.value?.projectRoot
    const boundary = `这是已登记的正式项目${typeof projectRoot === 'string' ? `，目录 ${quote(projectRoot)}` : ''}；便笺工作目录即使看起来是临时目录也不是创作候选。不要用 Bash、Edit、Write 或 git commit 直接修改它。卡牌改动须调用卡牌库 createCardWorkflow，再通过制作便笺 cardWorkflow 的 saveCardDraft、assembleCardFaces、integrateCard 生成候选；该候选由服务自动登记原试玩便笺。`
    if (!selection.length) return [`CardGame 项目 ${quote(projectId)}；当前便笺尚无选中对象。${boundary}在试玩便笺验证后仅由功能进展确认采用。`]
    const lines = [`CardGame 项目 ${quote(projectId)}；${boundary}当前选中对象（每次发送消息按当前便笺状态重新读取）：`]
    for (const item of selection.slice(0, 3)) {
      const detail = await readDetail(host, note.id, projectId, item.op, item.id).catch(() => undefined)
      const revision = detail?.revision ?? (detail?.production as {revision?: unknown} | undefined)?.revision
      const candidates = (detail?.production as {gameCandidates?: Array<{id: string; commit: string; status: string}>} | undefined)?.gameCandidates
      lines.push(`- ${item.op} ${quote(item.id)}${revision !== undefined ? ` · revision ${quote(String(revision))}` : ' · revision 需重新查询'}${candidates?.length ? ` · 候选 ${candidates.slice(-3).map(candidate => `${candidate.id}@${candidate.commit.slice(0, 8)}(${candidate.status})`).join('、')}` : ''}`)
    }
    lines.push('修改前查询对象的当前 revision；旧回执不能覆盖较新的要求。仅在功能进展中确认采用正式源码。')
    return lines
  }
