import { NoteIcon } from "@dsh-workbench/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
// @ts-expect-error The note bundler loads the shared stylesheet export.
import "@heroui/styles/css";
import { useActions, useNoteConfig, useResource, useWorkbench, type WidgetProps } from "@dsh-workbench/react";
import type { TodoState, TodoPage, TodoItem, TodoImage, TodoPriority, TodoStatus } from "./actions";
import { ImageAttachments, MAX_PASTED_IMAGES, mergePastedImages, pasteClipboardImages } from "./images";

function cardGameLink(context: { projectId: string; kind: "production"; id: string; intent: "open" }): string {
  return `cg:${encodeURIComponent(JSON.stringify(context))}`;
}

function normalizeStatus(item: { status?: string; completed?: boolean }): TodoStatus {
  if (item.status === "in_progress" || item.status === "done" || item.status === "todo") {
    return item.status;
  }
  if (item.status === "blocked") return "in_progress";
  return item.completed ? "done" : "todo";
}

// 雅致高级微彩色阶 (保留高级感与适度愉悦感，避免纯灰冷漠)
const PRIORITY_META: Record<
  TodoPriority,
  { label: string; text: string; bg: string; border: string; dot: string }
> = {
  high: { label: "高优", text: "var(--wb-danger)", bg: "var(--wb-danger-pale)", border: "var(--wb-danger-pale)", dot: "var(--wb-danger)" },
  medium: { label: "中优", text: "var(--wb-warning)", bg: "var(--wb-warning-pale)", border: "var(--wb-warning-pale)", dot: "var(--wb-warning)" },
  low: { label: "低优", text: "var(--wb-success)", bg: "var(--wb-success-pale)", border: "var(--wb-success-pale)", dot: "var(--wb-success)" },
};

const COLUMNS: Array<{
  id: TodoStatus;
  title: string;
  tag: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  dotColor: string;
}> = [
  {
    id: "todo",
    title: "待办",
    tag: "BACKLOG",
    accent: "var(--wb-muted)",
    badgeBg: "var(--wb-surface-deep)",
    badgeText: "var(--wb-ink-soft)",
    dotColor: "var(--wb-muted-light)",
  },
  {
    id: "in_progress",
    title: "进行中",
    tag: "IN PROGRESS",
    accent: "var(--wb-accent)",
    badgeBg: "var(--wb-accent-pale)",
    badgeText: "var(--wb-accent-strong)",
    dotColor: "var(--wb-accent)",
  },
  {
    id: "done",
    title: "已完成",
    tag: "COMPLETED",
    accent: "var(--wb-success)",
    badgeBg: "var(--wb-success-pale)",
    badgeText: "var(--wb-success)",
    dotColor: "var(--wb-success)",
  },
];

function SvgCheck({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SvgPlus({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SvgTrash({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function SvgSparkles({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
    </svg>
  );
}


function SvgClock({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function RequirementEditor({item,onSave}:{item:TodoItem;onSave:(input:any)=>Promise<unknown>}) {
  const [draft,setDraft]=useState<{title:string;description:string;images:TodoImage[];base:{title:string;description:string;images:TodoImage[]}}|null>(null);
  const [pending,setPending]=useState(false);const [error,setError]=useState('');
  const edit=()=>{setError('');const images=item.images??[];setDraft({title:item.title,description:item.description??'',images,base:{title:item.title,description:item.description??'',images}});};
  const handlePaste=async(event:React.ClipboardEvent<HTMLElement>)=>{
    try { const additions=await pasteClipboardImages(event);if(!additions.length)return;
      if(draft)setDraft({...draft,images:mergePastedImages(draft.images,additions)});
    } catch(error) {setError(String(error instanceof Error?error.message:error));}
  };
  if(!draft)return <div onDoubleClick={event=>{if(!(event.target as HTMLElement).closest('button'))edit();}} onKeyDown={event=>{if(event.key==='Enter' && !(event.target as HTMLElement).closest('button')){event.preventDefault();edit();}}} tabIndex={0} title="双击编辑" aria-label={`编辑待办：${item.title}`} style={{flex:1,minWidth:0}}>
    <h3 style={{margin:0,fontSize:13.5,fontWeight:500,whiteSpace:'pre-wrap'}}>{item.title}</h3>
    {item.description&&<p style={{fontSize:12,whiteSpace:'pre-wrap',margin:'4px 0'}}>{item.description}</p>}
    <ImageAttachments images={item.images}/>
  </div>;
  return <form style={{display:'grid',gap:6,flex:1,minWidth:0}} onSubmit={async event=>{event.preventDefault();setPending(true);setError('');try{await onSave({itemId:item.id,title:draft.title,description:draft.description,images:draft.images,base:draft.base});setDraft(null);}catch(error){setError(String(error instanceof Error?error.message:error));}finally{setPending(false);}}}>
    <textarea autoFocus aria-label="待办标题" rows={2} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})} onPaste={handlePaste}/>
    <textarea aria-label="待办详情" rows={3} value={draft.description} onChange={event=>setDraft({...draft,description:event.target.value})} onPaste={handlePaste} placeholder="待办详情"/>
    <ImageAttachments images={draft.images} onRemove={id=>setDraft(current=>current?{...current,images:current.images.filter(image=>image.id!==id)}:current)}/>
    <small>在标题或详情中粘贴图片 · 最多 {MAX_PASTED_IMAGES} 张</small>
    <small>保存后点击“继续交付”，才会发送到执行台。</small>
    {error&&<span role="alert">{error}</span>}
    <div><button type="submit" disabled={pending||!draft.title.trim()}>保存修改</button><button type="button" disabled={pending} onClick={()=>setDraft(null)}>取消</button></div>
  </form>;
}

export default function View({ data: storedData, mode, focus: focusItem, metadata }: WidgetProps<TodoState>) {
  const config = useNoteConfig<{projectId?:string; notes?:Record<string,string>}>();
  const projectId = config?.projectId || storedData?.projectId || "";
  const [cursor, setCursor] = useState<string>();
  const [loaded, setLoaded] = useState<TodoItem[]>([]);
  const page = useResource<TodoPage>("todos", {projectId, limit:100, ...(cursor ? {cursor} : {})}, {enabled:!!projectId});
  const totals = useResource<{counts:{todos:number;todo:number;inProgress:number;done:number;blocked:number}}>("workflowStatus", {projectId}, {enabled:!!projectId});
  const focus = useMemo(() => decodeCardGameFocus(focusItem), [focusItem]);
  const [expandedMounted, setExpandedMounted] = useState(mode === "expanded");
  useEffect(() => { if (mode === "expanded") setExpandedMounted(true); }, [mode]);
  const appliedFocus = useRef<typeof focus>(undefined);
  const pendingFocusId = useRef<string | undefined>(undefined);
  const [draftContext, setDraftContext] = useState<Record<string,unknown> | undefined>(undefined);
  const focused = useResource<{item:TodoItem}>("todo", {projectId,id:focus?.id || ""}, {enabled:!!projectId && focus?.projectId === projectId && focus?.kind === "todo" && !!focus.id});
  useEffect(() => { const incoming=page.data?.items??[]; setLoaded(old => cursor ? [...old.filter(item=>!incoming.some(next=>next.id===item.id)),...incoming].slice(-500) : incoming); }, [page.data,cursor]);
  const data = { items: loaded, executionDesk: {noteId: config?.notes?.execution || ""} };
  const draftRef = contentReferenceFromDraft(draftContext);
  const changed = () => setCursor(undefined);

  const actions = useActions<typeof import("./actions")>();
  const [quickInput, setQuickInput] = useState("");
  const [quickImages, setQuickImages] = useState<TodoImage[]>([]);
  const [activeColumnInput, setActiveColumnInput] = useState<TodoStatus | null>(null);
  const [columnInputTitle, setColumnInputTitle] = useState(quickInput);
  const [columnInputImages, setColumnInputImages] = useState<TodoImage[]>([]);
  const [columnInputCategory, setColumnInputCategory] = useState("开发");
  const [columnInputPriority, setColumnInputPriority] = useState<TodoPriority>("medium");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [delegatingItemId, setDelegatingItemId] = useState<string | null>(null);

  const workbench = useWorkbench();
  const items: TodoItem[] = useMemo(() => {
    const selected=focused.data?.item;
    const source=selected&&!data.items.some(item=>item.id===selected.id)?[selected,...data.items]:data.items;
    return source.map(item=>({...item,status:normalizeStatus(item),delivery:item.status === "blocked" ? "需要处理" : item.status === "done" ? "已完成" : "执行进展",next:"打开执行台"}));
  }, [data.items,focused.data]);
  useEffect(() => {
    if (appliedFocus.current === focus) return;
    pendingFocusId.current = undefined;
    if (!focus) { appliedFocus.current = undefined; return; }
    if (focus.projectId !== projectId || focus.kind !== "todo") return;
    // Consume even a declined request so a mode change cannot ask again.
    appliedFocus.current = focus;
    if (focus.intent === "draft") {
      if ((quickInput || columnInputTitle || quickImages.length || columnInputImages.length) && !window.confirm("当前有未提交的待办草稿，确定替换为新的反馈草稿吗？")) return;
      const context = focus.context;
      const title = typeof context?.title === "string" ? context.title : typeof context?.brief === "string" ? context.brief : "";
      setDraftContext(context);
      setQuickInput(title); setQuickImages([]);
      setColumnInputTitle(title); setColumnInputImages([]);
      setActiveColumnInput("todo");
    }
    setFilterCategory("ALL");
    pendingFocusId.current = focus.id;
  }, [focus, projectId, quickInput, columnInputTitle, quickImages.length, columnInputImages.length]);
  useEffect(() => {
    if (mode !== "expanded" || !pendingFocusId.current) return;
    const target = document.getElementById(`todo-${pendingFocusId.current}`);
    if (target) { target.scrollIntoView({ block: "center" }); pendingFocusId.current = undefined; }
  }, [focus, mode, items, filterCategory]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return ["ALL", ...Array.from(set)];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filterCategory === "ALL") return items;
    return items.filter((i) => i.category === filterCategory);
  }, [items, filterCategory]);

  const todoItems = useMemo(() => filteredItems.filter((i) => i.status === "todo"), [filteredItems]);
  const inProgressItems = useMemo(() => filteredItems.filter((i) => i.status === "in_progress"), [filteredItems]);
  const doneItems = useMemo(() => filteredItems.filter((i) => i.status === "done"), [filteredItems]);

  const totalCount = totals.data?.counts.todos ?? items.length;
  const doneCount = totals.data?.counts.done ?? items.filter((i) => i.status === "done").length;
  const inProgressCount = totals.data ? totals.data.counts.inProgress + totals.data.counts.blocked : items.filter((i) => i.status === "in_progress").length;
  const pendingCount = totals.data?.counts.todo ?? items.filter((i) => i.status === "todo").length;
  const progressRatio = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleQuickPaste = async (event: React.ClipboardEvent<HTMLElement>) => {
    try { const additions=await pasteClipboardImages(event);if(additions.length)setQuickImages(mergePastedImages(quickImages,additions)); }
    catch(error) {showToast(error instanceof Error?error.message:"图片粘贴失败");}
  };
  const handleColumnPaste = async (event: React.ClipboardEvent<HTMLElement>) => {
    try { const additions=await pasteClipboardImages(event);if(additions.length)setColumnInputImages(mergePastedImages(columnInputImages,additions)); }
    catch(error) {showToast(error instanceof Error?error.message:"图片粘贴失败");}
  };

  const revisionFor = (id: string) => {
    const item = items.find(value => value.id === id);
    if (!item) throw new Error("待办已更新，请重新打开");
    return item.revision;
  };

  const handleQuickAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = quickInput.trim() || (quickImages.length ? "图片待办" : "");
    if (!title) return;
    try {
      await actions.addTodo({ title, images: quickImages, status: "todo", priority: "medium", ...(draftContext ? {context:draftContext} : {}) });
      setQuickInput(""); setQuickImages([]); setDraftContext(undefined); changed();
      showToast("已录入待办");
    } catch (err) { showToast(err instanceof Error ? err.message : "录入失败"); }
  };

  const handleAddInColumn = async (status: TodoStatus) => {
    const title = columnInputTitle.trim() || (columnInputImages.length ? "图片待办" : "");
    if (!title) { setActiveColumnInput(null); return; }
    try {
      await actions.addTodo({
        title, images: columnInputImages, status, priority: columnInputPriority,
        category: columnInputCategory, ...(draftContext ? {context:draftContext} : {}),
      });
      setColumnInputTitle(""); setColumnInputImages([]); setActiveColumnInput(null);
      setDraftContext(undefined); changed(); showToast("任务已加入看板");
    } catch (err) { showToast(err instanceof Error ? err.message : "添加失败"); }
  };

  const handleToggle = async (id: string) => {
    try {
      await actions.toggleTodo({ id, baseRevision: revisionFor(id) }); changed();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleMove = async (id: string, newStatus: TodoStatus) => {
    try {
      await actions.updateStatus({ id, status: newStatus, baseRevision:revisionFor(id) }); changed();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await actions.removeTodo({ id, baseRevision:revisionFor(id) }); changed();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleClearDone = async () => {
    try {
      await actions.clearCompleted({items:doneItems.map(item=>({id:item.id,baseRevision:item.revision}))}); changed();
      showToast("已清理完成事项");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleAiSuggest = async () => {
    setIsAiLoading(true);
    showToast("AI 规划梳理中...");
    try {
      const res = await actions.generateSuggestions({ prompt: "当前项目极简敏捷迭代" });
      changed(); showToast(`已智能规划新增 ${res.addedCount} 项任务`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "规划失败");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDelegate = async (item: TodoItem) => {
    if (delegatingItemId) return;
    setDelegatingItemId(item.id);
    try {
      const result = await actions.delegateTodo({ itemId: item.id, projectId }); changed();
      showToast(result.updateStatus === "queued" ? "调整已保存，等待原任务继续" : "需求已送入执行台原会话");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "交办失败");
    } finally {
      setDelegatingItemId(null);
    }
  };

  // ==========================================
  // COMPACT MODE: 手机桌面小组件 (固定高度摘要)
  // ==========================================
  const compact = (
      <div
        style={{
          boxSizing: "border-box",
          minHeight: "100dvh",
          padding: 16,
          background: "var(--wb-paper)",
          color: "var(--wb-ink)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
        }}
      >
        {/* Top Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "linear-gradient(135deg, var(--wb-accent), var(--wb-accent-strong))",
                color: "var(--wb-accent-foreground)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(59, 130, 246, 0.25)",
              }}
            >
              <NoteIcon icon={metadata.icon} size={14} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--wb-ink)", lineHeight: 1.2 }}>
                {metadata.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--wb-muted)", marginTop: 2 }}>
                {pendingCount + inProgressCount > 0 ? `${pendingCount + inProgressCount} 项未完成` : "全部完成 🎉"}
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
              padding: "2px 8px",
              borderRadius: 12,
              background: progressRatio === 100 && totalCount > 0 ? "var(--wb-success-pale)" : "var(--wb-accent-pale)",
              color: progressRatio === 100 && totalCount > 0 ? "var(--wb-success)" : "var(--wb-accent)",
            }}
          >
            {progressRatio}%
          </div>
        </div>

        {/* 经典高质感彩色渐变进度条 (Blue -> Emerald) */}
        <div
          style={{
            height: 6,
            background: "var(--wb-surface-deep)",
            borderRadius: 999,
            overflow: "hidden",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressRatio}%`,
              background: "linear-gradient(90deg, var(--wb-accent) 0%, var(--wb-success) 100%)",
              borderRadius: 999,
              transition: "width 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 0 8px rgba(16, 185, 129, 0.35)",
            }}
          />
        </div>

        {/* 快速录入输入框 */}
        <form onSubmit={handleQuickAdd} style={{ display: "flex", gap: 6 }}>
          <input
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onPaste={handleQuickPaste}
            placeholder="快速添加待办事项…（可粘贴图片）"
            style={{
              flex: 1,
              height: 30,
              padding: "0 10px",
              background: "var(--wb-surface)",
              border: "1px solid var(--wb-line)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--wb-ink)",
              outline: "none",
              transition: "all 0.15s ease",
            }}
          />
          <button
            type="submit"
            style={{
              height: 30,
              padding: "0 10px",
              background: "linear-gradient(135deg, var(--wb-accent), var(--wb-accent-strong))",
              border: "none",
              borderRadius: 6,
              color: "var(--wb-accent-foreground)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 1px 4px rgba(37, 99, 235, 0.25)",
            }}
          >
            <SvgPlus size={14} />
          </button>
        </form>
        <ImageAttachments compact images={quickImages} onRemove={id=>setQuickImages(current=>current.filter(image=>image.id!==id))}/>

        {/* 待办微清单 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.slice(0, 4).map((item) => {
            const isDone = item.status === "done";
            const pri = item.priority ? PRIORITY_META[item.priority] : null;

            return (
              <div
                key={item.id}
                role="button" tabIndex={0} aria-disabled={Boolean(item.taskId)} title={item.taskId?"状态由执行台更新":undefined}
                onClick={() => !item.taskId && void handleToggle(item.id)}
                onKeyDown={event => { if (!item.taskId && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void handleToggle(item.id); } }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 9px",
                  borderRadius: 6,
                  cursor: "pointer",
                  userSelect: "none",
                  background: isDone ? "var(--wb-surface)" : "var(--wb-paper)",
                  border: isDone ? "1px solid var(--wb-surface-deep)" : "1px solid var(--wb-line)",
                  boxShadow: isDone ? "none" : "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 4,
                    border: isDone ? "1px solid var(--wb-success)" : "1.5px solid var(--wb-line)",
                    background: isDone ? "var(--wb-success)" : "var(--wb-paper)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--wb-accent-foreground)",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                >
                  {isDone && <SvgCheck size={10} />}
                </div>

                <span
                  style={{
                    fontSize: 12,
                    color: isDone ? "var(--wb-muted-light)" : "var(--wb-ink)",
                    textDecoration: isDone ? "line-through" : "none",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title}
                </span>

                {item.images?.length ? <span aria-label={`${item.images.length} 张图片`} style={{fontSize:11,color:"var(--wb-muted)"}}>▧{item.images.length > 1 ? ` ${item.images.length}` : ""}</span> : null}

                {item.status === "in_progress" && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--wb-accent)",
                      background: "var(--wb-accent-pale)",
                      padding: "1px 6px",
                      borderRadius: 4,
                      border: "1px solid var(--wb-accent-pale)",
                    }}
                  >
                    进行中
                  </span>
                )}

                {pri && !isDone && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: pri.text,
                      background: pri.bg,
                      border: `1px solid ${pri.border}`,
                      padding: "1px 5px",
                      borderRadius: 3,
                    }}
                  >
                    {pri.label}
                  </span>
                )}
              </div>
            );
          })}

          {items.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--wb-muted-light)", textAlign: "center", padding: "16px 0" }}>
              暂无待办事项，输入上方内容回车快速添加
            </div>
          )}

          {items.length > 4 && (
            <div style={{ fontSize: 11, color: "var(--wb-muted)", textAlign: "center", marginTop: 2 }}>
              展开查看看板其余 {items.length - 4} 项
            </div>
          )}
        </div>
      </div>
  );

  // ==========================================
  // EXPANDED MODE: 现代敏捷三列看板 (冷淡高级 + 适度色彩活力中和)
  // ==========================================
  return (<>
    {mode === "compact" && compact}
    <div hidden={mode === "compact"}>
    {(expandedMounted || mode === "expanded") && <div className="todo-expanded"
      style={{
        boxSizing: "border-box",
        padding: "24px 28px 36px",
        background: "var(--wb-surface)",
        color: "var(--wb-ink)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <style>{`@media(max-width:680px){
        .todo-expanded{padding:14px 12px 24px!important;gap:14px!important}
        .todo-expanded>header{padding:16px 14px!important}
        .todo-board{grid-template-columns:minmax(0,1fr)!important}
        .todo-board>div{min-height:160px!important}
        .todo-expanded button,.todo-expanded input{min-height:36px}
        .todo-expanded input{font-size:16px!important;min-width:0}
        .todo-expanded button{white-space:normal;overflow-wrap:anywhere}
      }`}</style>
      {draftRef && <div style={{fontSize:12,color:"var(--wb-muted)"}}>反馈草稿 · {String(draftRef.path||draftRef.id||"当前内容")}{draftRef.revision ? ` · ${String(draftRef.revision).slice(0,10)}` : ""}</div>}
      {page.error && <div role="alert">{page.error.message}</div>}
      {page.loading && !items.length && <div role="status">正在读取待办…</div>}
      {/* 顶部全景面板：包含统计卡片与经典彩色进度条 */}
      <header
        style={{
          background: "var(--wb-paper)",
          border: "1px solid var(--wb-line)",
          borderRadius: 12,
          padding: "18px 22px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          {/* 左侧品牌标示 */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--wb-accent), var(--wb-accent-strong))",
                color: "var(--wb-accent-foreground)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 3px 10px rgba(59, 130, 246, 0.3)",
              }}
            >
              <NoteIcon icon={metadata.icon} size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--wb-ink)" }}>
                  {metadata.name}
                </h1>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--wb-accent)",
                    background: "var(--wb-accent-pale)",
                    padding: "2px 7px",
                    borderRadius: 4,
                    border: "1px solid var(--wb-accent-pale)",
                  }}
                >
                  KANBAN
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--wb-muted)", marginTop: 3 }}>
                {`${totalCount} 项待办 · ${pendingCount} 待开始 · ${inProgressCount} 进行中 · ${doneCount} 完成`}
              </div>
            </div>
          </div>

          {/* 右侧动作按钮组 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {toast && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--wb-accent-strong)",
                  padding: "4px 10px",
                  background: "var(--wb-accent-pale)",
                  borderRadius: 6,
                  border: "1px solid var(--wb-accent-pale)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {toast}
              </span>
            )}

            <button
              type="button"
              disabled={isAiLoading}
              onClick={handleAiSuggest}
              style={{
                height: 32,
                padding: "0 13px",
                background: "var(--wb-paper)",
                border: "1px solid var(--wb-line)",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--wb-indigo)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                transition: "all 0.15s ease",
              }}
            >
              <SvgSparkles size={13} />
              {isAiLoading ? "AI 规划中…" : "AI 智能拆解建议"}
            </button>

            {doneItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearDone}
                style={{
                  height: 32,
                  padding: "0 11px",
                  background: "var(--wb-paper)",
                  border: "1px solid var(--wb-line)",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "var(--wb-muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {doneItems.length === doneCount ? "清理完成项" : "清理当前完成项"}
              </button>
            )}
          </div>
        </div>

        {/* 标志性彩色渐变进度条与四色数据指标条 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--wb-muted)", fontWeight: 500 }}>
              总闭环进度 ({doneCount}/{totalCount})
            </span>
            <span style={{ fontWeight: 700, fontFamily: "ui-monospace, monospace", color: "var(--wb-ink)" }}>
              {progressRatio}%
            </span>
          </div>

          <div
            style={{
              height: 7,
              background: "var(--wb-surface-deep)",
              borderRadius: 999,
              overflow: "hidden",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressRatio}%`,
                background: "linear-gradient(90deg, var(--wb-accent) 0%, var(--wb-success) 100%)",
                borderRadius: 999,
                transition: "width 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 0 10px rgba(16, 185, 129, 0.35)",
              }}
            />
          </div>
        </div>
      </header>

      {/* 分类标签过滤栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", padding: "0 2px" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--wb-muted-light)", marginRight: 4, letterSpacing: "0.05em", fontFamily: "ui-monospace, monospace" }}>
          CATEGORY:
        </span>
        {categories.map((cat) => {
          const isSelected = filterCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 5,
                border: isSelected ? "1px solid var(--wb-accent)" : "1px solid var(--wb-line)",
                background: isSelected ? "var(--wb-accent)" : "var(--wb-paper)",
                color: isSelected ? "var(--wb-paper)" : "var(--wb-ink-soft)",
                fontWeight: isSelected ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.12s ease",
                boxShadow: isSelected ? "0 1px 4px rgba(37,99,235,0.25)" : "none",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Kanban Board Grid: 铺满高度与微质感色彩强化 */}
      <div className="todo-board"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
          flex: 1,
          alignItems: "stretch",
        }}
      >
        {COLUMNS.map((col) => {
          const colItems =
            col.id === "todo" ? todoItems : col.id === "in_progress" ? inProgressItems : doneItems;
          const isAdding = activeColumnInput === col.id;

          return (
            <div
              key={col.id}
              style={{
                background: "var(--wb-surface-deep)",
                borderRadius: 10,
                border: "1px solid var(--wb-line)",
                padding: "14px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 460,
              }}
            >
              {/* Column Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: col.dotColor,
                      boxShadow: `0 0 6px ${col.dotColor}88`,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--wb-ink)" }}>{col.title}</span>
                  <span style={{ fontSize: 10, color: "var(--wb-muted-light)", letterSpacing: "0.06em", fontFamily: "ui-monospace, monospace" }}>
                    {col.tag}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "ui-monospace, monospace",
                      color: col.badgeText,
                      background: col.badgeBg,
                      border: "1px solid rgba(0,0,0,0.06)",
                      padding: "1px 7px",
                      borderRadius: 10,
                    }}
                  >
                    {colItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveColumnInput(isAdding ? null : col.id);
                      setColumnInputTitle("");
                      setColumnInputImages([]);
                    }}
                    title="添加卡片"
                    style={{
                      width: 24,
                      height: 24,
                      border: "1px solid var(--wb-line)",
                      borderRadius: 5,
                      background: "var(--wb-paper)",
                      color: "var(--wb-ink-soft)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <SvgPlus size={12} />
                  </button>
                </div>
              </div>

              {/* Inline Column Add Input */}
              {isAdding && (
                <div
                  style={{
                    background: "var(--wb-paper)",
                    borderRadius: 8,
                    border: "1.5px solid var(--wb-accent)",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.1)",
                  }}
                >
                  <input
                    autoFocus
                    value={columnInputTitle}
                    onChange={(e) => setColumnInputTitle(e.target.value)}
                    onPaste={handleColumnPaste}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddInColumn(col.id);
                      if (e.key === "Escape") setActiveColumnInput(null);
                    }}
                    placeholder="输入任务描述或粘贴图片，按 Enter 添加…"
                    style={{
                      border: "none",
                      outline: "none",
                      fontSize: 13,
                      color: "var(--wb-ink)",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                  <ImageAttachments images={columnInputImages} onRemove={id=>setColumnInputImages(current=>current.filter(image=>image.id!==id))}/>
                  <small style={{color:"var(--wb-muted)"}}>可粘贴图片 · 最多 {MAX_PASTED_IMAGES} 张</small>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, paddingTop: 4, borderTop: "1px solid var(--wb-surface-deep)" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["low", "medium", "high"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setColumnInputPriority(p)}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: columnInputPriority === p ? `1.5px solid ${PRIORITY_META[p].text}` : "1px solid var(--wb-line)",
                            background: columnInputPriority === p ? PRIORITY_META[p].bg : "var(--wb-paper)",
                            color: columnInputPriority === p ? PRIORITY_META[p].text : "var(--wb-muted)",
                            cursor: "pointer",
                          }}
                        >
                          {PRIORITY_META[p].label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setActiveColumnInput(null)}
                        style={{
                          padding: "3px 8px",
                          fontSize: 11,
                          border: "none",
                          background: "transparent",
                          color: "var(--wb-muted)",
                          cursor: "pointer",
                        }}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAddInColumn(col.id)}
                        style={{
                          padding: "3px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          border: "none",
                          borderRadius: 4,
                          background: "var(--wb-accent)",
                          color: "var(--wb-accent-foreground)",
                          cursor: "pointer",
                        }}
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Card List in Column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                {colItems.map((item) => {
                  const pri = item.priority ? PRIORITY_META[item.priority] : PRIORITY_META.medium;
                  const createdTime = item.createdAt ? new Date(item.createdAt).toLocaleDateString([], { month: "2-digit", day: "2-digit" }) : "";

                  return (
                    <div
                      key={item.id}
                      id={`todo-${item.id}`}
                      style={{
                        background: "var(--wb-paper)",
                        border: "1px solid var(--wb-line)",
                        borderRadius: 8,
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <RequirementEditor item={item} onSave={async input=>{const result=await actions.editTodo(input);changed();return result;}}/>
                      {item.taskId && <button type="button" onClick={()=>void workbench.openNote(data.executionDesk.noteId,item.taskId)} style={{border:0,background:'var(--wb-accent-pale)',color:'var(--wb-accent)',padding:'6px 8px',borderRadius:6,fontSize:12,textAlign:'left'}}>{String(item.delivery || "执行进展")} · {String(item.next || "打开执行台")} ↗</button>}
                      {item.conclusion && (
                        <div
                          style={{
                            color: "var(--wb-ink-soft)",
                            fontSize: 11.5,
                            lineHeight: 1.45,
                            padding: "7px 8px",
                            borderRadius: 6,
                            background: "var(--wb-surface)",
                            border: "1px solid var(--wb-surface-deep)",
                          }}
                        >
                          <span style={{ color: "var(--wb-muted-light)", marginRight: 5 }}>反馈</span>
                          {item.conclusion}
                        </div>
                      )}

                      {/* Card Bottom Meta & Actions */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: 8,
                          borderTop: "1px solid var(--wb-surface)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {item.category && (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "var(--wb-ink-soft)",
                                background: "var(--wb-surface-deep)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid var(--wb-line)",
                              }}
                            >
                              {item.category}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              fontFamily: "ui-monospace, monospace",
                              color: pri.text,
                              background: pri.bg,
                              border: `1px solid ${pri.border}`,
                              padding: "1px 6px",
                              borderRadius: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <i style={{ width: 5, height: 5, borderRadius: "50%", background: pri.dot, display: "inline-block" }} />
                            {pri.label}
                          </span>
                          {createdTime && (
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--wb-muted-light)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                fontFamily: "ui-monospace, monospace",
                              }}
                            >
                              <SvgClock size={10} />
                              {createdTime}
                            </span>
                          )}
                        </div>

                        {/* Status Shift & Delete */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => void handleDelegate(item)}
                            disabled={delegatingItemId !== null}
                            title={col.id === "done" ? "再次交办此待办" : "交办此待办"}
                            style={{
                              border: "1px solid var(--wb-accent-pale)",
                              background: delegatingItemId === item.id ? "var(--wb-accent-pale)" : "var(--wb-paper)",
                              borderRadius: 4,
                              fontSize: 11,
                              padding: "2px 7px",
                              color: "var(--wb-accent)",
                              cursor: delegatingItemId !== null ? "wait" : "pointer",
                              opacity: delegatingItemId !== null && delegatingItemId !== item.id ? 0.55 : 1,
                            }}
                          >
                            {delegatingItemId === item.id ? "提交中…" : item.taskId || item.delegation || item.deliveryIntent ? "继续交付" : "交办"}
                          </button>

                          {config?.notes?.production && <button type="button" style={{border:0,background:"transparent",color:"var(--wb-muted)",fontSize:11,cursor:"pointer"}} onClick={async()=>{try{if(!item.productionId)await actions.productionRequest({projectId,todoId:item.id,title:item.title,brief:item.description||item.title});await workbench.openNote(config.notes!.production,item.productionId?cardGameLink({projectId,kind:'production',id:item.productionId,intent:'open'}):undefined);if(!item.productionId)showToast('制作单请求已送达，建立后会显示在制作便笺');}catch(error){showToast(error instanceof Error?error.message:String(error));}}}>{item.productionId?"制作单":"转为制作单"}</button>}
                          {col.id !== "todo" && (
                            <button
                              type="button"
                              disabled={Boolean(item.taskId)}
                              onClick={() => void handleMove(item.id, col.id === "done" ? "in_progress" : "todo")}
                              title="移到前一列"
                              style={{
                                border: "1px solid var(--wb-line)",
                                background: "var(--wb-surface)",
                                borderRadius: 4,
                                fontSize: 11,
                                padding: "2px 7px",
                                color: "var(--wb-ink-soft)",
                                cursor: "pointer",
                                transition: "all 0.12s ease",
                              }}
                            >
                              ←
                            </button>
                          )}

                          {col.id !== "done" && (
                            <button
                              type="button"
                              disabled={Boolean(item.taskId)}
                              onClick={() => void handleMove(item.id, col.id === "todo" ? "in_progress" : "done")}
                              title="移到后一列"
                              style={{
                                border: "1px solid var(--wb-line)",
                                background: "var(--wb-surface)",
                                borderRadius: 4,
                                fontSize: 11,
                                padding: "2px 7px",
                                color: "var(--wb-ink-soft)",
                                cursor: "pointer",
                              }}
                            >
                              →
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleRemove(item.id)}
                            title="删除"
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--wb-muted-light)",
                              cursor: "pointer",
                              padding: "2px 4px",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <SvgTrash size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colItems.length === 0 && !isAdding && (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 120,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--wb-muted-light)",
                      fontSize: 12,
                      border: "1.5px dashed var(--wb-line)",
                      borderRadius: 8,
                      background: "color-mix(in srgb, var(--wb-paper) 50%, transparent)",
                    }}
                  >
                    暂无卡片
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {(page.data?.nextCursor || totalCount > items.length) && <div style={{display:"flex",alignItems:"center",gap:12,fontSize:12,color:"var(--wb-muted)"}}><span>当前载入 {items.length} / {totalCount} 项</span>{page.data?.nextCursor && <button type="button" disabled={page.loading} onClick={()=>setCursor(page.data?.nextCursor)}>加载更多</button>}</div>}
    </div>}
    </div>
  </>);
}

function contentReferenceFromDraft(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const nested = context.ref;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested as Record<string, unknown>;
  if (["kind", "id", "path", "revision"].some(field => context[field] !== undefined)) return context;
  return undefined;
}

function statusLabel(status: TodoStatus): string {
  return status === "todo" ? "待办" : status === "in_progress" ? "进行中" : status === "done" ? "完成" : "阻塞";
}

function decodeCardGameFocus(itemId: string | undefined): { projectId: string; kind: string; id?: string; intent?: string; context?: Record<string, unknown> } | undefined {
  if (!itemId?.startsWith("cg:")) return undefined;
  try {
    const value = JSON.parse(decodeURIComponent(itemId.slice(3))) as Record<string, unknown>;
    if (!value || typeof value.projectId !== "string" || typeof value.kind !== "string") return undefined;
    return {
      projectId: value.projectId,
      kind: value.kind,
      ...(typeof value.id === "string" ? { id: value.id } : {}),
      ...(typeof value.intent === "string" ? { intent: value.intent } : {}),
      ...(value.context && typeof value.context === "object" && !Array.isArray(value.context) ? { context: value.context as Record<string, unknown> } : {}),
    };
  } catch {
    return undefined;
  }
}
