import { Button, ScrollShadow, SearchField } from "@heroui/react";
import { NoteDialog, useResource } from "@dsh-workbench/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CardItem, MediaData } from "./model";

type Props = {
  active?: boolean;
  projectId: string;
  cards: CardItem[];
  activeCard?: CardItem;
  selectedId?: string;
  focusId?: string;
  query: string;
  kind: string;
  rarity: string;
  total?: number;
  loading: boolean;
  error?: Error | null;
  dirty: boolean;
  hasMore: boolean;
  view: "table" | "grid";
  onSearch(value: string): void;
  onFilters(kind: string, rarity: string): void;
  onView(view: "table" | "grid"): void;
  onSelect(id: string): boolean | void;
  onMore(): void;
  detail: ReactNode;
  renderRecent(open: (id: string) => void): ReactNode;
  renderActions(ids: string[]): ReactNode;
  renderComparison(cards: CardItem[]): ReactNode;
};

function useNarrow() {
  return useSyncExternalStore(
    callback => { const media = matchMedia("(max-width: 680px)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); },
    () => matchMedia("(max-width: 680px)").matches,
    () => false,
  );
}

export function CardsWorkspace(props: Props) {
  const narrow = useNarrow();
  const [screen, setScreen] = useState<"list" | "detail" | "comparison">("list");
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<CardItem[]>([]);
  const [message, setMessage] = useState("");
  const [drawer, setDrawer] = useState<"filters" | "recent" | null>(null);
  const [filterKind, setFilterKind] = useState(props.kind);
  const [filterRarity, setFilterRarity] = useState(props.rarity);
  const [search, setSearch] = useState(props.query);
  const listHost = useRef<HTMLDivElement>(null);
  const knownKinds = useRef(new Set<string>());
  const knownRarities = useRef(new Set<string>());
  for (const card of props.cards) { if (card.kind) knownKinds.current.add(card.kind); if (card.rarity) knownRarities.current.add(card.rarity); }
  const comparisonIds = comparison.map(card => card.id);
  const active = props.activeCard ?? props.cards.find(card => card.id === props.selectedId);
  const filterCount = Number(Boolean(props.kind)) + Number(Boolean(props.rarity));
  const showingDetail = narrow && screen === "detail";

  useEffect(() => setSearch(props.query), [props.query]);
  useEffect(() => { if (props.focusId) setScreen("detail"); }, [props.focusId]);
  useEffect(() => {
    if (props.active === false) return;
    const back = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (drawer) return;
      if (screen !== "list") { event.preventDefault(); event.stopImmediatePropagation(); setScreen("list"); }
      else if (comparing) { event.preventDefault(); event.stopImmediatePropagation(); setComparing(false); setComparison([]); }
    };
    document.addEventListener("keydown", back);
    return () => document.removeEventListener("keydown", back);
  }, [props.active, drawer, screen, comparing]);

  function select(card: CardItem) {
    if (comparing) {
      setMessage("");
      if (!comparisonIds.includes(card.id) && comparison.length === 3) { setMessage("最多比较 3 张，请先移除一张。"); return; }
      setComparison(current => current.some(item => item.id === card.id) ? current.filter(item => item.id !== card.id) : [...current, card]);
      return;
    }
    if (props.onSelect(card.id) !== false) { setScreen("detail"); requestAnimationFrame(() => document.querySelector<HTMLElement>(".cl-back")?.focus()); }
  }
  function openFilters() { setFilterKind(props.kind); setFilterRarity(props.rarity); setDrawer("filters"); }
  function backToList() { setScreen("list"); requestAnimationFrame(() => listHost.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(props.selectedId ?? "")}"] button`)?.focus({ preventScroll: true })); }

  return <div className={`cl-workspace${showingDetail ? " cl-show-detail" : ""}${screen === "comparison" ? " cl-show-comparison" : ""}`}>
    <style>{STYLES}</style>
    <header className="cl-toolbar">
      {showingDetail || screen === "comparison" ? <>
        <Button className="cl-back" variant="tertiary" onPress={backToList}>← 返回卡牌库</Button>
        <span className="cl-screen-name">{screen === "comparison" ? "卡牌比较" : active?.name || active?.title || "卡牌详情"}</span>
      </> : <>
        <SearchField aria-label="搜索卡牌" value={search} onChange={setSearch} onSubmit={() => props.onSearch(search)} className="cl-search">
          <SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder="搜索卡牌" /><SearchField.ClearButton onPress={() => { setSearch(""); props.onSearch(""); }} /></SearchField.Group>
        </SearchField>
        <Button variant="secondary" onPress={openFilters} aria-label={`筛选卡牌${filterCount ? `，已应用 ${filterCount} 项` : ""}`}>筛选{filterCount ? ` ${filterCount}` : ""}</Button>
        <Button variant={comparing ? "primary" : "tertiary"} onPress={() => { setComparing(!comparing); setComparison([]); setMessage(""); }}>{comparing ? "退出比较" : "比较"}</Button>
        <div className="cl-desktop-controls"><Button variant="tertiary" onPress={() => props.onView(props.view === "grid" ? "table" : "grid")}>{props.view === "grid" ? "表格" : "网格"}</Button><Button variant="tertiary" onPress={() => setDrawer("recent")}>最近</Button></div>
      </>}
    </header>
    <div className="cl-summary">
      <span>{comparing ? `选择 2–3 张卡牌 · 已选 ${comparison.length}` : `${props.total ?? props.cards.length} 张卡牌${props.kind ? ` · ${kindLabel(props.kind)}` : ""}${props.rarity ? ` · ${rarityLabel(props.rarity)}` : ""}`}</span>
      {props.dirty && <span className="cl-draft">有未保存草稿</span>}
      <span role="status">{message}</span>
    </div>
    <div className="cl-body">
      <div className="cl-collection" ref={listHost} aria-hidden={showingDetail || screen === "comparison" ? true : undefined}>
        <CardCollection projectId={props.projectId} cards={props.cards} narrow={narrow} view={props.view} activeId={props.selectedId} comparing={comparing} comparisonIds={comparisonIds} onSelect={select} resetKey={`${props.query}|${props.kind}|${props.rarity}`} loading={props.loading} error={props.error} hasMore={props.hasMore} onMore={props.onMore} />
        {comparing && <footer className="cl-selection-footer"><span>{comparison.length ? comparison.map(card => card.name || card.title || card.id).join("、") : "点选卡牌加入比较"}</span><Button variant="primary" isDisabled={comparison.length < 2} onPress={() => setScreen("comparison")}>查看比较{comparison.length ? ` (${comparison.length})` : ""}</Button></footer>}
      </div>
      <aside className="cl-detail" aria-hidden={narrow && !showingDetail || screen === "comparison" ? true : undefined}>
        <ScrollShadow className="cl-detail-scroll">{props.selectedId ? props.detail : <div className="cl-empty"><span className="cl-empty-symbol">◇</span><strong>选一张卡牌，开始查看</strong><span>查看定义、讨论改动或制作卡面</span></div>}</ScrollShadow>
        {props.selectedId && <footer className="cl-detail-footer">{props.renderActions([props.selectedId])}</footer>}
      </aside>
      {screen === "comparison" && <section className="cl-comparison"><ScrollShadow className="cl-comparison-scroll"><h2>对比 {comparison.length} 张卡牌</h2><ScrollShadow orientation="horizontal" className="cl-comparison-table"><table><thead><tr><th>卡牌</th>{comparison.map(card => <th key={card.id}>{card.name || card.title || card.id}</th>)}</tr></thead><tbody>{["类别", "稀有度", "费用", "标签"].map((label, index) => <tr key={label}><th>{label}</th>{comparison.map(card => <td key={card.id}>{index === 0 ? kindLabel(card.kind) : index === 1 ? rarityLabel(card.rarity) : index === 2 ? card.cost ?? "—" : card.labels?.join("、") || "—"}</td>)}</tr>)}</tbody></table></ScrollShadow><details className="cl-comparison-source"><summary>查看完整定义</summary>{props.renderComparison(comparison)}</details></ScrollShadow><footer className="cl-detail-footer">{props.renderActions(comparisonIds)}</footer></section>}
    </div>
    <NoteDialog open={props.active !== false && drawer !== null} onOpenChange={open => { if (!open) setDrawer(null); }} className="cl-drawer" label={drawer === "filters" ? "筛选卡牌" : "最近变化"}>
      <div className="cl-drawer-content"><header><h2>{drawer === "filters" ? "筛选卡牌" : "最近变化"}</h2><Button variant="tertiary" aria-label="关闭筛选面板" onPress={() => setDrawer(null)}>关闭</Button></header>
        {drawer === "filters" ? <><label>类别<select value={filterKind} onChange={event => setFilterKind(event.target.value)}><option value="">全部类别</option>{Array.from(knownKinds.current).sort().map(value => <option key={value} value={value}>{kindLabel(value)}</option>)}</select></label><label>稀有度<select value={filterRarity} onChange={event => setFilterRarity(event.target.value)}><option value="">全部稀有度</option>{Array.from(knownRarities.current).sort().map(value => <option key={value} value={value}>{rarityLabel(value)}</option>)}</select></label><div className="cl-drawer-actions"><Button variant="secondary" onPress={() => { setFilterKind(""); setFilterRarity(""); }}>重置</Button><Button variant="primary" onPress={() => { props.onFilters(filterKind, filterRarity); setDrawer(null); }}>应用筛选</Button></div><Button variant="tertiary" onPress={() => setDrawer("recent")}>最近变化</Button></> : props.renderRecent(id => { if (props.onSelect(id) !== false) { setDrawer(null); setScreen("detail"); } })}
      </div>
    </NoteDialog>
  </div>;
}

function CardCollection({ projectId, cards, narrow, view, activeId, comparing, comparisonIds, onSelect, resetKey, loading, error, hasMore, onMore }: { projectId: string; cards: CardItem[]; narrow: boolean; view: "table" | "grid"; activeId?: string; comparing: boolean; comparisonIds: string[]; onSelect(card: CardItem): void; resetKey: string; loading: boolean; error?: Error | null; hasMore: boolean; onMore(): void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 500 });
  const [scroll, setScroll] = useState(0);
  const grid = !narrow && view === "grid";
  const columns = grid ? Math.max(2, Math.min(4, Math.floor(size.width / 175))) : 1;
  const rowHeight = grid ? 230 : narrow ? 82 : 68;
  const rows = useMemo(() => { const result: CardItem[][] = []; for (let i = 0; i < cards.length; i += columns) result.push(cards.slice(i, i + columns)); return result; }, [cards, columns]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (element.clientHeight) setSize({ width: element.clientWidth, height: element.clientHeight }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (viewport.current) viewport.current.scrollTop = 0; setScroll(0); }, [resetKey]);
  useEffect(() => {
    const max = Math.max(0, rows.length * rowHeight - size.height);
    if (viewport.current && viewport.current.scrollTop > max) { viewport.current.scrollTop = max; setScroll(max); }
  }, [rows.length, rowHeight, size.height]);
  const start = Math.max(0, Math.floor(scroll / rowHeight) - 2);
  const end = Math.min(rows.length, Math.ceil((scroll + size.height) / rowHeight) + 2);
  return <ScrollShadow ref={viewport} className={`cl-list-scroll${grid ? " cl-grid" : ""}`} onScroll={event => setScroll(event.currentTarget.scrollTop)}>
    {error && <p role="alert" className="cg-error">{error.message}</p>}
    {!cards.length && <div className="cl-empty"><strong>{loading ? "正在读取卡牌…" : "没有匹配的卡牌"}</strong><span>{loading ? "" : "试试其他关键词或清除筛选"}</span></div>}
    <div style={{ height: rows.length * rowHeight, position: "relative" }}>
      <div style={{ position: "absolute", top: start * rowHeight, width: "100%" }}>{rows.slice(start, end).map((row, index) => <div key={row[0].id} className="cl-card-row" style={{ height: rowHeight, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{row.map(card => <article key={card.id} className={`cl-card${activeId === card.id && !comparing ? " cl-active" : ""}${comparisonIds.includes(card.id) && comparing ? " cl-checked" : ""}`} data-card-id={card.id}><Button variant="tertiary" className="cl-card-button" aria-label={comparing ? `${comparisonIds.includes(card.id) ? "移出比较" : "加入比较"}：${card.name || card.title || card.id}` : `查看卡牌：${card.name || card.title || card.id}`} aria-pressed={comparing ? comparisonIds.includes(card.id) : undefined} onPress={() => onSelect(card)}><CardThumbnail projectId={projectId} card={card} /><span className="cl-card-copy"><strong>{card.name || card.title || card.id}</strong><span>{kindLabel(card.kind)} · {rarityLabel(card.rarity)}</span><small>{card.cost == null ? "" : `费用 ${card.cost} · `}{card.labels?.slice(0, 2).join("、") || card.id}</small></span><span className="cl-card-indicator" aria-hidden="true">{comparing ? comparisonIds.includes(card.id) ? "✓" : "+" : "›"}</span></Button></article>)}</div>)}</div>
    </div>
    {hasMore && <Button className="cl-more" variant="secondary" isDisabled={loading} onPress={onMore}>{loading ? "正在读取…" : "加载更多卡牌"}</Button>}
  </ScrollShadow>;
}

function CardThumbnail({ projectId, card }: { projectId: string; card: CardItem }) {
  const path = card.facePreview;
  const media = useResource<MediaData>("media", path ? { projectId, path: "public" + path, variant: "thumbnail" } : {}, { enabled: Boolean(path) });
  return <span className="cl-thumbnail">{media.data?.url ? <img src={media.data.url} alt="" loading="lazy" /> : <span aria-label={path ? "卡面预览不可用" : "尚未制作卡面"}>{card.kind === "artifact" ? "器" : card.kind === "field" ? "境" : "卡"}</span>}</span>;
}

function kindLabel(value?: string) { return ({ artifact: "法器", field: "场地", unit: "角色", spell: "法术", pill: "丹药", skill: "技法", talisman: "符箓" } as Record<string, string>)[value ?? ""] ?? value ?? "未分类"; }
function rarityLabel(value?: string) { return ({ common: "普通", uncommon: "优秀", rare: "稀有", epic: "史诗", legendary: "传说" } as Record<string, string>)[value ?? ""] ?? value ?? "—"; }

const STYLES = `
.cg-library:has(.cl-workspace)>.cg-topbar{display:none}
.cl-workspace{height:100dvh;display:flex;flex-direction:column;padding:20px;gap:10px;min-width:0;color:var(--wb-ink);background:var(--wb-paper)}
.cl-workspace *{box-sizing:border-box;min-width:0}.cl-toolbar{display:flex;gap:8px;align-items:center;flex:none}.cl-toolbar .button{min-height:42px;flex:none}.cl-search{flex:1}.cl-desktop-controls{display:flex;gap:6px}.cl-screen-name{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cl-summary{display:flex;align-items:center;gap:12px;min-height:24px;font-size:12px;color:var(--wb-muted)}.cl-summary [role=status]{color:var(--wb-warning)}.cl-draft{color:var(--wb-warning)}
.cl-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:22px;min-height:0;flex:1}.cl-collection,.cl-detail,.cl-comparison{display:flex;flex-direction:column;min-height:0}.cl-list-scroll,.cl-detail-scroll,.cl-comparison-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}.cl-list-scroll{padding-right:6px}.cl-card-row{display:grid;gap:10px;padding-bottom:10px}.cl-card{height:100%;border-radius:12px;background:var(--wb-surface)}.cl-card.cl-active,.cl-card.cl-checked{background:var(--wb-accent-pale)}.cl-card .cl-card-button{height:100%;width:100%;border-radius:12px;padding:10px 12px;display:flex;justify-content:start;gap:12px;white-space:normal;text-align:left;color:var(--wb-ink)}.cl-card-copy{display:flex;flex:1;flex-direction:column;gap:4px;overflow:hidden}.cl-card-copy strong{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cl-card-copy>span{font-size:12px;color:var(--wb-ink-soft)}.cl-card-copy small{font-size:11px;color:var(--wb-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cl-card-indicator{font-size:20px;color:var(--wb-accent);width:24px;text-align:center}.cl-thumbnail{display:grid;place-items:center;flex:none;width:44px;height:52px;border-radius:8px;overflow:hidden;background:var(--wb-surface-deep);color:var(--wb-accent)}.cl-thumbnail img{width:100%;height:100%;object-fit:contain}.cl-thumbnail>span{font-size:20px;font-weight:650}
.cl-grid .cl-card-button{position:relative;flex-direction:column;align-items:stretch;padding:12px;gap:9px}.cl-grid .cl-thumbnail{width:100%;height:122px}.cl-grid .cl-thumbnail>span{font-size:28px}.cl-grid .cl-card-copy{flex:none}.cl-grid .cl-card-indicator{position:absolute;right:10px;top:12px;background:var(--wb-paper);border-radius:50%}.cl-more{margin:10px auto;width:100%;min-height:44px}.cl-detail-scroll{padding:0 4px 16px 0}.cl-detail .cg-detail-heading strong{font-size:22px}.cl-detail .cg-detail-panel{padding:8px 0}.cl-detail .cg-card-fields{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.cl-detail .cg-card-fields>span:last-child{font-size:11px;color:var(--wb-muted)}.cl-detail .cg-card-source{margin-top:22px}.cl-detail .cg-card-source summary{min-height:44px;display:flex;align-items:center}.cl-detail .cg-inline-actions{gap:8px;flex-wrap:wrap}.cl-detail .button{min-height:42px}.cl-detail-footer,.cl-selection-footer{flex:none;display:flex;gap:8px;align-items:center;padding:12px 0 0;background:var(--wb-paper)}.cl-detail-footer .cg-selection-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0}.cl-detail-footer .button{min-height:44px}.cl-selection-footer>span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--wb-ink-soft)}.cl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px 14px;color:var(--wb-muted);height:100%;text-align:center}.cl-empty strong{font-size:15px;color:var(--wb-ink-soft)}.cl-empty-symbol{font-size:46px;color:var(--wb-accent)}
.cl-show-comparison .cl-collection,.cl-show-comparison .cl-detail{display:none}.cl-show-comparison .cl-body{display:flex}.cl-comparison{width:100%}.cl-comparison h2{font-size:20px;margin:12px 0 22px}.cl-comparison-table{overflow-x:auto}.cl-comparison table{width:100%;border-collapse:collapse;font-size:13px}.cl-comparison th,.cl-comparison td{text-align:left;vertical-align:top;padding:14px 16px;min-width:120px}.cl-comparison tbody tr:nth-child(odd){background:var(--wb-surface)}.cl-comparison-source{margin-top:24px}.cl-comparison-source summary{min-height:44px;cursor:pointer}.cl-comparison .cg-compare-grid{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));overflow-x:auto}.cl-comparison pre{white-space:pre-wrap;overflow-wrap:anywhere}
.cl-drawer{width:min(440px,calc(100% - 24px));max-height:calc(100dvh - 32px);padding:0;border:0;border-radius:20px;background:var(--wb-paper);color:var(--wb-ink);box-shadow:var(--wb-shadow-popover)}.cl-drawer::backdrop{background:rgb(0 0 0/.45)}.cl-drawer-content{padding:22px;display:flex;flex-direction:column;gap:22px;max-height:calc(100dvh - 32px);overflow:auto}.cl-drawer header{display:flex;align-items:center;justify-content:space-between;gap:12px}.cl-drawer header .button{min-height:44px}.cl-drawer h2{font-size:19px;margin:0}.cl-drawer label{display:flex;flex-direction:column;gap:9px;font-size:13px}.cl-drawer select{height:46px;width:100%;padding:0 12px;border-radius:10px;background:var(--wb-surface);color:var(--wb-ink);border:1px solid var(--wb-line)}.cl-drawer-actions{display:flex;gap:10px}.cl-drawer-actions .button{min-height:46px;flex:1}
@media(min-width:681px){.cl-toolbar>.cl-back,.cl-toolbar>.cl-screen-name{display:none}.cl-show-comparison .cl-toolbar>.cl-back,.cl-show-comparison .cl-toolbar>.cl-screen-name{display:inline-flex}}
@media(max-width:680px){.cl-workspace{padding:12px 12px max(76px,calc(env(safe-area-inset-bottom) + 12px));gap:8px}.cl-toolbar{gap:6px}.cl-toolbar .button{min-height:44px;padding-inline:12px}.cl-desktop-controls{display:none}.cl-summary{min-height:20px;font-size:11px;flex-wrap:wrap;gap:4px 10px}.cl-body{display:flex;min-height:0;gap:0}.cl-collection{width:100%;min-height:0}.cl-detail{display:none}.cl-list-scroll{padding:0}.cl-card-row{padding-bottom:8px}.cl-card .cl-card-button{padding:8px 10px;gap:10px}.cl-card-copy strong{font-size:15px}.cl-card-copy>span{font-size:12px}.cl-card-copy small{font-size:11px}.cl-show-detail .cl-collection{display:none}.cl-show-detail .cl-detail{display:flex;width:100%}.cl-show-detail .cl-summary{display:none}.cl-detail .cg-detail-heading strong{font-size:23px}.cl-detail-scroll{padding:8px 4px 14px}.cl-detail-footer{padding-top:10px}.cl-detail-footer .cg-selection-actions{width:100%}.cl-detail-footer .cg-selection-actions .button{flex:1}.cl-detail-footer .cg-select{height:44px;max-width:none;width:100%}.cl-selection-footer{flex-wrap:wrap;padding-top:10px}.cl-selection-footer>span{width:100%;flex-basis:100%}.cl-selection-footer .button{width:100%;min-height:46px}.cl-drawer{margin:auto 0 0;width:100%;max-width:none;border-radius:22px 22px 0 0;max-height:85dvh}.cl-drawer-content{padding:20px 18px max(24px,env(safe-area-inset-bottom));max-height:85dvh}.cl-comparison th,.cl-comparison td{padding:12px;min-width:112px}.cl-comparison th:first-child,.cl-comparison td:first-child{min-width:70px}.cl-screen-name{flex:1}.cl-back{flex:none}}
`;
