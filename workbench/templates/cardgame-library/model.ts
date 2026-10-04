/** The three domain views share one template and differ only by instance config. */
export type LibraryMode = "knowledge" | "cards" | "assets";

export type ContentKind =
  | "document"
  | "card"
  | "asset"
  | "production"
  | "todo"
  | "preview";

export interface CardGameNotes {
  knowledge: string;
  cards: string;
  assets: string;
  production: string;
  todo: string;
  execution: string;
  preview: string;
}

export interface CardGameConfig {
  projectId: string;
  projectRoot?: string;
  mode: LibraryMode;
  notes: CardGameNotes;
  /** Legacy registered references (design docs, memory, and similar local files). */
  resources?: ReferenceResource[];
}

export interface ReferenceResource {
  title: string;
  path: string;
  root?: string;
  linkBase?: string;
  revision?: string;
}

/** Persistent view state. It deliberately contains no document, card, or media payload. */
export interface LibraryState {
  query?: string;
  bookmarks?: string[];
  views?: {
    knowledge?: "reader" | "source";
    knowledgeSelection?: { id?: string; path: string };
    cards?: "table" | "grid";
    cardsSelection?: string[];
    assets?: "grid" | "list";
    assetsSelection?: string;
    assetsFilters?: AssetFilters[];
  };
}

export interface AssetFilters {
  name: string;
  kind?: string;
  mimeType?: string;
  format?: string;
  minWidth?: number;
  maxWidth?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  status?: string;
}

/** A stable cross-note locator used by the workbench openNote bridge. */
export interface ContentRef {
  projectId: string;
  kind: ContentKind;
  id?: string;
  path?: string;
  anchor?: string;
  revision?: string;
  intent?: "backlinks" | "draft" | "compare" | string;
  context?: Record<string, unknown>;
}

/** Encode a content locator in the shared `cg:` deep-link format. */
export function encodeContentRef(ref: ContentRef): string {
  const ordered: ContentRef = {
    projectId: ref.projectId,
    kind: ref.kind,
    ...(ref.id ? { id: ref.id } : {}),
    ...(ref.path ? { path: ref.path } : {}),
    ...(ref.anchor ? { anchor: ref.anchor } : {}),
    ...(ref.revision ? { revision: ref.revision } : {}),
    ...(ref.intent ? { intent: ref.intent } : {}),
    ...(ref.context ? { context: ref.context } : {}),
  };
  return `cg:${encodeURIComponent(JSON.stringify(ordered))}`;
}

/** Decode a shared content locator; malformed IDs are treated as absent. */
export function decodeContentRef(itemId: string | undefined | null): ContentRef | undefined {
  if (!itemId?.startsWith("cg:")) return undefined;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(itemId.slice(3)));
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.projectId !== "string" || typeof candidate.kind !== "string") return undefined;
    const kinds: ContentKind[] = ["document", "card", "asset", "production", "todo", "preview"];
    if (!kinds.includes(candidate.kind as ContentKind)) return undefined;
    const result: ContentRef = {
      projectId: candidate.projectId,
      kind: candidate.kind as ContentKind,
    };
    for (const field of ["id", "path", "anchor", "revision", "intent"] as const) {
      const value = candidate[field];
      if (typeof value !== "string") continue;
      switch (field) {
        case "id": result.id = value; break;
        case "path": result.path = value; break;
        case "anchor": result.anchor = value; break;
        case "revision": result.revision = value; break;
        case "intent": result.intent = value; break;
      }
    }
    if (candidate.context && typeof candidate.context === "object" && !Array.isArray(candidate.context)) {
      result.context = candidate.context as Record<string, unknown>;
    }
    return result;
  } catch {
    return undefined;
  }
}

export interface LibraryItem {
  id: string;
  title?: string;
  name?: string;
  path?: string;
  revision?: string;
  [key: string]: unknown;
}

export interface ContentList<T extends LibraryItem = LibraryItem> {
  items: T[];
  nextCursor?: string | null;
  total?: number;
  [key: string]: unknown;
}

export interface DirectoryItem extends LibraryItem {
  hasChildren?: boolean;
  parentPath?: string;
}

export interface DocumentItem extends LibraryItem {
  title: string;
  path: string;
  snippet?: string;
  match?: { line?: number; column?: number; text?: string };
}

export interface DocumentData extends DocumentItem {
  content: string;
  format?: string;
}

export interface DocumentMeta {
  id: string;
  path: string;
  title: string;
  revision: string;
  size: number;
  isScene: boolean;
}

export interface BacklinkItem extends LibraryItem {
  sourceId?: string;
  sourcePath?: string;
  sourceTitle?: string;
  line?: number;
  snippet?: string;
  anchor?: string;
}

export interface GraphData {
  nodes?: Array<LibraryItem & { kind?: ContentKind; type?: ContentKind }>;
  edges?: Array<{ source?: string; target?: string; sourceId?: string; targetId?: string; sourcePath?: string; targetPath?: string; label?: string }>;
  truncated?: boolean;
}

export interface MovePreviewData {
  source?: string | DocumentData;
  target?: string;
  toPath?: string;
  affected?: Array<LibraryItem & { from?: string; to?: string; kind?: string; changedLinks?: number; changed?: boolean }>;
  errors?: string[];
  conflicts?: string[];
  canApply?: boolean;
  [key: string]: unknown;
}

export interface CardItem extends LibraryItem {
  name: string;
  kind?: string;
  rarity?: string;
  labels?: string[];
  cost?: number | string;
  sourcePath?: string;
  cardRevision?: string;
  facePreview?: string;
}

export interface CardData extends CardItem {
  json?: Record<string, unknown>;
  raw?: unknown;
  definition?: unknown;
  content?: string;
}

export interface AssetItem extends LibraryItem {
  name?: string;
  kind?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  frameCount?: number;
  format?: string;
  tags?: string[];
  versionId?: string;
  currentVersionId?: string;
  sourcePath?: string;
  status?: string;
  metadataRevision?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetData extends AssetItem {
  description?: string;
  currentVersion?: Record<string, unknown>;
}

export interface VersionItem extends LibraryItem {
  version?: string;
  versionId?: string;
  status?: string;
  createdAt?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  frameCount?: number;
}

export interface MediaData {
  path?: string;
  url?: string;
  src?: string;
  data?: string;
  mimeType?: string;
  revision?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  frameCount?: number;
  frameWidth?: number;
  frameHeight?: number;
  columns?: number;
  rows?: number;
  [key: string]: unknown;
}

export interface RecentChangeItem {
  kind: "document" | "card" | "asset" | "version";
  id?: string;
  path?: string;
  name?: string;
  change: "created" | "updated";
  at: string;
}

export interface RecentChangesData {
  items: RecentChangeItem[];
  nextCursor?: string | null;
  total?: number;
}

export function asRecentChanges(value: unknown): RecentChangesData {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>;
    return {
      items: Array.isArray(payload.items) ? payload.items.filter(isRecentChangeItem) : [],
      nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
      total: typeof payload.total === "number" ? payload.total : undefined,
    };
  }
  return { items: [], nextCursor: null };
}

function isRecentChangeItem(value: unknown): value is RecentChangeItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.at === "string"
    && (candidate.change === "created" || candidate.change === "updated")
    && (candidate.kind === "document" || candidate.kind === "card" || candidate.kind === "asset" || candidate.kind === "version");
}

/** The change stream shows only the domain objects of the current mode. */
export function recentChangesForMode(items: RecentChangeItem[], mode: LibraryMode): RecentChangeItem[] {
  if (mode === "cards") return items.filter(item => item.kind === "card");
  if (mode === "assets") return items.filter(item => item.kind === "asset" || item.kind === "version");
  return items.filter(item => item.kind === "document");
}

export function recentChangeLabel(item: RecentChangeItem): string {
  return item.name || item.path || item.id || item.kind;
}

/** Resolve a change entry to a selectable asset; version rows carry the version id. */
export function locateAssetForChange(item: RecentChangeItem, assets: AssetItem[]): string | undefined {
  if (!item.id) return undefined;
  if (item.kind === "asset") return item.id;
  if (item.kind === "version") return assets.find(asset => asset.id === item.id || asset.currentVersionId === item.id || asset.versionId === item.id)?.id;
  return undefined;
}

export interface StatusData {
  projectId?: string;
  ready?: boolean;
  indexedAt?: string;
  documents?: number;
  cards?: number;
  assets?: number;
  error?: string;
  [key: string]: unknown;
}

/** Normalize a backend list while preserving extra metadata for future fields. */
export function asContentList<T extends LibraryItem = LibraryItem>(value: unknown): ContentList<T> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>;
    return {
      ...payload,
      items: Array.isArray(payload.items) ? payload.items.filter(isLibraryItem) as T[] : [],
      nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
      total: typeof payload.total === "number" ? payload.total : undefined,
    };
  }
  return { items: Array.isArray(value) ? value.filter(isLibraryItem) as T[] : [], nextCursor: null };
}

function isLibraryItem(value: unknown): value is LibraryItem {
  return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string");
}

export function itemLabel(item: LibraryItem): string {
  return item.title || item.name || item.path || item.id;
}

export function mediaSource(media: MediaData | undefined): string | undefined {
  return media?.url || media?.src || media?.data;
}

/** Decode a Markdown URL path exactly once before resolving it as a file path. */
export function decodeMarkdownUrlPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Keep malformed URL escapes usable as literal paths.
    return value;
  }
}

export function resolveRelativePath(from: string, target: string): string {
  const decodedTarget = decodeMarkdownUrlPath(target);
  if (!decodedTarget || decodedTarget.startsWith("/")) return decodedTarget;
  const base = from.split("/");
  base.pop();
  for (const part of decodedTarget.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop(); else base.push(part);
  }
  return base.join("/");
}
