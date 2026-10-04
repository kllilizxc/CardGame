import { NoteIcon, useActions, useNoteConfig, useResource, useWorkbench, type WidgetProps } from "@dsh-workbench/react";
import { Button, Input, Label, ScrollShadow, SearchField, Spinner, TextField } from "@heroui/react";
import type { JsonValue } from "@dsh-workbench/runtime";
import { useEffect, useMemo, useState } from "react";
import type { ProductionState } from "./actions";
import { CardWorkflow, CreateCardWorkflow } from './card-workflow';

interface CardGameConfig { projectId?: string; projectRoot?: string; notes?: Record<string, string> }
interface Production { id: string; projectId: string; brief: string; status: string; revision: number; targetAsset?: Record<string, unknown>; pinnedRefs?: Array<Record<string, unknown> | string>; batch?: unknown; roundCount?: number; currentRound?: number; candidateCount?: number; rounds?: any[]; candidateRefs?: any[]; todoId?: string; adoption?: any; generation?: any }
interface ProductionPage { items: Production[]; nextCursor?: string; total?: number }
const PAGE_SIZE = 100;
const MAX_PAGE_CACHE = 500;
const VIRTUAL_WINDOW = 50;
const VIRTUAL_ROW_HEIGHT = 96;

export default function View({ data, mode, focus, metadata, runtime, updateData }: WidgetProps<ProductionState>) {
  const config = useNoteConfig<CardGameConfig>();
  const actions = useActions<typeof import("./actions")>();
  const workbench = useWorkbench();
  const projectId = config?.projectId || data?.projectId || "";
  const [query, setQuery] = useState(data?.query ?? "");
  const [cursor, setCursor] = useState<string | undefined>();
  const [items, setItems] = useState<Production[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [selectedId, setSelectedId] = useState(data?.selectedId);
  const [brief, setBrief] = useState("");
  const [targetAssetText, setTargetAssetText] = useState("");
  const [pinnedRefsText, setPinnedRefsText] = useState("");
  const [batchText, setBatchText] = useState("");
  const [editBrief, setEditBrief] = useState("");
  const [editTargetAssetText, setEditTargetAssetText] = useState("");
  const [editPinnedRefsText, setEditPinnedRefsText] = useState("");
  const [editBatchText, setEditBatchText] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [candidateOffset, setCandidateOffset] = useState(0);
  const page = useResource<ProductionPage>("productions", { projectId, cursor, q: query, limit: PAGE_SIZE } as unknown as JsonValue, { enabled: Boolean(projectId) });
  const selected = useResource<any>("production", selectedId ? { projectId, productionId: selectedId, historyLimit: 20 } : {}, { enabled: Boolean(projectId && selectedId) });
  const focusContext = useMemo(() => decodeCardGameFocus(focus), [focus]);
  const [expandedMounted, setExpandedMounted] = useState(mode === "expanded");
  useEffect(() => { if (mode === "expanded") setExpandedMounted(true); }, [mode]);
  const [scrollTop, setScrollTop] = useState(0);
  const virtualStart = Math.min(Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT), Math.max(0, items.length - VIRTUAL_WINDOW));
  const virtualItems = items.slice(virtualStart, virtualStart + VIRTUAL_WINDOW);

  useEffect(() => {
    const incoming = page.data?.items ?? [];
    setItems(cursor ? previous => [...previous, ...incoming.filter(item => !previous.some(existing => existing.id === item.id))].slice(-MAX_PAGE_CACHE) : incoming.slice(0, MAX_PAGE_CACHE));
    setNextCursor(page.data?.nextCursor);
  }, [cursor, page.data]);

  useEffect(() => {
    if (focusContext?.projectId === projectId && focusContext.kind === "production" && focusContext.id) setSelectedId(focusContext.id);
  }, [focusContext, projectId]);

  const detail: Production | undefined = selected.data?.production;
  const isCardProduction = Boolean(selectedId && detail?.id === selectedId && (detail.batch as any)?.kind === "card-generation");
  useEffect(() => {
    if (!detail) return;
    setEditBrief(detail.brief ?? "");
    setEditTargetAssetText(detail.targetAsset ? JSON.stringify(detail.targetAsset) : "");
    setEditPinnedRefsText((detail.pinnedRefs ?? []).map((ref: any) => typeof ref === "string" ? ref : JSON.stringify(ref)).join("\n"));
    setEditBatchText(detail.batch === undefined ? "" : JSON.stringify(detail.batch));
    setCandidateOffset(0);
  }, [detail?.id, detail?.revision]);

  async function saveState(patch: Partial<ProductionState>) { await updateData(patch); }

  async function saveDraft() {
    if (!brief.trim()) return;
    setBusy("draft"); setError(undefined);
    try {
      const targetValue = parseJsonField(targetAssetText, "目标资源");
      const targetAsset = targetValue && typeof targetValue === "object" && !Array.isArray(targetValue) ? targetValue as Record<string, unknown> : undefined;
      const batch = parseJsonField(batchText, "批次");
      const pinnedRefs = parseRefs(pinnedRefsText);
      const result = await actions.upsertRequest({ projectId, brief: brief.trim(), ...(targetAsset === undefined ? {} : { targetAsset }), ...(batch === undefined ? {} : { batch }), ...(pinnedRefs.length ? { pinnedRefs } : {}) });
      setBrief(""); setTargetAssetText(""); setPinnedRefsText(""); setBatchText(""); setCursor(undefined); setSelectedId(result.production?.id); await saveState({ projectId, selectedId: result.production?.id });
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(undefined); }
  }

  async function saveRequirement() {
    if (!detail || !editBrief.trim()) return;
    setBusy(`edit:${detail.id}`); setError(undefined);
    try {
      const targetValue = parseJsonField(editTargetAssetText, "目标资源");
      const targetAsset = targetValue && typeof targetValue === "object" && !Array.isArray(targetValue) ? targetValue as Record<string, unknown> : undefined;
      const batch = parseJsonField(editBatchText, "批次");
      const pinnedRefs = parseRefs(editPinnedRefsText);
      await actions.updateProduction({ projectId, productionId: detail.id, baseRevision: detail.revision, patch: { brief: editBrief.trim(), targetAsset, batch, pinnedRefs } });
      setCursor(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(undefined); }
  }

  async function run(item: Production, newRound = false) {
    setBusy(item.id); setError(undefined);
    try {
      if (newRound) await actions.newRound({ projectId, productionId: item.id });
      else if ((item.roundCount ?? item.rounds?.length ?? 0) > 0 && ["queued", "running", "reserved"].includes(item.status)) await actions.retry({ projectId, productionId: item.id });
      else await actions.generate({ projectId, productionId: item.id });
      setCursor(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(undefined); }
  }

  async function adopt(production: Production, candidate: any) {
    const candidateId = candidate.id ?? candidate.key ?? candidate.assetId;
    if (!candidateId) return;
    setBusy(`adopt:${candidateId}`); setError(undefined);
    try { await actions.adoptAsset({ projectId, productionId: production.id, candidateId }); setCursor(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(undefined); }
  }

  async function reject(production: Production, candidate: any, reason?: string) {
    const candidateId = candidate.id ?? candidate.key ?? candidate.assetId;
    if (!candidateId) return;
    setBusy(`reject:${candidateId}`); setError(undefined);
    try { await actions.rejectCandidate({ projectId, productionId: production.id, candidateId, baseRevision: production.revision, ...(reason ? { reason } : {}) }); setCursor(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(undefined); }
  }

  if (!projectId) return <section className="cg-production cg-empty"><style>{STYLES}</style><NoteIcon icon={metadata.icon} size={18} /><strong>AI 资源生产</strong><span>请先配置 projectId 和 projectRoot。</span></section>;

  const compact = <section className="cg-production cg-compact"><style>{STYLES}</style><header><span className="cg-brand"><NoteIcon icon={metadata.icon} size={14} /><strong>AI 生产</strong></span><span>{page.data?.total ?? items.length} 请求</span></header><ScrollShadow className="cg-list" style={{ maxHeight: 120 }}>{page.loading && <Spinner size="sm" />}{items.slice(0, 3).map(item => <button className="cg-row" type="button" key={item.id} onClick={() => { setSelectedId(item.id); void saveState({ selectedId: item.id }); void workbench.openNote(runtime.note.id); }}><span className={`cg-status-dot status-${item.status}`} /><span className="cg-title">{item.brief}</span><span className="cg-status">{((item as any).deckProgress ? `${(item as any).deckProgress.distinctCards} 种 · ${(item as any).deckProgress.totalCopies}/${(item as any).deckProgress.targetSize} 张` : (item as any).workflowKind === "card-generation" ? `${(item as any).cardProgress?.done ?? 0}/${(item as any).cardProgress?.total ?? 0} 候选` : productionLabel(item.status))}</span></button>)}{!page.loading && items.length === 0 && <span className="cg-muted">暂无制作请求</span>}</ScrollShadow>{page.error && <span className="cg-error">{page.error.message}</span>}</section>;

  return (<>
    {mode === "compact" && compact}
    <div hidden={mode === "compact"}>
    {(expandedMounted || mode === "expanded") && <section className="cg-production">
      <style>{STYLES}</style>
      <header className="cg-header">
        <div className="cg-brand"><span className="cg-icon"><NoteIcon icon={metadata.icon} size={16} /></span><div><strong>AI 资源生产</strong><small>{projectId}</small></div></div>
        <span className="cg-muted">{page.data?.total ?? items.length} 请求</span>
      </header>
      {isCardProduction ? <div className="cg-card-route"><Button size="sm" variant="tertiary" style={{ color: 'var(--wb-accent)', background: 'transparent' }} onPress={() => { setSelectedId(''); void saveState({ selectedId: '' }); }}>← 返回</Button></div> : <div className="cg-toolbar">
        <SearchField aria-label="搜索制作请求" value={query} onChange={value => { setQuery(value); setCursor(undefined); void saveState({ query: value }); }} onSubmit={() => setCursor(undefined)} fullWidth>
          <SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder="搜索 brief 或请求 ID" /><SearchField.ClearButton aria-label="清空搜索" /></SearchField.Group>
        </SearchField>
      </div>}
      {isCardProduction ? <CardWorkflow projectId={projectId} productionId={detail!.id} libraryNoteId={config?.notes?.cards} /> : <>
      <CreateCardWorkflow projectId={projectId} onCreated={id => { setSelectedId(id); setCursor(undefined); void saveState({ selectedId: id }); }} />
      <details><summary className="cg-muted">其他素材制作请求</summary>
      <form className="cg-create" onSubmit={event => { event.preventDefault(); void saveDraft(); }}>
        <TextField value={brief} onChange={setBrief} fullWidth aria-label="新建制作草稿"><Label>新建制作草稿</Label><Input placeholder="描述要制作的素材和验收目标…" /></TextField>
        <label className="cg-field">目标资源 JSON<textarea value={targetAssetText} onChange={event => setTargetAssetText(event.target.value)} placeholder="{&quot;kind&quot;:&quot;asset&quot;,&quot;id&quot;:&quot;…&quot;}" /></label>
        <label className="cg-field">固定参考（每行一条）<textarea value={pinnedRefsText} onChange={event => setPinnedRefsText(event.target.value)} placeholder="cards/hero.md / asset:portrait" /></label>
        <label className="cg-field">批次 JSON<textarea value={batchText} onChange={event => setBatchText(event.target.value)} placeholder="{&quot;count&quot;:4}" /></label>
        <Button type="submit" variant="primary" isDisabled={!brief.trim() || busy === "draft"}>{busy === "draft" ? "保存中…" : "保存草稿"}</Button>
      </form>
      </details>
      <div className="cg-body">
        <ScrollShadow className="cg-list cg-expanded-list" onScroll={event => setScrollTop((event.currentTarget as HTMLElement).scrollTop)}>
          {page.loading && items.length === 0 && <div className="cg-loading"><Spinner />正在读取…</div>}
          <div style={{ height: virtualStart * VIRTUAL_ROW_HEIGHT }} aria-hidden="true" />
          {virtualItems.map(item => {
            const roundCount = item.roundCount ?? item.rounds?.length ?? 0;
            const candidateCount = item.candidateCount ?? item.candidateRefs?.length ?? 0;
            const running = ["running", "queued", "reserved"].includes(item.status);
            return <article className={`cg-item ${selectedId === item.id ? "selected" : ""}`} key={item.id} onClick={() => { setSelectedId(item.id); void saveState({ selectedId: item.id }); }}>
              <div className="cg-item-head"><span className={`cg-status-dot status-${item.status}`} /><strong>{item.brief}</strong><span className="cg-pill">{((item as any).deckProgress ? `${(item as any).deckProgress.distinctCards} 种 · ${(item as any).deckProgress.totalCopies}/${(item as any).deckProgress.targetSize} 张` : (item as any).workflowKind === "card-generation" ? `${(item as any).cardProgress?.done ?? 0}/${(item as any).cardProgress?.total ?? 0} 候选` : productionLabel(item.status))}</span></div>
              <div className="cg-item-meta"><span>{item.id}</span><span>rev {item.revision}</span><span>{candidateCount} 候选</span><span>{roundCount} 轮</span></div>
              <div className="cg-item-actions">
                {(item as any).workflowKind === 'card-generation' ? <span className="cg-muted">卡牌工作流 · 选择继续</span> : <Button size="sm" variant="primary" isDisabled={busy === item.id || running} onPress={() => void run(item)}>{running ? "执行中" : "生成"}</Button>}
                {roundCount > 0 && <Button size="sm" variant="tertiary" isDisabled={busy === item.id} onPress={() => void run(item, true)}>新一轮</Button>}
              </div>
            </article>;
          })}
          <div style={{ height: Math.max(0, (items.length - virtualStart - virtualItems.length) * VIRTUAL_ROW_HEIGHT) }} aria-hidden="true" />
          {!page.loading && items.length === 0 && <div className="cg-empty"><strong>暂无制作请求</strong><span>先保存一个草稿，再明确生成。</span></div>}
          {nextCursor && <Button variant="tertiary" onPress={() => setCursor(nextCursor)}>加载下一页（最多 {PAGE_SIZE} 项）</Button>}
        </ScrollShadow>
        <aside className="cg-detail">
          {(detail?.batch as any)?.kind === 'card-generation' ? <p className="cg-muted">卡牌制作步骤、模板预览和生图回填位于上方。选择其他制作单可继续素材生产。</p> : detail ? <>
            <span className="cg-eyebrow">制作请求 · {detail.id}</span>
            <h2>{detail.brief}</h2>
            <div className="cg-requirement-editor">
              <TextField value={editBrief} onChange={setEditBrief} fullWidth aria-label="编辑需求"><Label>需求</Label><Input /></TextField>
              <label className="cg-field">目标资源 JSON<textarea value={editTargetAssetText} onChange={event => setEditTargetAssetText(event.target.value)} /></label>
              <label className="cg-field">固定参考<textarea value={editPinnedRefsText} onChange={event => setEditPinnedRefsText(event.target.value)} /></label>
              <label className="cg-field">批次 JSON<textarea value={editBatchText} onChange={event => setEditBatchText(event.target.value)} /></label>
              <Button size="sm" variant="tertiary" isDisabled={busy === `edit:${detail.id}`} onPress={() => void saveRequirement()}>保存需求</Button>
            </div>
            <div className="cg-detail-status"><span>{productionLabel(detail.status)}</span><span>rev {detail.revision}</span><span>{detail.rounds?.length ?? detail.roundCount ?? 0} 轮</span></div>
            {selected.data?.execution && <div className="cg-execution"><h3>执行进度</h3><div className="cg-detail-status"><span>{selected.data.execution.status || "未知"}</span>{selected.data.execution.id && <span>{selected.data.execution.id}</span>}{selected.data.execution.updatedAt && <span>{selected.data.execution.updatedAt}</span>}</div>{selected.data.execution.outcome?.summary && <p>{selected.data.execution.outcome.summary}</p>}{selected.data.execution.delivery?.status && <span className="cg-muted">交付：{selected.data.execution.delivery.status}</span>}</div>}
            <div className="cg-detail-actions"><Button size="sm" variant="primary" isDisabled={busy === detail.id || ["running", "queued", "reserved"].includes(detail.status)} onPress={() => void run(detail)}>{["running", "queued", "reserved"].includes(detail.status) ? "执行中" : "明确生成"}</Button><Button size="sm" variant="tertiary" isDisabled={busy === detail.id} onPress={() => void run(detail, true)}>新一轮</Button></div>
            <h3>候选（每页比较 3 个）</h3>
            <ScrollShadow className="cg-candidates" style={{ maxHeight: 390 }}>{(detail.candidateRefs ?? []).slice(candidateOffset, candidateOffset + 3).map((candidate: any) => <CandidateMedia key={candidate.id ?? candidate.key ?? candidate.assetId} projectId={projectId} candidate={candidate} busy={busy} adopted={detail.adoption?.candidateId !== undefined && detail.adoption?.candidateId === (candidate.id ?? candidate.key ?? candidate.assetId)} onAdopt={() => void adopt(detail, candidate)} onReject={reason => void reject(detail, candidate, reason)} />)}{!detail.candidateRefs?.length && <span className="cg-muted">尚无候选；生成完成后由资源后端登记。</span>}</ScrollShadow>
            {(detail.candidateRefs?.length ?? 0) > 3 && <div className="cg-detail-actions"><Button size="sm" variant="tertiary" isDisabled={candidateOffset === 0} onPress={() => setCandidateOffset(Math.max(0, candidateOffset - 3))}>上一组</Button><span className="cg-muted">{candidateOffset + 1}–{Math.min(candidateOffset + 3, detail.candidateRefs!.length)} / {detail.candidateRefs!.length}</span><Button size="sm" variant="tertiary" isDisabled={candidateOffset + 3 >= detail.candidateRefs!.length} onPress={() => setCandidateOffset(candidateOffset + 3)}>下一组</Button></div>}
            <h3>轮次与结果</h3>
            <ScrollShadow className="cg-history" style={{ maxHeight: 170 }}>{detail.rounds?.slice().reverse().map((round: any) => <div className="cg-history-row" key={round.requestId}><strong>第 {round.round} 轮 · {round.status}</strong><span>{round.result?.conclusion || round.result?.error || round.requestId}</span><small>{round.updatedAt}</small></div>)}</ScrollShadow>
          </> : <div className="cg-empty"><strong>选择一个制作请求</strong><span>生成状态、候选和轮次结果会按需读取。</span></div>}
        </aside>
      </div>
      </>}
      {(error || page.error || selected.error) && <p className="cg-error" role="alert">{error || page.error?.message || selected.error?.message}</p>}
    </section>}
    </div>
  </>);
}

function CandidateMedia({ projectId, candidate, busy, adopted, onAdopt, onReject }: { projectId: string; candidate: any; busy?: string; adopted?: boolean; onAdopt: () => void; onReject: (reason?: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const path = typeof candidate.sourcePath === "string" ? candidate.sourcePath : typeof candidate.path === "string" ? candidate.path : undefined;
  const candidateId = typeof candidate.id === "string" ? candidate.id : typeof candidate.assetId === "string" ? candidate.assetId : undefined;
  const media = useResource<any>("media", path || candidateId ? { projectId, ...(path ? { path } : { id: candidateId }), variant: "original" } : {}, { enabled: Boolean(path || candidateId) });
  const mediaValue = media.data && typeof media.data === "object" && !Array.isArray(media.data) ? media.data as Record<string, any> : {};
  const resolved = { ...candidate, ...mediaValue };
  const src = typeof mediaValue.url === "string" ? mediaValue.url : typeof mediaValue.src === "string" ? mediaValue.src : typeof mediaValue.data === "string" ? mediaValue.data : undefined;
  const mimeType = typeof resolved.mimeType === "string" ? resolved.mimeType : "";
  const id = candidate.id ?? candidate.key ?? candidate.assetId;
  const rejected = typeof candidate.rejectedAt === "string";
  const confirmReject = () => { setRejecting(false); const value = reason.trim(); setReason(""); onReject(value || undefined); };
  return <div className={`cg-candidate${rejected ? " rejected" : ""}`}><div className="cg-media-preview">{src && mimeType.startsWith("audio/") ? <audio controls preload="metadata" src={src} onPlay={event => { const current = event.currentTarget; if (typeof document !== "undefined") document.querySelectorAll("audio").forEach(audio => { if (audio !== current) audio.pause(); }); }} /> : src && mimeType.startsWith("video/") ? <video controls preload="metadata" src={src} /> : src ? <img src={src} alt="候选预览" loading="lazy" /> : <span className="cg-muted">{media.loading ? "媒体读取中…" : "暂无预览"}</span>}</div><div className="cg-candidate-info"><strong>{id}</strong><small>{mimeType || candidate.version || "候选引用"}</small><small>{candidate.width || resolved.width ? `${candidate.width ?? resolved.width} × ${candidate.height ?? resolved.height ?? "?"}` : ""}{candidate.durationMs || resolved.durationMs ? ` · ${Math.round((candidate.durationMs ?? resolved.durationMs) / 1000)}s` : ""}{resolved.revision ? ` · rev ${resolved.revision}` : ""}</small>{rejected && <small className="cg-rejected-label">已否决{typeof candidate.rejectReason === "string" && candidate.rejectReason ? `：${candidate.rejectReason}` : ""}</small>}</div>{rejecting ? <span className="cg-reject-prompt"><input value={reason} onChange={event => { setReason(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") confirmReject(); }} placeholder="原因（可选）" aria-label="否决原因" autoFocus /><Button size="sm" variant="primary" isDisabled={busy === `reject:${id}`} onPress={confirmReject}>确认</Button><Button size="sm" variant="tertiary" onPress={() => { setRejecting(false); setReason(""); }}>取消</Button></span> : <><Button size="sm" variant="tertiary" isDisabled={busy === `adopt:${id}` || adopted || rejected} onPress={onAdopt}>采用</Button>{!adopted && !rejected && <Button size="sm" variant="tertiary" isDisabled={busy === `reject:${id}`} onPress={() => setRejecting(true)}>否决</Button>}</>}</div>;
}

function decodeCardGameFocus(itemId: string | undefined): { projectId: string; kind: string; id?: string } | undefined {
  if (!itemId?.startsWith("cg:")) return undefined;
  try {
    const value = JSON.parse(decodeURIComponent(itemId.slice(3))) as Record<string, unknown>;
    if (!value || typeof value.projectId !== "string" || typeof value.kind !== "string") return undefined;
    return { projectId: value.projectId, kind: value.kind, ...(typeof value.id === "string" ? { id: value.id } : {}) };
  } catch {
    return undefined;
  }
}

function parseJsonField(value: string, label: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch { throw new Error(`${label} JSON 无效`); }
}

function parseRefs(value: string): Array<Record<string, unknown> | string> {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean).map(item => {
    try {
      const parsed = JSON.parse(item) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : item;
    } catch {
      return item;
    }
  });
}

function productionLabel(status: string): string {
  return status === "draft" ? "草稿" : status === "reserved" ? "待交办" : status === "queued" ? "排队" : status === "running" ? "进行中" : status === "completed" ? "已生成" : status === "adopted" ? "已采用" : status === "failed" ? "失败" : status === "stale" ? "旧结果" : status;
}

const STYLES = `
.cg-production{box-sizing:border-box;min-height:100dvh;padding:16px;background:var(--wb-paper);color:var(--wb-ink);font-family:var(--wb-font-family);display:flex;flex-direction:column;gap:14px;min-width:0}.cg-production.cg-compact{padding:12px;gap:8px;font-size:12px}.cg-production header,.cg-brand,.cg-toolbar,.cg-create,.cg-item-head,.cg-item-meta,.cg-item-actions,.cg-detail-status,.cg-detail-actions,.cg-candidate{display:flex;align-items:center;gap:8px}.cg-header{justify-content:space-between}.cg-brand small{display:block;color:var(--wb-muted);font-size:11px;margin-top:2px}.cg-icon{display:grid;place-items:center}.cg-toolbar{flex-wrap:wrap}.cg-create{align-items:end;flex-wrap:wrap}.cg-field{display:grid;gap:3px;min-width:150px;color:var(--wb-muted);font-size:11px}.cg-field textarea{min-height:34px;max-width:220px;border:1px solid var(--wb-line);border-radius:6px;padding:5px;background:var(--wb-paper);color:var(--wb-ink);font:inherit}.cg-requirement-editor{display:grid;gap:7px;margin:12px 0}.cg-requirement-editor .cg-field textarea{max-width:none}.cg-create .heroui-TextField{flex:1;min-width:0}.cg-body{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(250px,.85fr);gap:16px;min-height:0;flex:1}.cg-list{display:flex;flex-direction:column;gap:8px;min-height:0}.cg-expanded-list{max-height:590px;overflow:auto;padding-right:4px}.cg-row{display:flex;align-items:center;gap:7px;width:100%;padding:7px 4px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.cg-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cg-status,.cg-muted,.cg-eyebrow,.cg-item-meta,.cg-history-row small{color:var(--wb-muted)}.cg-item{padding:11px;border-radius:var(--wb-radius-small);background:var(--wb-surface);cursor:pointer}.cg-item.selected{background:var(--wb-accent-pale)}.cg-item-head strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cg-item-meta{font-size:11px;flex-wrap:wrap;margin-top:7px}.cg-item-actions,.cg-detail-actions{margin-top:8px;flex-wrap:wrap}.cg-pill{font-size:11px;padding:2px 6px;border-radius:999px;background:var(--wb-surface-deep);color:var(--wb-ink-soft)}.cg-status-dot{width:8px;height:8px;border-radius:50%;background:var(--wb-muted);flex:none}.status-queued,.status-running,.status-reserved{background:var(--wb-accent)}.status-completed,.status-adopted{background:var(--wb-success)}.status-failed,.status-stale{background:var(--wb-danger)}.cg-detail{min-width:0;padding:14px;background:var(--wb-surface);border-radius:var(--wb-radius)}.cg-detail h2{font-size:18px;margin:8px 0}.cg-detail h3{font-size:13px;margin:18px 0 8px}.cg-candidates,.cg-history{display:flex;flex-direction:column;gap:8px}.cg-candidate{padding:8px;background:var(--wb-surface-deep);border-radius:var(--wb-radius-small)}.cg-media-preview{width:180px;min-height:130px;display:grid;place-items:center;overflow:hidden;border-radius:6px;background:var(--wb-paper)}.cg-media-preview img,.cg-media-preview video{width:180px;max-height:160px;object-fit:contain}.cg-media-preview audio{width:180px}.cg-candidate div{display:grid;gap:2px;min-width:0;flex:1}.cg-candidate small{color:var(--wb-muted)}.cg-candidate.rejected{opacity:.55}.cg-rejected-label{color:var(--wb-danger)!important}.cg-reject-prompt{display:flex;align-items:center;gap:6px}.cg-reject-prompt input{width:110px;height:28px;padding:3px 7px;border:1px solid var(--wb-line);border-radius:6px;background:var(--wb-paper);color:var(--wb-ink);font:inherit}.cg-history-row{display:grid;gap:2px;padding-bottom:8px;border-bottom:1px solid var(--wb-line-soft)}.cg-error{color:var(--wb-danger);font-size:12px}.cg-empty{display:flex;align-items:center;justify-content:center;gap:8px;flex-direction:column;min-height:120px;color:var(--wb-muted)}.cg-loading{display:flex;justify-content:center;align-items:center;gap:8px;padding:24px;color:var(--wb-muted)}
@media(max-width:700px){.cg-production{padding:12px}.cg-body{grid-template-columns:1fr}.cg-create{align-items:stretch}.cg-create button{align-self:end}}
`;
