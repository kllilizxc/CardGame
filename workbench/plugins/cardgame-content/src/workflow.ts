import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Durable, project-scoped workflow facts for the CardGame notes.
 *
 * The content index is deliberately not involved here.  This database owns
 * one row per Todo or production request, plus the bounded history and
 * dispatch receipts needed to make retries safe.  The native host uses
 * `node:sqlite`; the JSON adapter is a small compatibility path for runtimes
 * without any SQLite module.  Degradation to it in a host that does have
 * SQLite is a real failure and is reported through `onStoreStatus`.
 */

export const WORKFLOW_SCHEMA_VERSION = 1;
export const WORKFLOW_PAGE_SIZE = 100;
/** Acceptance-scale guidance, not a product capacity ceiling. */
export const WORKFLOW_SCALE_TARGETS = { todos: 10_000, productions: 10_000 } as const;

export type TodoStatus = "todo" | "in_progress" | "done" | "blocked";
export type TodoPriority = "low" | "medium" | "high";
export type ProductionStatus =
  | "draft"
  | "reserved"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "needs-input"
  | "stale"
  | "adopted";

export interface WorkflowProject {
  id: string;
  root: string;
  title?: string;
}

export interface WorkflowServiceOptions {
  dataRoot: string;
  projects: WorkflowProject[];
  /** Test clock.  The host normally uses Date.now(). */
  now?: () => number;
  /** Test ID source; production uses crypto.randomUUID(). */
  idFactory?: () => string;
  /** Durable-store health.  The quiet JSON compatibility path for runtimes without any SQLite module never reports. */
  onStoreStatus?: (event: WorkflowStoreStatus) => void;
}

export type WorkflowStoreStatus =
  | { kind: "sqlite-ready" }
  | { kind: "sqlite-open-failed"; message: string; cause: unknown }
  | { kind: "fallback-diverged"; message: string };

export interface ContentReference {
  projectId?: string;
  kind?: string;
  path?: string;
  id?: string;
  anchor?: string;
  revision?: string | number;
  title?: string;
  [key: string]: unknown;
}

export interface TargetAssetReference {
  id?: string;
  kind?: string;
  path?: string;
  version?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface AssetCandidateReference {
  id?: string;
  key?: string;
  assetId?: string;
  version?: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  frameCount?: number;
  durationMs?: number;
  revision?: string | number;
  rejectedAt?: string;
  rejectReason?: string;
  [key: string]: unknown;
}

export interface ExecutionBinding {
  delegationId?: string;
  executionId?: string;
  taskId?: string;
  deskNoteId?: string;
  stateRef?: string;
  requestId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface TodoDeliveryIntent {
  requestId: string;
  businessKey: string;
  fingerprint: string;
  status: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface TodoRecord {
  projectId: string;
  id: string;
  title: string;
  description?: string;
  images?: TodoImage[];
  status: TodoStatus;
  completed?: boolean;
  priority: TodoPriority;
  category?: string;
  dueDate?: string;
  conclusion?: string;
  taskId?: string;
  productionId?: string;
  execution?: ExecutionBinding;
  delivery?: TodoDeliveryIntent;
  context?: CardGameDeepLinkContext;
  requirementRevision: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastProductionResult?: {
    productionId: string;
    requestId: string;
    round: number;
    status: string;
    receivedAt: string;
  };
  [key: string]: unknown;
}

export interface TodoImage {
  id: string;
  dataUrl: string;
  type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  name?: string;
  width?: number;
  height?: number;
}

export interface ProductionRequirementSnapshot {
  brief: string;
  targetAsset?: TargetAssetReference;
  pinnedRefs: ContentReference[];
  batch?: unknown;
  todoId?: string;
  featureId?: string;
  outputDirectory?: string;
  requirementRevision: number;
  [key: string]: unknown;
}

export interface ProductionRound {
  round: number;
  requestId: string;
  businessKey: string;
  requirementRevision: number;
  dispatchRevision: number;
  requirement: ProductionRequirementSnapshot;
  scope: string[];
  cwd?: string;
  status: ProductionStatus | "pending";
  createdAt: string;
  updatedAt: string;
  result?: ProductionResultFact;
  resultFingerprint?: string;
  staleResultCount?: number;
}

export interface ProductionResultFact {
  status: string;
  conclusion?: string;
  error?: string;
  candidateRefs?: AssetCandidateReference[];
  raw?: unknown;
  receivedAt: string;
  requestId: string;
  round: number;
  revision: number;
}

export interface ProductionRecord {
  projectId: string;
  id: string;
  brief: string;
  targetAsset?: TargetAssetReference;
  pinnedRefs: ContentReference[];
  batch?: unknown;
  rounds: ProductionRound[];
  candidateRefs: AssetCandidateReference[];
  candidateRegistration?: {
    status: string;
    requestId?: string;
    updatedAt: string;
    error?: string;
  };
  todoId?: string;
  featureId?: string;
  execution?: ExecutionBinding;
  generation?: {
    status: string;
    requestId?: string;
    round?: number;
    updatedAt: string;
    resultAt?: string;
    error?: string;
  };
  adoption?: {
    status: string;
    candidateId: string;
    assetId?: string;
    version?: string;
    updatedAt: string;
    result?: unknown;
  };
  gameIntegration?: {
    status: string;
    revision?: string;
    updatedAt: string;
    result?: unknown;
  };
  /** Immutable playable snapshots; changing a draft creates another record. */
  gameCandidates?: GameCandidateRecord[];
  status: ProductionStatus;
  requirementRevision: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface GameCandidateRecord {
  id: string;
  projectId: string;
  productionId: string;
  cardId: string;
  kind?: 'card' | 'story' | 'documents' | 'deck';
  deckPath?: string;
  deckCardIds?: string[];
  deckCardFingerprints?: Record<string, string>;
  deckLogicFingerprint?: string;
  deckArtFingerprints?: Record<string, string>;
  placeholderCardIds?: string[];
  targetId?: string;
  entryHubId?: string;
  entryActionId?: string;
  shopTargets?: Array<{ resourceId: string; nodeId: string; offerIds: string[]; mapResourceIds: string[] }>;
  recipeIds?: string[];
  itemUseIds?: string[];
  questIds?: string[];
  copyPaths?: string[];
  portraitPaths?: string[];
  itemIconPaths?: string[];
  changedPaths?: string[];
  baseDependencies?: Array<{ path: string; revision: string | null }>;
  sourceSnapshotTree?: string;
  sourceSnapshotScope?: 'runtime';
  featureId: string;
  fingerprint: string;
  candidateHash: string;
  commit: string;
  repo: string;
  targetBaseRevision: string;
  validationManifest: string;
  dependencies: Array<{ path: string; revision: string }>;
  status: 'candidate' | 'adopted' | 'undone';
  createdAt: string;
  updatedAt: string;
  adoptedAt?: string;
  undoneAt?: string;
  adoptionId?: string;
}

export interface WorkflowHistoryRecord {
  id: number;
  projectId: string;
  itemId: string;
  kind: "todo" | "production";
  event: string;
  revision: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowPage<T> {
  projectId: string;
  items: T[];
  nextCursor?: string;
  limit: number;
  total?: number;
}

/**
 * List rows intentionally omit rounds, results, and candidate payloads.  A
 * production detail query is the place to load those potentially large facts.
 */
export interface ProductionListItem {
  workflowKind?: string;
  cardProgress?: { total: number; done: number };
  deckProgress?: { distinctCards: number; totalCopies: number; targetSize: number; title: string };
  projectId: string;
  id: string;
  brief: string;
  status: ProductionStatus;
  todoId?: string;
  roundCount: number;
  currentRound?: number;
  candidateCount: number;
  requirementRevision: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInvalidation {
  projectId: string;
  kind: "todo" | "production" | "workflowStatus";
  id?: string;
  revision?: number;
}

export interface WorkflowConnectionReceipt {
  id?: string;
  status: string;
  result?: unknown;
  error?: string;
  [key: string]: unknown;
}

export interface WorkflowAssetsAdapter {
  registerCandidates?(input: Record<string, unknown>): Promise<unknown>;
  adoptVersion?(input: Record<string, unknown>): Promise<unknown>;
}

export interface WorkflowCommandContext {
  assets?: WorkflowAssetsAdapter;
  /** Read current execution facts on demand; results are never cached here. */
  execution?: (binding: ExecutionBinding) => Promise<unknown>;
}

export interface WorkflowQueryContext {
  execution?: (binding: ExecutionBinding) => Promise<unknown>;
}

export interface CardGameDeepLinkContext {
  projectId: string;
  kind: "knowledge" | "card" | "asset" | "production" | "todo" | "preview";
  id?: string;
  path?: string;
  anchor?: string;
  revision?: string | number;
  intent?: string;
  [key: string]: unknown;
}

export interface WorkflowService {
  query(input: Record<string, unknown>, context?: WorkflowQueryContext): Promise<unknown>;
  command(method: string, input: Record<string, unknown>, context?: WorkflowCommandContext): Promise<unknown>;
  subscribe(invalidate: (change: WorkflowInvalidation) => void): () => void;
  close(): Promise<void>;
}

export class WorkflowError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.details = details;
  }
}

export class WorkflowConflictError extends WorkflowError {
  constructor(message = "工作流记录已被修改，请重新读取", details?: unknown) {
    super("conflict", message, details);
    this.name = "WorkflowConflictError";
  }
}

export class WorkflowRequestIdReuseError extends WorkflowError {
  constructor(message = "requestId 已用于另一份请求", details?: unknown) {
    super("request-id-reuse", message, details);
    this.name = "WorkflowRequestIdReuseError";
  }
}

export class WorkflowCapabilityError extends WorkflowError {
  constructor(message = "当前没有可用的制作能力", details?: unknown) {
    super("capability-unavailable", message, details);
    this.name = "WorkflowCapabilityError";
  }
}

type NativeStatement = {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
};

type NativeDatabase = {
  exec(sql: string): void;
  prepare(sql: string): NativeStatement;
  close(): void;
};

interface RequestReceiptRow {
  projectId: string;
  requestId: string;
  operation: string;
  fingerprint: string;
  productionId?: string;
  todoId?: string;
  round?: number;
  requirementRevision?: number;
  status: string;
  payload?: unknown;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}

interface PersistedState {
  schemaVersion: number;
  nextHistoryId: number;
  todos: Record<string, TodoRecord>;
  productions: Record<string, ProductionRecord>;
  history: WorkflowHistoryRecord[];
  requests: Record<string, RequestReceiptRow>;
}

interface StoredRecord {
  projectId: string;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  payload: TodoRecord | ProductionRecord;
}

const DATABASE_FILE = "cardgame-workflow.sqlite";
const FALLBACK_FILE = "cardgame-workflow.json";

function key(projectId: string, id: string): string {
  return `${projectId}\u0000${id}`;
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("JSON 数字无效");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(name => `${JSON.stringify(name)}:${stable(object[name])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function iso(now: number): string {
  return new Date(now).toISOString();
}

function text(value: unknown, name: string, required = true): string {
  if (typeof value !== "string" || !value.trim()) {
    if (!required) return "";
    throw new WorkflowError("invalid-input", `${name} 不能为空`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTodoImages(value: unknown): TodoImage[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 3) throw new WorkflowError("invalid-input", "最多添加 3 张图片");
  let totalLength = 0;
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new WorkflowError("invalid-input", "图片附件格式无效");
    const raw = candidate as Record<string, unknown>;
    const dataUrl = typeof raw.dataUrl === "string" ? raw.dataUrl : "";
    if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new WorkflowError("invalid-input", "仅支持 PNG、JPG、WebP 或 GIF 图片");
    if (dataUrl.length > 600_000) throw new WorkflowError("invalid-input", "图片压缩后仍然过大，请换一张图片");
    totalLength += dataUrl.length;
    if (totalLength > 900_000) throw new WorkflowError("invalid-input", "图片附件总大小过大，请减少图片数量或换小图");
    const id = optionalText(raw.id)?.slice(0, 120) ?? `image-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
    const type = dataUrl.slice(5, dataUrl.indexOf(";")) as TodoImage["type"];
    const name = optionalText(raw.name)?.slice(0, 128);
    const width = typeof raw.width === "number" && Number.isFinite(raw.width) && raw.width > 0 ? Math.min(4096, Math.round(raw.width)) : undefined;
    const height = typeof raw.height === "number" && Number.isFinite(raw.height) && raw.height > 0 ? Math.min(4096, Math.round(raw.height)) : undefined;
    return { id, dataUrl, type, ...(name ? { name } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}) };
  });
}

function integer(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(result) || result < 0) throw new WorkflowError("invalid-input", "revision 必须是非负整数");
  return result;
}

function limitOf(value: unknown): number {
  if (value === undefined) return WORKFLOW_PAGE_SIZE;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1) throw new WorkflowError("invalid-input", "limit 必须是正整数");
  return Math.min(WORKFLOW_PAGE_SIZE, result);
}

function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new WorkflowError("invalid-input", "cursor 无效");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("cursor");
    return parsed as Record<string, unknown>;
  } catch {
    throw new WorkflowError("invalid-input", "cursor 无效");
  }
}

function normalizeRefs(value: unknown): ContentReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new WorkflowError("invalid-input", "pinnedRefs 必须是数组");
  return value.map((entry, index) => {
    if (typeof entry === "string") return { path: entry };
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new WorkflowError("invalid-input", `pinnedRefs[${index}] 无效`);
    return clone(entry as ContentReference);
  });
}

function normalizeCandidates(value: unknown, identitySeed?: string): AssetCandidateReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new WorkflowError("invalid-input", "candidateRefs 必须是数组");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new WorkflowError("invalid-input", `candidateRefs[${index}] 无效`);
    const candidate = clone(entry as AssetCandidateReference);
    if (!candidate.id && !candidate.key && !candidate.assetId) {
      const source = optionalText(candidate.sourcePath ?? candidate.path ?? candidate.name ?? candidate.fileName);
      if (!source) throw new WorkflowError("invalid-input", `candidateRefs[${index}] 缺少稳定 id 或 sourcePath`);
      // AI receipts may contain only a source path. Derive the workflow
      // identity from immutable delivery facts so retries never mint another
      // candidate for the same request/round/path.
      candidate.id = `candidate:${digest({ seed: identitySeed ?? "candidate", index, source }).slice(0, 32)}`;
    }
    return candidate;
  });
}

function normalizeStatus(value: unknown): TodoStatus {
  if (value === "todo" || value === "in_progress" || value === "done" || value === "blocked") return value;
  if (value === "in-progress" || value === "in progress") return "in_progress";
  throw new WorkflowError("invalid-input", "Todo status 无效");
}

function normalizePriority(value: unknown): TodoPriority {
  if (value === undefined || value === null || value === "") return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new WorkflowError("invalid-input", "Todo priority 无效");
}

function requestId(value: unknown, fallback: string): string {
  const result = optionalText(value);
  if (!result) return fallback;
  if (result.length > 300) throw new WorkflowError("invalid-input", "requestId 过长");
  return result;
}

function connectionCompleted(receipt: WorkflowConnectionReceipt): boolean {
  return receipt.status === "completed";
}

function defaultScope(value: unknown): string[] {
  if (value === undefined || value === null) return ["仅处理当前目标和明确范围", "保留可核对结论", "不要自动合并、发布或扩大范围"];
  if (!Array.isArray(value)) throw new WorkflowError("invalid-input", "scope 必须是数组");
  const result = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim());
  return result.length ? [...new Set(result)] : ["仅处理当前目标和明确范围"];
}

function deepLinkPart(value: unknown): CardGameDeepLinkContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkflowError("invalid-input", "深链接对象无效");
  const context = clone(value as CardGameDeepLinkContext);
  text(context.projectId, "projectId");
  if (!["knowledge", "card", "asset", "production", "todo", "preview"].includes(context.kind)) throw new WorkflowError("invalid-input", "深链接 kind 无效");
  return context;
}

export function encodeCardGameItemId(context: CardGameDeepLinkContext): string {
  return `cg:${encodeURIComponent(JSON.stringify(deepLinkPart(context)))}`;
}

export function decodeCardGameItemId(value: string): CardGameDeepLinkContext {
  if (typeof value !== "string" || !value.startsWith("cg:")) throw new WorkflowError("invalid-input", "不是 CardGame 深链接");
  try {
    return deepLinkPart(JSON.parse(decodeURIComponent(value.slice(3))));
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError("invalid-input", "CardGame 深链接无效");
  }
}

export function todoItemId(projectId: string, id: string, options: Omit<CardGameDeepLinkContext, "projectId" | "kind" | "id"> = {}): string {
  return encodeCardGameItemId({ projectId, kind: "todo", id, ...options });
}

export function productionItemId(projectId: string, id: string, options: Omit<CardGameDeepLinkContext, "projectId" | "kind" | "id"> = {}): string {
  return encodeCardGameItemId({ projectId, kind: "production", id, ...options });
}

class DurableWorkflowStore {
  private constructor(
    private readonly dataRoot: string,
    private readonly dbPath: string,
    private readonly fallbackPath: string,
    private native?: NativeDatabase,
    private state?: PersistedState,
  ) {}

  static async open(dataRoot: string, report?: (event: WorkflowStoreStatus) => void): Promise<DurableWorkflowStore> {
    const dbPath = dataRoot === ":memory:" ? ":memory:" : join(dataRoot, DATABASE_FILE);
    const fallbackPath = dataRoot === ":memory:" ? ":memory:" : join(dataRoot, FALLBACK_FILE);
    if (dataRoot !== ":memory:") await mkdir(dataRoot, { recursive: true });
    const store = new DurableWorkflowStore(dataRoot, dbPath, fallbackPath);
    // Bun's test runner has a real SQLite implementation too.  Prefer it
    // there so pagination and restart tests exercise the same durable shape;
    // native Worka runs the Node 24 DatabaseSync implementation below.
    // A runtime without any SQLite module takes the JSON compatibility path
    // quietly; a module that loads but cannot open the database is a real
    // failure and must be reported.
    let DatabaseCtor: (new (path: string, options?: Record<string, unknown>) => NativeDatabase) | undefined;
    let bunDatabase = false;
    try {
      const bunSqlite = await import("bun:sqlite") as unknown as { Database: new (path: string, options?: Record<string, unknown>) => NativeDatabase };
      DatabaseCtor = bunSqlite.Database;
      bunDatabase = true;
    } catch {
      try {
        const sqlite = await import("node:sqlite") as unknown as { DatabaseSync: new (path: string, options?: Record<string, unknown>) => NativeDatabase };
        DatabaseCtor = sqlite.DatabaseSync;
      } catch { /* no SQLite module in this runtime */ }
    }
    if (DatabaseCtor) {
      const dbExisted = dbPath === ":memory:" || await stat(dbPath).then(() => true, () => false);
      try {
        // Bun's Database rejects the Node-only options object with SQLITE_MISUSE;
        // Node 24 accepts these options on DatabaseSync.
        store.native = bunDatabase
          ? new DatabaseCtor(dbPath)
          : new DatabaseCtor(dbPath, { timeout: 5_000, enableForeignKeyConstraints: true });
        store.native.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS todos (
          project_id TEXT NOT NULL,
          id TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          priority TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revision INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (project_id, id)
        );
        CREATE INDEX IF NOT EXISTS todos_page ON todos(project_id, updated_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS todos_status_page ON todos(project_id, status, updated_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS productions (
          project_id TEXT NOT NULL,
          id TEXT NOT NULL,
          todo_id TEXT,
          brief TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revision INTEGER NOT NULL,
          requirement_revision INTEGER NOT NULL DEFAULT 1,
          round_count INTEGER NOT NULL DEFAULT 0,
          current_round INTEGER,
          candidate_count INTEGER NOT NULL DEFAULT 0,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (project_id, id)
        );
        CREATE INDEX IF NOT EXISTS productions_page ON productions(project_id, updated_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS productions_status_page ON productions(project_id, status, updated_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS productions_todo ON productions(project_id, todo_id);
        CREATE TABLE IF NOT EXISTS workflow_history (
          event_id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          event TEXT NOT NULL,
          revision INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS workflow_history_page ON workflow_history(project_id, kind, item_id, event_id DESC);
        CREATE TABLE IF NOT EXISTS workflow_requests (
          project_id TEXT NOT NULL,
          request_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          production_id TEXT,
          todo_id TEXT,
          round INTEGER,
          requirement_revision INTEGER,
          status TEXT NOT NULL,
          payload_json TEXT,
          result_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (project_id, request_id)
        );
        `);
        // Existing installs may have the first schema without list summaries.
        // Add each column independently so a partially migrated database stays
        // usable and the native path never falls back to a JSON mirror.
        for (const statement of [
          "ALTER TABLE productions ADD COLUMN requirement_revision INTEGER NOT NULL DEFAULT 1",
          "ALTER TABLE productions ADD COLUMN round_count INTEGER NOT NULL DEFAULT 0",
          "ALTER TABLE productions ADD COLUMN current_round INTEGER",
          "ALTER TABLE productions ADD COLUMN candidate_count INTEGER NOT NULL DEFAULT 0",
        ]) {
          try { store.native.exec(statement); } catch { /* already present */ }
        }
        store.native.exec("CREATE INDEX IF NOT EXISTS productions_round_page ON productions(project_id, round_count, updated_at DESC, id DESC)");
        report?.({ kind: "sqlite-ready" });
        await store.warnOnDivergedFallback(report, dbExisted);
      } catch (cause) {
        store.native = undefined;
        report?.({ kind: "sqlite-open-failed", message: `CardGame 工作流 SQLite 不可用，已降级到 JSON 备用存储；恢复后备用存储中的新数据不会自动回写：${dbPath}`, cause });
      }
    }
    if (!store.native && !store.state) store.state = await store.readFallback();
    return store;
  }

  // The JSON mirror only advances while SQLite is down, so a fallback file
  // paired with a fresh or older native database means the two stores may
  // have diverged.
  private async warnOnDivergedFallback(report: ((event: WorkflowStoreStatus) => void) | undefined, dbExisted: boolean): Promise<void> {
    if (!report || this.fallbackPath === ":memory:") return;
    try {
      const fallbackStat = await stat(this.fallbackPath).catch(() => undefined);
      if (!fallbackStat) return;
      const dbStat = await stat(this.dbPath).catch(() => undefined);
      const walStat = await stat(`${this.dbPath}-wal`).catch(() => undefined);
      const nativeMtime = Math.max(dbStat?.mtimeMs ?? 0, walStat?.mtimeMs ?? 0);
      if (!dbExisted || fallbackStat.mtimeMs > nativeMtime) report({ kind: "fallback-diverged", message: `CardGame 工作流 JSON 备用存储比 SQLite 更新，两份数据可能已分叉：${this.fallbackPath}` });
    } catch { /* divergence detection is best effort */ }
  }

  private async readFallback(): Promise<PersistedState> {
    if (this.fallbackPath === ":memory:") return emptyState();
    try {
      const parsed = JSON.parse(await readFile(this.fallbackPath, "utf8")) as Partial<PersistedState>;
      return {
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        nextHistoryId: Number(parsed.nextHistoryId) || 1,
        todos: parsed.todos ?? {},
        productions: parsed.productions ?? {},
        history: parsed.history ?? [],
        requests: parsed.requests ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
  }

  private ensureFallback(): PersistedState {
    if (!this.state) throw new Error("workflow fallback 未打开");
    return this.state;
  }

  private statement(sql: string): NativeStatement {
    if (!this.native) throw new Error("workflow sqlite 未打开");
    return this.native.prepare(sql);
  }

  async flush(): Promise<void> {
    if (this.native || this.fallbackPath === ":memory:") return;
    const temporary = `${this.fallbackPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.ensureFallback()), "utf8");
    await rename(temporary, this.fallbackPath);
  }

  getTodo(projectId: string, id: string): TodoRecord | undefined {
    if (this.native) {
      const row = this.statement("SELECT payload_json FROM todos WHERE project_id = ? AND id = ?").get(projectId, id) as { payload_json?: string } | undefined;
      return row?.payload_json ? JSON.parse(row.payload_json) as TodoRecord : undefined;
    }
    return clone(this.ensureFallback().todos[key(projectId, id)]);
  }

  listTodos(projectId: string): TodoRecord[] {
    if (this.native) {
      return this.statement("SELECT payload_json FROM todos WHERE project_id = ?").all(projectId).map(row => JSON.parse(String((row as { payload_json: string }).payload_json)) as TodoRecord);
    }
    return Object.values(this.ensureFallback().todos).filter(row => row.projectId === projectId).map(clone);
  }

  listTodosPage(projectId: string, input: Record<string, unknown>): WorkflowPage<TodoRecord> {
    const limit = limitOf(input.limit);
    const cursor = decodeCursor(input.cursor);
    const status = input.status === undefined ? undefined : normalizeStatus(input.status);
    const q = optionalText(input.q ?? input.search)?.toLocaleLowerCase();
    if (this.native) {
      const clauses = ["project_id = ?"];
      const params: unknown[] = [projectId];
      if (status) { clauses.push("status = ?"); params.push(status); }
      if (q) { clauses.push("(lower(title) LIKE ? OR lower(payload_json) LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
      if (cursor?.updatedAt !== undefined && cursor.id !== undefined) {
        clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
        params.push(String(cursor.updatedAt), String(cursor.updatedAt), String(cursor.id));
      }
      const rows = this.statement(`SELECT payload_json,updated_at,id FROM todos WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...params, limit + 1) as Array<{ payload_json: string; updated_at: string; id: string }>;
      const hasNext = rows.length > limit;
      const items = rows.slice(0, limit).map(row => JSON.parse(row.payload_json) as TodoRecord);
      const totalParams = [projectId, ...(status ? [status] : []), ...(q ? [`%${q}%`, `%${q}%`] : [])];
      const total = Number((this.statement(`SELECT COUNT(*) AS count FROM todos WHERE ${clauses.filter(clause => !clause.startsWith("(updated_at")).join(" AND ")}`).get(...totalParams) as { count: number }).count);
      return { projectId, items, limit, total, ...(hasNext && items.length ? { nextCursor: encodeCursor({ updatedAt: items.at(-1)!.updatedAt, id: items.at(-1)!.id }) } : {}) };
    }
    const items = this.listTodos(projectId).filter(item => (!status || item.status === status) && (!q || `${item.title}\n${item.description ?? ""}`.toLocaleLowerCase().includes(q)));
    return pageRecords(items, input);
  }

  countTodos(projectId: string): number {
    if (this.native) return Number((this.statement("SELECT COUNT(*) AS count FROM todos WHERE project_id = ?").get(projectId) as { count: number }).count);
    return this.listTodos(projectId).length;
  }

  countTodosByStatus(projectId: string, status: TodoStatus): number {
    if (this.native) return Number((this.statement("SELECT COUNT(*) AS count FROM todos WHERE project_id = ? AND status = ?").get(projectId, status) as { count: number }).count);
    return this.listTodos(projectId).filter(item => item.status === status).length;
  }

  putTodo(todo: TodoRecord): void {
    if (this.native) {
      this.statement(`INSERT INTO todos(project_id,id,title,status,priority,created_at,updated_at,revision,payload_json)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET title=excluded.title,status=excluded.status,priority=excluded.priority,updated_at=excluded.updated_at,revision=excluded.revision,payload_json=excluded.payload_json`)
        .run(todo.projectId, todo.id, todo.title, todo.status, todo.priority, todo.createdAt, todo.updatedAt, todo.revision, JSON.stringify(todo));
      return;
    }
    this.ensureFallback().todos[key(todo.projectId, todo.id)] = clone(todo);
  }

  deleteTodo(projectId: string, id: string): boolean {
    if (this.native) {
      const result = this.statement("DELETE FROM todos WHERE project_id = ? AND id = ?").run(projectId, id) as { changes?: number };
      return Number(result.changes ?? 0) > 0;
    }
    const todos = this.ensureFallback().todos;
    const todoKey = key(projectId, id);
    if (!todos[todoKey]) return false;
    delete todos[todoKey];
    return true;
  }

  getProduction(projectId: string, id: string): ProductionRecord | undefined {
    if (this.native) {
      const row = this.statement("SELECT payload_json FROM productions WHERE project_id = ? AND id = ?").get(projectId, id) as { payload_json?: string } | undefined;
      return row?.payload_json ? JSON.parse(row.payload_json) as ProductionRecord : undefined;
    }
    return clone(this.ensureFallback().productions[key(projectId, id)]);
  }

  listProductions(projectId: string): ProductionRecord[] {
    if (this.native) {
      return this.statement("SELECT payload_json FROM productions WHERE project_id = ?").all(projectId).map(row => JSON.parse(String((row as { payload_json: string }).payload_json)) as ProductionRecord);
    }
    return Object.values(this.ensureFallback().productions).filter(row => row.projectId === projectId).map(clone);
  }

  listProductionsPage(projectId: string, input: Record<string, unknown>): WorkflowPage<ProductionListItem> {
    const limit = limitOf(input.limit);
    const cursor = decodeCursor(input.cursor);
    const status = optionalText(input.status);
    const todoId = optionalText(input.todoId);
    const q = optionalText(input.q ?? input.search)?.toLocaleLowerCase();
    if (this.native) {
      const clauses = ["project_id = ?"];
      const params: unknown[] = [projectId];
      if (status) { clauses.push("status = ?"); params.push(status); }
      if (todoId) { clauses.push("todo_id = ?"); params.push(todoId); }
      if (q) { clauses.push("(lower(brief) LIKE ? OR lower(id) LIKE ? OR lower(todo_id) LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      if (cursor?.updatedAt !== undefined && cursor.id !== undefined) {
        clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
        params.push(String(cursor.updatedAt), String(cursor.updatedAt), String(cursor.id));
      }
      const rows = this.statement(`SELECT project_id,id,todo_id,brief,status,created_at,updated_at,revision,requirement_revision,round_count,current_round,candidate_count,json_extract(payload_json,'$.batch.kind') AS workflow_kind,json_extract(payload_json,'$.batch.progress') AS card_progress,json_extract(payload_json,'$.batch.deck') AS deck_plan FROM productions WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...params, limit + 1) as Array<Record<string, unknown>>;
      const hasNext = rows.length > limit;
      const items = rows.slice(0, limit).map(row => productionListItemFromSql(row));
      const totalParams = [projectId, ...(status ? [status] : []), ...(todoId ? [todoId] : []), ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [])];
      const total = Number((this.statement(`SELECT COUNT(*) AS count FROM productions WHERE ${clauses.filter(clause => !clause.startsWith("(updated_at")).join(" AND ")}`).get(...totalParams) as { count: number }).count);
      return { projectId, items, limit, total, ...(hasNext && items.length ? { nextCursor: encodeCursor({ updatedAt: items.at(-1)!.updatedAt, id: items.at(-1)!.id }) } : {}) };
    }
    const items = this.listProductions(projectId)
      .filter(item => (!status || item.status === status) && (!todoId || item.todoId === todoId) && (!q || `${item.brief}\n${item.id}\n${item.todoId ?? ""}`.toLocaleLowerCase().includes(q)))
      .map(productionListItemFromRecord);
    return pageRecords(items, input);
  }

  countProductions(projectId: string): number {
    if (this.native) return Number((this.statement("SELECT COUNT(*) AS count FROM productions WHERE project_id = ?").get(projectId) as { count: number }).count);
    return this.listProductions(projectId).length;
  }

  countProductionsByStatus(projectId: string, status: ProductionStatus): number {
    if (this.native) return Number((this.statement("SELECT COUNT(*) AS count FROM productions WHERE project_id = ? AND status = ?").get(projectId, status) as { count: number }).count);
    return this.listProductions(projectId).filter(item => item.status === status).length;
  }

  putProduction(production: ProductionRecord): void {
    if (this.native) {
      this.statement(`INSERT INTO productions(project_id,id,todo_id,brief,status,created_at,updated_at,revision,requirement_revision,round_count,current_round,candidate_count,payload_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET todo_id=excluded.todo_id,brief=excluded.brief,status=excluded.status,updated_at=excluded.updated_at,revision=excluded.revision,requirement_revision=excluded.requirement_revision,round_count=excluded.round_count,current_round=excluded.current_round,candidate_count=excluded.candidate_count,payload_json=excluded.payload_json`)
        .run(production.projectId, production.id, production.todoId ?? null, production.brief, production.status, production.createdAt, production.updatedAt, production.revision, production.requirementRevision, production.rounds.length, production.rounds.at(-1)?.round ?? null, production.candidateRefs.length, JSON.stringify(production));
      return;
    }
    this.ensureFallback().productions[key(production.projectId, production.id)] = clone(production);
  }

  findProductionForTodo(projectId: string, todoId: string): ProductionRecord | undefined {
    if (this.native) {
      const row = this.statement("SELECT payload_json FROM productions WHERE project_id = ? AND todo_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1").get(projectId, todoId) as { payload_json?: string } | undefined;
      return row?.payload_json ? JSON.parse(row.payload_json) as ProductionRecord : undefined;
    }
    return this.listProductions(projectId).filter(item => item.todoId === todoId).sort(compareRecords)[0];
  }

  addHistory(event: Omit<WorkflowHistoryRecord, "id">): WorkflowHistoryRecord {
    if (this.native) {
      const result = this.statement("INSERT INTO workflow_history(project_id,item_id,kind,event,revision,payload_json,created_at) VALUES(?,?,?,?,?,?,?)")
        .run(event.projectId, event.itemId, event.kind, event.event, event.revision, JSON.stringify(event.payload), event.createdAt) as { lastInsertRowid?: number };
      return { ...clone(event), id: Number(result.lastInsertRowid) };
    }
    const state = this.ensureFallback();
    const row = { ...clone(event), id: state.nextHistoryId++ };
    state.history.push(row);
    return row;
  }

  listHistory(projectId: string, kind: "todo" | "production", itemId: string): WorkflowHistoryRecord[] {
    if (this.native) {
      return this.statement("SELECT event_id,project_id,item_id,kind,event,revision,payload_json,created_at FROM workflow_history WHERE project_id = ? AND kind = ? AND item_id = ? ORDER BY event_id DESC")
        .all(projectId, kind, itemId).map(row => {
          const value = row as { event_id: number; project_id: string; item_id: string; kind: "todo" | "production"; event: string; revision: number; payload_json: string; created_at: string };
          return { id: Number(value.event_id), projectId: value.project_id, itemId: value.item_id, kind: value.kind, event: value.event, revision: Number(value.revision), payload: JSON.parse(value.payload_json), createdAt: value.created_at };
        });
    }
    return this.ensureFallback().history.filter(item => item.projectId === projectId && item.kind === kind && item.itemId === itemId).sort((a, b) => b.id - a.id).map(clone);
  }

  listHistoryPage(projectId: string, kind: "todo" | "production", itemId: string, input: Record<string, unknown>): { items: WorkflowHistoryRecord[]; nextCursor?: string; limit: number } {
    const limit = limitOf(input.historyLimit ?? input.limit);
    const cursor = decodeCursor(input.historyCursor);
    if (this.native) {
      const params: unknown[] = [projectId, kind, itemId];
      const cursorClause = cursor?.id !== undefined ? " AND event_id < ?" : "";
      if (cursor?.id !== undefined) params.push(Number(cursor.id));
      const rows = this.statement(`SELECT event_id,project_id,item_id,kind,event,revision,payload_json,created_at FROM workflow_history WHERE project_id = ? AND kind = ? AND item_id = ?${cursorClause} ORDER BY event_id DESC LIMIT ?`).all(...params, limit + 1) as Array<Record<string, unknown>>;
      const hasNext = rows.length > limit;
      const items = rows.slice(0, limit).map(row => {
        return { id: Number(row.event_id), projectId: String(row.project_id), itemId: String(row.item_id), kind: row.kind as "todo" | "production", event: String(row.event), revision: Number(row.revision), payload: JSON.parse(String(row.payload_json)), createdAt: String(row.created_at) };
      });
      return { items, limit, ...(hasNext && items.length ? { nextCursor: encodeCursor({ id: items.at(-1)!.id }) } : {}) };
    }
    return pageHistory(this.listHistory(projectId, kind, itemId), input);
  }

  getRequest(projectId: string, requestId: string): RequestReceiptRow | undefined {
    if (this.native) {
      const row = this.statement(`SELECT project_id,request_id,operation,fingerprint,production_id,todo_id,round,requirement_revision,status,payload_json,result_json,created_at,updated_at
        FROM workflow_requests WHERE project_id = ? AND request_id = ?`).get(projectId, requestId) as Record<string, unknown> | undefined;
      return row ? requestFromSql(row) : undefined;
    }
    return clone(this.ensureFallback().requests[key(projectId, requestId)]);
  }

  putRequest(row: RequestReceiptRow): void {
    if (this.native) {
      this.statement(`INSERT INTO workflow_requests(project_id,request_id,operation,fingerprint,production_id,todo_id,round,requirement_revision,status,payload_json,result_json,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,request_id) DO UPDATE SET operation=excluded.operation,fingerprint=excluded.fingerprint,production_id=excluded.production_id,todo_id=excluded.todo_id,round=excluded.round,requirement_revision=excluded.requirement_revision,status=excluded.status,payload_json=excluded.payload_json,result_json=excluded.result_json,updated_at=excluded.updated_at`)
        .run(row.projectId, row.requestId, row.operation, row.fingerprint, row.productionId ?? null, row.todoId ?? null, row.round ?? null, row.requirementRevision ?? null, row.status, row.payload === undefined ? null : JSON.stringify(row.payload), row.result === undefined ? null : JSON.stringify(row.result), row.createdAt, row.updatedAt);
      return;
    }
    this.ensureFallback().requests[key(row.projectId, row.requestId)] = clone(row);
  }

  begin(): void { this.native?.exec("BEGIN IMMEDIATE"); }
  commit(): void { this.native?.exec("COMMIT"); }
  rollback(): void { this.native?.exec("ROLLBACK"); }

  async close(): Promise<void> {
    await this.flush();
    this.native?.close();
    this.native = undefined;
    this.state = undefined;
  }
}

function emptyState(): PersistedState {
  return { schemaVersion: WORKFLOW_SCHEMA_VERSION, nextHistoryId: 1, todos: {}, productions: {}, history: [], requests: {} };
}

function requestFromSql(row: Record<string, unknown>): RequestReceiptRow {
  return {
    projectId: String(row.project_id),
    requestId: String(row.request_id),
    operation: String(row.operation),
    fingerprint: String(row.fingerprint),
    ...(row.production_id ? { productionId: String(row.production_id) } : {}),
    ...(row.todo_id ? { todoId: String(row.todo_id) } : {}),
    ...(row.round !== null && row.round !== undefined ? { round: Number(row.round) } : {}),
    ...(row.requirement_revision !== null && row.requirement_revision !== undefined ? { requirementRevision: Number(row.requirement_revision) } : {}),
    status: String(row.status),
    ...(row.payload_json ? { payload: JSON.parse(String(row.payload_json)) } : {}),
    ...(row.result_json ? { result: JSON.parse(String(row.result_json)) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function compareRecords(a: { updatedAt: string; id: string }, b: { updatedAt: string; id: string }): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function productionListItemFromRecord(production: ProductionRecord): ProductionListItem {
  return {
    ...((production.batch as { kind?: string } | undefined)?.kind === 'card-generation' ? { workflowKind: 'card-generation' } : {}),
    ...((production.batch as any)?.deck ? { deckProgress: { distinctCards: (production.batch as any).deck.entries.length, totalCopies: (production.batch as any).deck.entries.reduce((sum: number, entry: any) => sum + entry.count, 0), targetSize: (production.batch as any).deck.targetSize, title: (production.batch as any).deck.title } } : {}),
    ...((production.batch as any)?.progress ? { cardProgress: (production.batch as any).progress } : {}),
    projectId: production.projectId,
    id: production.id,
    brief: production.brief,
    status: production.status,
    ...(production.todoId ? { todoId: production.todoId } : {}),
    roundCount: production.rounds.length,
    ...(production.rounds.at(-1)?.round !== undefined ? { currentRound: production.rounds.at(-1)!.round } : {}),
    candidateCount: production.candidateRefs.length,
    requirementRevision: production.requirementRevision,
    revision: production.revision,
    createdAt: production.createdAt,
    updatedAt: production.updatedAt,
  };
}

function productionListItemFromSql(row: Record<string, unknown>): ProductionListItem {
  const status = String(row.status) as ProductionStatus;
  return {
    ...(row.workflow_kind === 'card-generation' ? { workflowKind: 'card-generation' } : {}),
    ...(typeof row.deck_plan === 'string' ? (()=>{ const deck=JSON.parse(row.deck_plan);return {deckProgress:{distinctCards:deck.entries.length,totalCopies:deck.entries.reduce((sum:number,entry:any)=>sum+entry.count,0),targetSize:deck.targetSize,title:deck.title}}; })() : {}),
    ...(typeof row.card_progress === 'string' ? { cardProgress: JSON.parse(row.card_progress) } : {}),
    projectId: String(row.project_id),
    id: String(row.id),
    brief: String(row.brief),
    status,
    ...(row.todo_id ? { todoId: String(row.todo_id) } : {}),
    roundCount: Number(row.round_count ?? 0),
    ...(row.current_round !== null && row.current_round !== undefined ? { currentRound: Number(row.current_round) } : {}),
    candidateCount: Number(row.candidate_count ?? 0),
    requirementRevision: Number(row.requirement_revision ?? 1),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function pageRecords<T extends { updatedAt: string; id: string }>(items: T[], input: Record<string, unknown>): WorkflowPage<T> {
  const limit = limitOf(input.limit);
  const cursor = decodeCursor(input.cursor);
  const sorted = [...items].sort(compareRecords);
  const after = cursor && typeof cursor.updatedAt === "string" && typeof cursor.id === "string"
    ? sorted.filter(item => item.updatedAt < cursor.updatedAt! || (item.updatedAt === cursor.updatedAt && item.id < cursor.id!))
    : sorted;
  const page = after.slice(0, limit);
  const nextCursor = after.length > limit && page.length ? encodeCursor({ updatedAt: page.at(-1)!.updatedAt, id: page.at(-1)!.id }) : undefined;
  return { projectId: String(input.projectId), items: page.map(clone), ...(nextCursor ? { nextCursor } : {}), limit, total: sorted.length };
}

function pageHistory(items: WorkflowHistoryRecord[], input: Record<string, unknown>): { items: WorkflowHistoryRecord[]; nextCursor?: string; limit: number } {
  const limit = limitOf(input.historyLimit ?? input.limit);
  const cursor = decodeCursor(input.historyCursor);
  const after = cursor?.id !== undefined ? items.filter(item => item.id < Number(cursor.id)) : items;
  const page = after.slice(0, limit);
  return { items: page.map(clone), ...(after.length > limit && page.length ? { nextCursor: encodeCursor({ id: page.at(-1)!.id }) } : {}), limit };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkflowError("invalid-input", "输入必须是对象");
  return value as Record<string, unknown>;
}

/** Normalize the execution-note receipt into the binding used by live queries. */
function executionBindingFromReceipt(receipt: Record<string, unknown>): ExecutionBinding {
  const result = receipt.result && typeof receipt.result === "object" && !Array.isArray(receipt.result) ? receipt.result as Record<string, unknown> : {};
  const raw = receipt.binding ?? receipt.delegation ?? receipt.execution ?? result.binding ?? result.delegation ?? result.execution;
  const binding = raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw as ExecutionBinding) : {};
  const deskRaw = receipt.desk ?? result.desk;
  const desk = deskRaw && typeof deskRaw === "object" && !Array.isArray(deskRaw) ? deskRaw as Record<string, unknown> : {};
  const deskNoteId = optionalText(binding.deskNoteId ?? binding.noteId ?? receipt.deskNoteId ?? result.deskNoteId ?? desk.noteId ?? receipt.noteId ?? result.noteId);
  const stateRef = optionalText(binding.stateRef ?? binding.delegationStateRef ?? receipt.stateRef ?? result.stateRef ?? desk.stateRef);
  const delegationId = optionalText(binding.delegationId ?? receipt.delegationId ?? result.delegationId);
  const taskId = optionalText(binding.taskId ?? receipt.taskId ?? result.taskId ?? delegationId);
  return {
    ...binding,
    ...(deskNoteId ? { deskNoteId } : {}),
    ...(stateRef ? { stateRef } : {}),
    ...(delegationId ? { delegationId } : {}),
    ...(taskId ? { taskId } : {}),
  };
}

function statusFromReceipt(receipt: WorkflowConnectionReceipt): string {
  // `completed` here means the transport finished accepting the submit.  The
  // execution task may still be running; only productionResult can establish
  // that generation itself completed.
  if (receipt.status === "completed") return "running";
  if (["queued", "started", "accepted", "running"].includes(receipt.status)) return receipt.status === "queued" ? "queued" : "running";
  return receipt.status;
}

function taskStatusFromReceipt(receipt: Record<string, unknown>): string | undefined {
  const result = receipt.result && typeof receipt.result === "object" && !Array.isArray(receipt.result) ? receipt.result as Record<string, unknown> : {};
  const candidate = result.taskStatus ?? result.executionStatus ?? result.state ?? result.status;
  const value = optionalText(candidate);
  if (!value || value === "completed") return undefined;
  return value;
}

export function createWorkflowService(options: WorkflowServiceOptions): WorkflowService {
  const projects = new Map<string, WorkflowProject>();
  for (const project of options.projects) {
    if (!project || typeof project.id !== "string" || !project.id.trim()) throw new Error("CardGame project id 不能为空");
    if (projects.has(project.id)) throw new Error(`重复的 CardGame project id：${project.id}`);
    projects.set(project.id, { ...project, id: project.id.trim() });
  }
  const now = options.now ?? Date.now;
  const makeId = options.idFactory ?? randomUUID;
  const listeners = new Set<(change: WorkflowInvalidation) => void>();
  const ready = DurableWorkflowStore.open(options.dataRoot, options.onStoreStatus);
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();

  const assertProject = (input: Record<string, unknown>): string => {
    const projectId = text(input.projectId, "projectId");
    if (!projects.has(projectId)) throw new WorkflowError("unknown-project", `未知项目：${projectId}`);
    return projectId;
  };

  const emit = (change: WorkflowInvalidation): void => {
    for (const listener of listeners) {
      try { listener(change); } catch { /* invalidation is best effort */ }
    }
  };

  function enqueue<T>(operation: (store: DurableWorkflowStore) => Promise<T> | T): Promise<T> {
    const run = queue.then(async () => {
      if (closed) throw new WorkflowError("closed", "工作流服务已关闭");
      const store = await ready;
      const result = await operation(store);
      await store.flush();
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  function touchTodo(store: DurableWorkflowStore, todo: TodoRecord, event: string, payload: Record<string, unknown>, at: string): TodoRecord {
    store.putTodo(todo);
    store.addHistory({ projectId: todo.projectId, itemId: todo.id, kind: "todo", event, revision: todo.revision, payload, createdAt: at });
    return todo;
  }

  function touchProduction(store: DurableWorkflowStore, production: ProductionRecord, event: string, payload: Record<string, unknown>, at: string): ProductionRecord {
    store.putProduction(production);
    store.addHistory({ projectId: production.projectId, itemId: production.id, kind: "production", event, revision: production.revision, payload, createdAt: at });
    return production;
  }

  function checkRevision(actual: number, expected: unknown, current: unknown): void {
    if (expected === undefined || expected === null || expected === "") throw new WorkflowConflictError("需要 baseRevision 才能修改此记录", current);
    if (integer(expected) !== actual) throw new WorkflowConflictError(undefined, current);
  }

  function checkCapacity(store: DurableWorkflowStore, projectId: string, kind: "todo" | "production"): void {
    // 10k is the first acceptance scale, not a product capacity ceiling.
    // Keep the helper so callers document the intended indexed collection,
    // while allowing projects to grow beyond the benchmark size.
    void store;
    void projectId;
    void kind;
  }

  async function createTodo(input: Record<string, unknown>): Promise<{ item: TodoRecord; revision: number }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      checkCapacity(store, projectId, "todo");
      const id = optionalText(input.id) ?? `todo-${makeId()}`;
      if (store.getTodo(projectId, id)) throw new WorkflowError("already-exists", `Todo 已存在：${id}`);
      const at = iso(now());
      const status = normalizeStatus(input.status ?? "todo");
      const title = text(input.title, "title");
      const item: TodoRecord = {
        projectId,
        id,
        title,
        ...(optionalText(input.description) ? { description: optionalText(input.description) } : {}),
        ...(input.images !== undefined ? { images: normalizeTodoImages(input.images) } : {}),
        status,
        completed: status === "done",
        priority: normalizePriority(input.priority),
        ...(optionalText(input.category) ? { category: optionalText(input.category) } : {}),
        ...(optionalText(input.dueDate) ? { dueDate: optionalText(input.dueDate) } : {}),
        ...(input.context ? { context: deepLinkPart(input.context) } : {}),
        requirementRevision: 1,
        revision: 1,
        createdAt: at,
        updatedAt: at,
      };
      touchTodo(store, item, "created", { title: item.title }, at);
      emit({ projectId, kind: "todo", id, revision: item.revision });
      return { item: clone(item), revision: item.revision };
    });
  }

  async function updateTodo(input: Record<string, unknown>): Promise<{ item: TodoRecord; revision: number }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const id = text(input.id ?? input.itemId, "id");
      const current = store.getTodo(projectId, id);
      if (!current) throw new WorkflowError("not-found", `找不到 Todo：${id}`);
      checkRevision(current.revision, input.baseRevision, current);
      const patch = asRecord(input.patch ?? input);
      const next = clone(current);
      let requirementChanged = false;
      if (patch.title !== undefined) { next.title = text(patch.title, "title"); requirementChanged = true; }
      if (patch.description !== undefined) { next.description = optionalText(patch.description) ?? ""; requirementChanged = true; }
      if (patch.images !== undefined) { const images = normalizeTodoImages(patch.images); if (images.length) next.images = images; else delete next.images; requirementChanged = true; }
      if (patch.status !== undefined) { next.status = normalizeStatus(patch.status); next.completed = next.status === "done"; }
      if (patch.completed !== undefined && patch.status === undefined) { next.completed = Boolean(patch.completed); next.status = next.completed ? "done" : "todo"; }
      if (patch.priority !== undefined) { next.priority = normalizePriority(patch.priority); requirementChanged = true; }
      if (patch.category !== undefined) { next.category = optionalText(patch.category); requirementChanged = true; }
      if (patch.dueDate !== undefined) { next.dueDate = optionalText(patch.dueDate); requirementChanged = true; }
      if (patch.context !== undefined) next.context = deepLinkPart(patch.context);
      if (patch.conclusion !== undefined) next.conclusion = optionalText(patch.conclusion);
      if (requirementChanged) next.requirementRevision += 1;
      next.revision += 1;
      next.updatedAt = iso(now());
      touchTodo(store, next, "updated", { fields: Object.keys(patch), requirementChanged }, next.updatedAt);
      emit({ projectId, kind: "todo", id, revision: next.revision });
      return { item: clone(next), revision: next.revision };
    });
  }

  function hasActiveDelegation(item: TodoRecord): boolean {
    const active = new Set(["pending", "queued", "started", "accepted", "running", "in_progress", "in-progress", "resuming"]);
    const execution = item.execution;
    const executionStatus = optionalText(execution?.status ?? execution?.state ?? execution?.executionStatus)?.toLocaleLowerCase();
    if (executionStatus ? active.has(executionStatus) : Boolean(execution && (execution.delegationId || execution.executionId || execution.taskId))) return true;
    const deliveryStatus = optionalText(item.delivery?.status)?.toLocaleLowerCase();
    return Boolean(deliveryStatus && active.has(deliveryStatus));
  }

  /** Delete one Todo with a revision check; execution-bound rows stay intact. */
  async function deleteTodo(input: Record<string, unknown>): Promise<{ deleted: true; projectId: string; id: string; revision: number }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const id = text(input.id ?? input.itemId, "id");
      const current = store.getTodo(projectId, id);
      if (!current) throw new WorkflowError("not-found", `找不到 Todo：${id}`);
      checkRevision(current.revision, input.baseRevision, current);
      if (hasActiveDelegation(current)) throw new WorkflowError("active-delegation", "仍有执行中的交办任务，无法删除", current.execution ?? current.delivery);
      const revision = current.revision + 1;
      if (!store.deleteTodo(projectId, id)) throw new WorkflowError("not-found", `找不到 Todo：${id}`);
      const at = iso(now());
      store.addHistory({ projectId, itemId: id, kind: "todo", event: "deleted", revision, payload: { baseRevision: current.revision, item: clone(current) }, createdAt: at });
      emit({ projectId, kind: "todo", id, revision });
      return { deleted: true, projectId, id, revision };
    });
  }

  async function todoFeedback(input: Record<string, unknown>): Promise<{ item: TodoRecord; revision: number; requirementChanged: boolean }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const id = text(input.itemId ?? input.id, "itemId");
      const current = store.getTodo(projectId, id);
      if (!current) throw new WorkflowError("not-found", `找不到 Todo：${id}`);
      const expectedRequirement = input.requirementRevision === undefined ? undefined : integer(input.requirementRevision);
      const requirementChanged = expectedRequirement !== undefined && expectedRequirement !== current.requirementRevision;
      const next = clone(current);
      if (input.status !== undefined) { next.status = normalizeStatus(input.status); next.completed = next.status === "done"; }
      if (input.conclusion !== undefined) next.conclusion = text(input.conclusion, "conclusion");
      if (input.execution && typeof input.execution === "object" && !Array.isArray(input.execution)) next.execution = { ...(next.execution ?? {}), ...clone(input.execution as ExecutionBinding) };
      if (input.taskId !== undefined) next.taskId = optionalText(input.taskId);
      next.revision += 1;
      next.updatedAt = iso(now());
      touchTodo(store, next, "feedback", { status: next.status, requirementChanged, ...(optionalText(input.requestId) ? { requestId: optionalText(input.requestId) } : {}) }, next.updatedAt);
      emit({ projectId, kind: "todo", id, revision: next.revision });
      return { item: clone(next), revision: next.revision, requirementChanged };
    });
  }

  async function importTodos(input: Record<string, unknown>): Promise<{ imported: number; updated: number; skipped: number; items: TodoRecord[] }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      if (!Array.isArray(input.items)) throw new WorkflowError("invalid-input", "items 必须是数组");
      const imported: TodoRecord[] = [];
      let updated = 0;
      let skipped = 0;
      store.begin();
      try {
        for (let index = 0; index < input.items.length; index += 1) {
        const source = asRecord(input.items[index]);
        const sourceId = optionalText(source.id ?? source.itemId ?? source.key);
        const id = sourceId ?? `legacy-${digest({ projectId, title: source.title, description: source.description, index }).slice(0, 24)}`;
        const existing = store.getTodo(projectId, id);
        const title = text(source.title ?? source.name ?? `待办 ${id}`, "title");
        const incomingRequirement = {
          title,
          description: optionalText(source.description) ?? "",
          priority: normalizePriority(source.priority),
          category: optionalText(source.category) ?? "",
          dueDate: optionalText(source.dueDate) ?? "",
          images: source.images === undefined ? undefined : normalizeTodoImages(source.images),
        };
        if (!existing) {
          checkCapacity(store, projectId, "todo");
          const at = iso(now());
          const status = normalizeStatus(source.status ?? (source.completed ? "done" : "todo"));
          const item: TodoRecord = {
            projectId,
            id,
            title,
            ...(incomingRequirement.description ? { description: incomingRequirement.description } : {}),
            status,
            completed: status === "done",
            priority: incomingRequirement.priority,
            ...(incomingRequirement.category ? { category: incomingRequirement.category } : {}),
            ...(incomingRequirement.dueDate ? { dueDate: incomingRequirement.dueDate } : {}),
            ...(incomingRequirement.images?.length ? { images: incomingRequirement.images } : {}),
            ...(optionalText(source.conclusion) ? { conclusion: optionalText(source.conclusion) } : {}),
            requirementRevision: 1,
            revision: 1,
            createdAt: optionalText(source.createdAt) ?? at,
            updatedAt: at,
          };
          touchTodo(store, item, "imported", { sourceId: id }, at);
          imported.push(clone(item));
          emit({ projectId, kind: "todo", id, revision: 1 });
          continue;
        }
        // Import is intentionally idempotent and preserves fields users edited
        // after the legacy copy.  Only a genuinely missing field is filled.
        const next = clone(existing);
        let changed = false;
        if (!next.description && incomingRequirement.description) { next.description = incomingRequirement.description; changed = true; }
        if (!next.category && incomingRequirement.category) { next.category = incomingRequirement.category; changed = true; }
        if (!next.dueDate && incomingRequirement.dueDate) { next.dueDate = incomingRequirement.dueDate; changed = true; }
        if (!next.images?.length && incomingRequirement.images?.length) { next.images = incomingRequirement.images; changed = true; }
        if (!next.conclusion && optionalText(source.conclusion)) { next.conclusion = optionalText(source.conclusion); changed = true; }
        if (!changed) { skipped += 1; continue; }
        next.revision += 1;
        next.updatedAt = iso(now());
        touchTodo(store, next, "import-merge", { sourceId: id }, next.updatedAt);
        updated += 1;
        imported.push(clone(next));
        emit({ projectId, kind: "todo", id, revision: next.revision });
        }
        store.commit();
      } catch (error) {
        store.rollback();
        throw error;
      }
      return { imported: imported.length - updated, updated, skipped, items: imported };
    });
  }

  function todoRequirement(item: TodoRecord): Record<string, unknown> {
    return {
      itemId: item.id,
      title: item.title,
      description: item.description ?? "",
      images: item.images ?? [],
      priority: item.priority,
      category: item.category ?? "",
      dueDate: item.dueDate ?? null,
      requirementRevision: item.requirementRevision,
    };
  }

  async function delegateTodo(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const projectId = text(input.projectId, "projectId");
    assertProject(input);
    const id = text(input.itemId ?? input.id, "itemId");
    const initial = await enqueue(store => {
      const item = store.getTodo(projectId, id);
      if (!item) throw new WorkflowError("not-found", `找不到 Todo：${id}`);
      const requirement = todoRequirement(item);
      const businessKey = text(input.businessKey ?? `todo:${projectId}:${id}`, "businessKey");
      const scope = defaultScope(input.scope);
      const payload = {
        projectId,
        itemId: id,
        businessKey,
        goal: optionalText(input.goal) ?? `处理待办：${item.title}`,
        scope,
        requirement,
        cwd: optionalText(input.cwd),
        resumePaused: true,
        delegationId: item.execution?.delegationId,
      };
      const request = requestId(input.requestId ?? item.delivery?.requestId, `todo-repair:${projectId}:${id}:${item.requirementRevision}`);
      // A successful first delivery can add a delegationId to the Todo.  It
      // is transport binding metadata, so it must not make a retry with the
      // same requestId look like a different user request.
      const fingerprint = digest({ operation: "repair", payload: { ...payload, delegationId: undefined } });
      const prior = store.getRequest(projectId, request);
      if (prior && prior.fingerprint !== fingerprint) throw new WorkflowRequestIdReuseError(undefined, { requestId: request, previous: prior });
      const at = iso(now());
      const sameDelivery = item.delivery?.requestId === request && item.delivery.fingerprint === fingerprint;
      const transportPayload = sameDelivery ? item.delivery!.payload : payload;
      if (!sameDelivery || item.delivery?.status !== "pending") {
        const next = clone(item);
        next.delivery = { requestId: request, businessKey, fingerprint, status: "pending", payload: transportPayload, updatedAt: at };
        next.revision += 1;
        next.updatedAt = at;
        touchTodo(store, next, "delegation-prepared", { requestId: request, businessKey }, at);
        store.putRequest({ projectId, requestId: request, operation: "repair", fingerprint, todoId: id, status: "pending", payload: transportPayload, createdAt: prior?.createdAt ?? at, updatedAt: at });
        emit({ projectId, kind: "todo", id, revision: next.revision });
        return { item: next, payload: transportPayload, requestId: request, fingerprint };
      }
      return { item, payload: transportPayload, requestId: request, fingerprint };
    });

    return { ...clone(initial), pending: true };
  }

  function productionRequirement(input: Record<string, unknown>, current?: ProductionRecord): { brief: string; targetAsset?: TargetAssetReference; pinnedRefs: ContentReference[]; batch?: unknown; todoId?: string; featureId?: string } {
    const brief = text(input.brief ?? current?.brief, "brief");
    const target = input.targetAsset ?? input.target ?? current?.targetAsset;
    const targetAsset = target && typeof target === "object" && !Array.isArray(target) ? clone(target as TargetAssetReference) : undefined;
    const pinnedRefs = input.pinnedRefs === undefined && input.contentRefs === undefined && current ? clone(current.pinnedRefs) : normalizeRefs(input.pinnedRefs ?? input.contentRefs);
    const todoId = optionalText(input.todoId ?? current?.todoId);
    const featureId = optionalText(input.featureId ?? current?.featureId);
    return { brief, ...(targetAsset ? { targetAsset } : {}), pinnedRefs, ...(input.batch !== undefined ? { batch: clone(input.batch) } : current?.batch !== undefined ? { batch: clone(current.batch) } : {}), ...(todoId ? { todoId } : {}), ...(featureId ? { featureId } : {}) };
  }

  function createProductionRecord(projectId: string, id: string, requirement: ReturnType<typeof productionRequirement>, at: string): ProductionRecord {
    return {
      projectId,
      id,
      brief: requirement.brief,
      ...(requirement.targetAsset ? { targetAsset: requirement.targetAsset } : {}),
      pinnedRefs: requirement.pinnedRefs,
      ...(requirement.batch !== undefined ? { batch: requirement.batch } : {}),
      rounds: [],
      candidateRefs: [],
      ...(requirement.todoId ? { todoId: requirement.todoId } : {}),
      ...(requirement.featureId ? { featureId: requirement.featureId } : {}),
      status: "draft",
      requirementRevision: 1,
      revision: 1,
      createdAt: at,
      updatedAt: at,
    };
  }

  async function upsertProduction(input: Record<string, unknown>): Promise<{ production: ProductionRecord; revision: number; created: boolean }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const requestedId = optionalText(input.id ?? input.productionId);
      const todoId = optionalText(input.todoId);
      const current = requestedId ? store.getProduction(projectId, requestedId) : todoId ? store.findProductionForTodo(projectId, todoId) : undefined;
      if (!current) checkCapacity(store, projectId, "production");
      const at = iso(now());
      if (!current) {
        const id = requestedId ?? `production-${makeId()}`;
        const requirement = productionRequirement(input);
        if (requirement.todoId) {
          const existingForTodo = store.findProductionForTodo(projectId, requirement.todoId);
          if (existingForTodo) return { production: clone(existingForTodo), revision: existingForTodo.revision, created: false };
        }
        const production = createProductionRecord(projectId, id, requirement, at);
        touchProduction(store, production, "created", { draft: true }, at);
        emit({ projectId, kind: "production", id, revision: production.revision });
        return { production: clone(production), revision: production.revision, created: true };
      }
      if (input.baseRevision !== undefined) checkRevision(current.revision, input.baseRevision, current);
      const requirement = productionRequirement(input, current);
      const next = clone(current);
      const changed = stable({ brief: next.brief, targetAsset: next.targetAsset, pinnedRefs: next.pinnedRefs, batch: next.batch, todoId: next.todoId, featureId: next.featureId }) !== stable(requirement);
      next.brief = requirement.brief;
      next.targetAsset = requirement.targetAsset;
      next.pinnedRefs = requirement.pinnedRefs;
      next.batch = requirement.batch;
      next.todoId = requirement.todoId;
      next.featureId = requirement.featureId;
      if (changed) next.requirementRevision += 1;
      if (changed) next.revision += 1;
      next.updatedAt = changed ? at : next.updatedAt;
      if (changed) touchProduction(store, next, "updated", { requirementChanged: true }, at);
      return { production: clone(next), revision: next.revision, created: false };
    });
  }

  /** Bulk migration/fixture path used by legacy imports and scale checks. */
  async function importProductions(input: Record<string, unknown>): Promise<{ imported: number; updated: number; skipped: number; items: ProductionRecord[] }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      if (!Array.isArray(input.items)) throw new WorkflowError("invalid-input", "items 必须是数组");
      const imported: ProductionRecord[] = [];
      let updated = 0;
      let skipped = 0;
      store.begin();
      try {
        for (let index = 0; index < input.items.length; index += 1) {
          const source = asRecord(input.items[index]);
          const id = text(source.id ?? source.productionId ?? `legacy-production-${digest({ projectId, index, brief: source.brief }).slice(0, 24)}`, "productionId");
          const todoId = optionalText(source.todoId);
          const current = store.getProduction(projectId, id) ?? (todoId ? store.findProductionForTodo(projectId, todoId) : undefined);
          const requirement = productionRequirement({ ...source, projectId, id, ...(todoId ? { todoId } : {}) }, current);
          if (!current) {
            checkCapacity(store, projectId, "production");
            const at = iso(now());
            const production = createProductionRecord(projectId, id, requirement, at);
            touchProduction(store, production, "imported", { sourceId: id }, at);
            imported.push(clone(production));
            emit({ projectId, kind: "production", id, revision: production.revision });
            continue;
          }
          const changed = stable({ brief: current.brief, targetAsset: current.targetAsset, pinnedRefs: current.pinnedRefs, batch: current.batch, todoId: current.todoId, featureId: current.featureId }) !== stable(requirement);
          if (!changed) { skipped += 1; continue; }
          const at = iso(now());
          const next = clone(current);
          next.brief = requirement.brief;
          next.targetAsset = requirement.targetAsset;
          next.pinnedRefs = requirement.pinnedRefs;
          next.batch = requirement.batch;
          next.todoId = requirement.todoId;
          next.featureId = requirement.featureId;
          next.requirementRevision += 1;
          next.revision += 1;
          next.updatedAt = at;
          touchProduction(store, next, "import-merge", { sourceId: id }, at);
          imported.push(clone(next));
          updated += 1;
          emit({ projectId, kind: "production", id: next.id, revision: next.revision });
        }
        store.commit();
      } catch (error) {
        store.rollback();
        throw error;
      }
      return { imported: imported.length - updated, updated, skipped, items: imported };
    });
  }

  async function updateProduction(input: Record<string, unknown>): Promise<{ production: ProductionRecord; revision: number }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const id = text(input.id ?? input.productionId, "productionId");
      const current = store.getProduction(projectId, id);
      if (!current) throw new WorkflowError("not-found", `找不到制作请求：${id}`);
      checkRevision(current.revision, input.baseRevision, current);
      const patch = asRecord(input.patch ?? input);
      const next = clone(current);
      let changed = false;
      if (patch.brief !== undefined) { next.brief = text(patch.brief, "brief"); changed = true; }
      if (patch.targetAsset !== undefined) { next.targetAsset = patch.targetAsset && typeof patch.targetAsset === "object" && !Array.isArray(patch.targetAsset) ? clone(patch.targetAsset as TargetAssetReference) : undefined; changed = true; }
      if (patch.pinnedRefs !== undefined) { next.pinnedRefs = normalizeRefs(patch.pinnedRefs); changed = true; }
      if (patch.batch !== undefined) { next.batch = clone(patch.batch); changed = true; }
      if (patch.todoId !== undefined) { next.todoId = optionalText(patch.todoId); changed = true; }
      if (patch.featureId !== undefined) {
        if (next.gameCandidates?.length) throw new WorkflowError('conflict', '已有游戏候选的制作单不能更换功能项');
        next.featureId = optionalText(patch.featureId); changed = true;
      }
      if (!changed) return { production: clone(next), revision: next.revision };
      next.requirementRevision += 1;
      next.revision += 1;
      next.updatedAt = iso(now());
      touchProduction(store, next, "updated", { fields: Object.keys(patch), requirementChanged: true }, next.updatedAt);
      emit({ projectId, kind: "production", id, revision: next.revision });
      return { production: clone(next), revision: next.revision };
    });
  }

  async function recordGameCandidate(input: Record<string, unknown>): Promise<{ production: ProductionRecord; candidate: GameCandidateRecord }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const productionId = text(input.productionId, 'productionId');
      const current = store.getProduction(projectId, productionId);
      if (!current) throw new WorkflowError('not-found', `找不到制作请求：${productionId}`);
      checkRevision(current.revision, input.baseRevision, current);
      const candidate = clone(asRecord(input.candidate)) as unknown as GameCandidateRecord;
      if (candidate.projectId !== projectId || candidate.productionId !== productionId || !candidate.id || !candidate.featureId || !/^[0-9a-f]{40}$/.test(candidate.commit)) throw new WorkflowError('invalid-input', '候选身份或确切提交无效');
      const previous = current.gameCandidates?.find(item => item.id === candidate.id);
      if (previous) {
        if (stable(previous) !== stable(candidate)) throw new WorkflowError('conflict', '同一候选 ID 的内容已经变化');
        return { production: clone(current), candidate: clone(previous) };
      }
      const next = clone(current);
      next.gameCandidates = [...(next.gameCandidates ?? []), candidate];
      next.revision += 1;
      next.updatedAt = iso(now());
      touchProduction(store, next, 'game-candidate', { candidateId: candidate.id, featureId: candidate.featureId, commit: candidate.commit }, next.updatedAt);
      emit({ projectId, kind: 'production', id: productionId, revision: next.revision });
      return { production: clone(next), candidate: clone(candidate) };
    });
  }

  async function recordGameAdoption(input: Record<string, unknown>): Promise<{ production: ProductionRecord; candidate: GameCandidateRecord }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const productionId = text(input.productionId, 'productionId');
      const candidateId = text(input.candidateId, 'candidateId');
      const current = store.getProduction(projectId, productionId);
      if (!current) throw new WorkflowError('not-found', `找不到制作请求：${productionId}`);
      const prior = current.gameCandidates?.find(item => item.id === candidateId);
      if (!prior) throw new WorkflowError('not-found', `找不到游戏候选：${candidateId}`);
      const status = input.status;
      if (status !== 'adopted' && status !== 'undone') throw new WorkflowError('invalid-input', '采用状态无效');
      if (prior.status === status) return { production: clone(current), candidate: clone(prior) };
      if (status === 'undone' && prior.status !== 'adopted') throw new WorkflowError('conflict', '只能撤销已采用的候选');
      if (status === 'adopted' && prior.status !== 'candidate') throw new WorkflowError('conflict', '只能采用未采用的候选');
      const next = clone(current);
      const candidate = next.gameCandidates!.find(item => item.id === candidateId)!;
      candidate.status = status;
      candidate.updatedAt = iso(now());
      if (status === 'adopted') { candidate.adoptedAt = candidate.updatedAt; candidate.adoptionId = text(input.adoptionId, 'adoptionId'); }
      else candidate.undoneAt = candidate.updatedAt;
      next.revision += 1;
      next.updatedAt = candidate.updatedAt;
      touchProduction(store, next, status === 'adopted' ? 'game-adopted' : 'game-undone', { candidateId, adoptionId: candidate.adoptionId }, next.updatedAt);
      emit({ projectId, kind: 'production', id: productionId, revision: next.revision });
      return { production: clone(next), candidate: clone(candidate) };
    });
  }

  function productionRound(input: Record<string, unknown>, current: ProductionRecord): ProductionRound | undefined {
    const request = optionalText(input.requestId);
    if (request) return current.rounds.find(round => round.requestId === request);
    const round = input.round === undefined ? undefined : integer(input.round);
    if (round !== undefined) return current.rounds.find(item => item.round === round);
    return current.rounds.at(-1);
  }

  function requirementForRound(current: ProductionRecord): ProductionRequirementSnapshot {
    return {
      brief: current.brief,
      ...(current.targetAsset ? { targetAsset: clone(current.targetAsset) } : {}),
      pinnedRefs: clone(current.pinnedRefs),
      ...(current.batch !== undefined ? { batch: clone(current.batch) } : {}),
      ...(current.todoId ? { todoId: current.todoId } : {}),
      requirementRevision: current.requirementRevision,
    };
  }

  function outputDirectoryFor(projectId: string, productionId: string, round: number): string {
    const projectPart = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(options.dataRoot, "incoming", projectPart, digest(productionId).slice(0, 24), String(round));
  }

  function dispatchInput(production: ProductionRecord, round: ProductionRound): Record<string, unknown> {
    return {
      projectId: production.projectId,
      productionId: production.id,
      round: round.round,
      requestId: round.requestId,
      businessKey: round.businessKey,
      goal: round.requirement.brief,
      requirement: clone(round.requirement),
      requirementSnapshot: clone(round.requirement),
      scope: [...round.scope],
      ...(round.requirement.outputDirectory ? { outputDirectory: round.requirement.outputDirectory } : {}),
      ...(round.cwd ? { cwd: round.cwd } : {}),
      ...(production.todoId ? { todoId: production.todoId } : {}),
    };
  }

  function productionDispatchFingerprint(production: ProductionRecord, round: ProductionRound): string {
    return digest({ operation: "production", input: dispatchInput(production, round) });
  }

  async function reserveProduction(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return enqueue(async store => {
      const projectId = assertProject(input);
      const id = text(input.productionId ?? input.id, "productionId");
      const current = store.getProduction(projectId, id);
      if (!current) throw new WorkflowError("not-found", `找不到制作请求：${id}`);
      const previous = productionRound(input, current);
      if ((current.batch as { kind?: string } | undefined)?.kind === 'card-generation') throw new WorkflowError('invalid-input', '卡牌批次请使用分阶段工作流，插画由 Codex 回填');
      const isNewRound = input.newRound === true || (!previous && input.round !== undefined);
      if (previous && !isNewRound) {
        if (previous.requirement.outputDirectory) await mkdir(previous.requirement.outputDirectory, { recursive: true });
        const expectedRequest = requestId(input.requestId, previous.requestId);
        if (expectedRequest !== previous.requestId) throw new WorkflowError("invalid-input", "当前轮次 requestId 不一致");
        const fingerprint = productionDispatchFingerprint(current, previous);
        const prior = store.getRequest(projectId, previous.requestId);
        if (prior && prior.fingerprint !== fingerprint) throw new WorkflowRequestIdReuseError(undefined, { requestId: previous.requestId, previous: prior });
        return { production: clone(current), round: clone(previous), requestId: previous.requestId, businessKey: previous.businessKey, requirementSnapshot: clone(previous.requirement), scope: [...previous.scope], ...(previous.cwd ? { cwd: previous.cwd } : {}), input: dispatchInput(current, previous), submit: dispatchInput(current, previous), deduplicated: true };
      }
      const roundNumber = input.round === undefined ? (current.rounds.at(-1)?.round ?? 0) + 1 : integer(input.round);
      if (current.rounds.some(round => round.round === roundNumber)) throw new WorkflowError("already-exists", `制作轮次已存在：${roundNumber}`);
      const businessKey = text(input.businessKey ?? (current.rounds.at(-1)?.businessKey ?? `production:${projectId}:${id}`), "businessKey");
      const outputDirectory = outputDirectoryFor(projectId, id, roundNumber);
      const scope = [...new Set([...defaultScope(input.scope), outputDirectory])];
      const cwd = optionalText(input.cwd);
      const requirement = { ...requirementForRound(current), outputDirectory };
      const provisional = { projectId, productionId: id, round: roundNumber, businessKey, requirement, scope, cwd: cwd ?? null };
      const fallbackId = `production:${projectId}:${id}:round:${roundNumber}:${makeId()}`;
      const rid = requestId(input.requestId, fallbackId);
      const dispatchRevision = current.revision + 1;
      const fingerprint = productionDispatchFingerprint(current, { round: roundNumber, requestId: rid, businessKey, requirementRevision: current.requirementRevision, dispatchRevision, requirement, scope, ...(cwd ? { cwd } : {}), status: "reserved", createdAt: "", updatedAt: "" });
      const prior = store.getRequest(projectId, rid);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new WorkflowRequestIdReuseError(undefined, { requestId: rid, previous: prior });
        const existingRound = current.rounds.find(round => round.requestId === rid);
        if (existingRound) return { production: clone(current), round: clone(existingRound), requestId: rid, businessKey: existingRound.businessKey, requirementSnapshot: clone(existingRound.requirement), scope: [...existingRound.scope], ...(existingRound.cwd ? { cwd: existingRound.cwd } : {}), input: dispatchInput(current, existingRound), submit: dispatchInput(current, existingRound), deduplicated: true };
      }
      const at = iso(now());
      await mkdir(outputDirectory, { recursive: true });
      const round: ProductionRound = { round: roundNumber, requestId: rid, businessKey, requirementRevision: current.requirementRevision, dispatchRevision, requirement, scope, ...(cwd ? { cwd } : {}), status: "reserved", createdAt: at, updatedAt: at };
      const next = clone(current);
      next.rounds.push(round);
      next.status = "reserved";
      next.generation = { status: "reserved", requestId: rid, round: roundNumber, updatedAt: at };
      next.revision += 1;
      next.updatedAt = at;
      touchProduction(store, next, "round-reserved", { requestId: rid, round: roundNumber, businessKey }, at);
      store.putRequest({ projectId, requestId: rid, operation: "production", fingerprint, productionId: id, todoId: current.todoId, round: roundNumber, requirementRevision: current.requirementRevision, status: "reserved", payload: dispatchInput(next, round), createdAt: at, updatedAt: at });
      emit({ projectId, kind: "production", id, revision: next.revision });
      const inputValue = dispatchInput(next, round);
      return { production: clone(next), round: clone(round), requestId: rid, businessKey, requirementSnapshot: clone(requirement), scope: [...scope], ...(cwd ? { cwd } : {}), input: inputValue, submit: inputValue, deduplicated: false };
    });
  }

  async function bindProduction(input: Record<string, unknown>): Promise<{ production: ProductionRecord; revision: number }> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const id = text(input.productionId ?? input.id, "productionId");
      const current = store.getProduction(projectId, id);
      if (!current) throw new WorkflowError("not-found", `找不到制作请求：${id}`);
      const round = productionRound(input, current);
      if (!round) throw new WorkflowError("not-found", "找不到制作轮次");
      const receipt = input.receipt && typeof input.receipt === "object" ? asRecord(input.receipt) : input;
      const receiptStatus = optionalText(receipt.status) ?? "accepted";
      const taskStatus = taskStatusFromReceipt(receipt);
      const boundStatus = taskStatus && ["queued", "running", "failed", "needs-input", "stale"].includes(taskStatus)
        ? taskStatus
        : statusFromReceipt({ status: receiptStatus });
      const at = iso(now());
      const next = clone(current);
      const targetRound = next.rounds.find(item => item.requestId === round.requestId)!;
      targetRound.status = boundStatus as ProductionRound["status"];
      targetRound.updatedAt = at;
      const binding = executionBindingFromReceipt(receipt as unknown as Record<string, unknown>);
      next.execution = { ...(next.execution ?? {}), requestId: round.requestId, status: boundStatus, transportStatus: receiptStatus, ...binding };
      next.generation = { ...(next.generation ?? { status: targetRound.status, updatedAt: at }), status: boundStatus, requestId: round.requestId, round: targetRound.round, updatedAt: at };
      next.status = targetRound.status as ProductionStatus;
      next.revision += 1;
      next.updatedAt = at;
      touchProduction(store, next, "bound", { requestId: round.requestId, status: receiptStatus }, at);
      const prior = store.getRequest(projectId, round.requestId);
      if (prior) store.putRequest({ ...prior, status: receiptStatus, result: receipt.result, updatedAt: at });
      emit({ projectId, kind: "production", id, revision: next.revision });
      return { production: clone(next), revision: next.revision };
    });
  }

  async function productionResult(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const id = text(input.productionId ?? input.id, "productionId");
      const current = store.getProduction(projectId, id);
      if (!current) throw new WorkflowError("not-found", `找不到制作请求：${id}`);
      const rid = text(input.requestId, "requestId");
      const round = current.rounds.find(item => item.requestId === rid && (input.round === undefined || item.round === integer(input.round)));
      const prior = store.getRequest(projectId, rid);
      const resultStatus = optionalText(input.status ?? (input.result && typeof input.result === "object" ? (input.result as Record<string, unknown>).status : undefined)) ?? "completed";
      const resultPayload = input.result && typeof input.result === "object" && !Array.isArray(input.result) ? asRecord(input.result) : input;
      const candidatesValue = resultPayload.candidateRefs ?? resultPayload.candidates ?? resultPayload.assetCandidates;
      const candidateRefs = candidatesValue === undefined ? undefined : normalizeCandidates(candidatesValue, `${rid}:${round?.round ?? input.round ?? 0}`);
      const resultRevision = integer(input.revision ?? input.requirementRevision ?? input.requestRevision ?? prior?.requirementRevision ?? 0);
      const fingerprint = digest({ status: resultStatus, conclusion: resultPayload.conclusion, error: resultPayload.error, candidateRefs, raw: resultPayload });
      if (!round || (prior && prior.productionId !== id)) {
        if (prior) store.putRequest({ ...prior, status: "stale", result: resultPayload, updatedAt: iso(now()) });
        return { accepted: false, duplicate: false, stale: true, reason: "unknown-or-old-round", production: clone(current), requestId: rid, round: round?.round ?? prior?.round };
      }
      const newestRound = current.rounds.at(-1)!;
      if (round.round !== newestRound.round || ![round.requirementRevision, round.dispatchRevision].includes(resultRevision) || current.requirementRevision !== round.requirementRevision) {
        const at = iso(now());
        const next = clone(current);
        const target = next.rounds.find(item => item.requestId === rid)!;
        target.staleResultCount = (target.staleResultCount ?? 0) + 1;
        target.updatedAt = at;
        next.revision += 1;
        next.updatedAt = at;
        touchProduction(store, next, "stale-result", { requestId: rid, round: round.round, resultRevision, expectedRevision: round.requirementRevision }, at);
        store.putRequest({ ...(prior ?? { projectId, requestId: rid, operation: "production", fingerprint, productionId: id, round: round.round, status: "stale", createdAt: at }), fingerprint, status: "stale", result: resultPayload, updatedAt: at });
        emit({ projectId, kind: "production", id, revision: next.revision });
        return { accepted: false, duplicate: false, stale: true, reason: round.round !== newestRound.round ? "newer-round" : "requirement-changed", production: clone(next), requestId: rid, round: round.round };
      }
      // Only a result for the current round can be a duplicate.  An older
      // round with the same receipt must remain visibly stale after a new
      // round is reserved.
      if (round.resultFingerprint === fingerprint) return { accepted: false, duplicate: true, stale: false, production: clone(current), requestId: rid, round: round.round };
      const at = iso(now());
      const next = clone(current);
      const target = next.rounds.find(item => item.requestId === rid)!;
      const fact: ProductionResultFact = { status: resultStatus, ...(optionalText(resultPayload.conclusion) ? { conclusion: optionalText(resultPayload.conclusion) } : {}), ...(optionalText(resultPayload.error) ? { error: optionalText(resultPayload.error) } : {}), ...(candidateRefs ? { candidateRefs: clone(candidateRefs) } : {}), raw: clone(resultPayload), receivedAt: at, requestId: rid, round: target.round, revision: resultRevision };
      target.result = fact;
      target.resultFingerprint = fingerprint;
      target.status = resultStatus === "completed" ? "completed" : resultStatus as ProductionStatus;
      target.updatedAt = at;
      if (candidateRefs) next.candidateRefs = mergeCandidates(next.candidateRefs, candidateRefs);
      next.execution = next.execution ? { ...next.execution, status: resultStatus, resultAt: at } : next.execution;
      next.generation = { ...(next.generation ?? { status: target.status, updatedAt: at }), status: resultStatus, requestId: rid, round: target.round, updatedAt: at, resultAt: at, ...(optionalText(resultPayload.error) ? { error: optionalText(resultPayload.error) } : {}) };
      next.status = resultStatus === "completed" ? "completed" : resultStatus as ProductionStatus;
      next.revision += 1;
      next.updatedAt = at;
      touchProduction(store, next, "result-received", { requestId: rid, round: target.round, status: resultStatus }, at);
      if (prior) store.putRequest({ ...prior, status: resultStatus, result: resultPayload, updatedAt: at });
      else store.putRequest({ projectId, requestId: rid, operation: "production", fingerprint, productionId: id, todoId: current.todoId, round: target.round, requirementRevision: target.requirementRevision, status: resultStatus, result: resultPayload, createdAt: at, updatedAt: at });
      if (next.todoId) {
        const todo = store.getTodo(projectId, next.todoId);
        if (todo) {
          const todoNext = clone(todo);
          todoNext.productionId = id;
          todoNext.lastProductionResult = { productionId: id, requestId: rid, round: target.round, status: resultStatus, receivedAt: at };
          // Deliberately leave title, requirement and status untouched. A
          // generated result is evidence for a Todo, not completion of it.
          todoNext.revision += 1;
          todoNext.updatedAt = at;
          touchTodo(store, todoNext, "production-result", { productionId: id, requestId: rid, status: resultStatus }, at);
          emit({ projectId, kind: "todo", id: todoNext.id, revision: todoNext.revision });
        }
      }
      emit({ projectId, kind: "production", id, revision: next.revision });
      return { accepted: true, duplicate: false, stale: false, production: clone(next), requestId: rid, round: target.round, revision: next.revision };
    });
  }

  function mergeCandidates(existing: AssetCandidateReference[], incoming: AssetCandidateReference[]): AssetCandidateReference[] {
    const result = [...existing.map(clone)];
    for (const candidate of incoming) {
      const candidateKey = candidate.id ?? candidate.key ?? candidate.assetId;
      const index = result.findIndex(item => (item.id ?? item.key ?? item.assetId) === candidateKey);
      if (index < 0) result.push(clone(candidate));
      else result[index] = clone(candidate);
    }
    return result;
  }

  async function bindTodo(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const todoId = text(input.todoId ?? input.itemId, "todoId");
      const todo = store.getTodo(projectId, todoId);
      // A repair delivery binds directly to the Todo. Production binding is
      // the two-record form below; keeping both under one command lets note
      // actions finish a transport after the receipt is known.
      if (!input.productionId) {
        if (!todo) throw new WorkflowError("not-found", `找不到 Todo：${todoId}`);
        const receipt = input.receipt && typeof input.receipt === "object" ? asRecord(input.receipt) : undefined;
        if (!receipt) throw new WorkflowError("invalid-input", "bindTodo 需要 productionId 或 receipt");
        const status = optionalText(receipt.status) ?? "accepted";
        const at = iso(now());
        const next = clone(todo);
        next.delivery = next.delivery ? { ...next.delivery, status, updatedAt: at } : next.delivery;
        const binding = executionBindingFromReceipt(receipt as unknown as Record<string, unknown>);
        const taskStatus = taskStatusFromReceipt(receipt as unknown as Record<string, unknown>) ?? statusFromReceipt({ status });
        if (Object.keys(binding).length || taskStatus) next.execution = { ...(next.execution ?? {}), status: taskStatus, transportStatus: status, ...binding };
        if (optionalText(binding.taskId)) next.taskId = optionalText(binding.taskId);
        next.revision += 1;
        next.updatedAt = at;
        touchTodo(store, next, "delegated", { requestId: optionalText(input.requestId), status }, at);
        if (next.delivery) {
          const prior = store.getRequest(projectId, next.delivery.requestId);
          if (prior) store.putRequest({ ...prior, status, result: receipt.result, updatedAt: at });
        }
        emit({ projectId, kind: "todo", id: todoId, revision: next.revision });
        return { todo: clone(next), todoRevision: next.revision, receipt };
      }
      const productionId = text(input.productionId, "productionId");
      const production = store.getProduction(projectId, productionId);
      if (!todo) throw new WorkflowError("not-found", `找不到 Todo：${todoId}`);
      if (!production) throw new WorkflowError("not-found", `找不到制作请求：${productionId}`);
      if (input.todoBaseRevision !== undefined) checkRevision(todo.revision, input.todoBaseRevision, todo);
      if (input.productionBaseRevision !== undefined) checkRevision(production.revision, input.productionBaseRevision, production);
      const at = iso(now());
      const nextTodo = clone(todo);
      const nextProduction = clone(production);
      let todoChanged = nextTodo.productionId !== productionId;
      let productionChanged = nextProduction.todoId !== todoId;
      nextTodo.productionId = productionId;
      nextProduction.todoId = todoId;
      if (todoChanged) { nextTodo.revision += 1; nextTodo.updatedAt = at; touchTodo(store, nextTodo, "production-bound", { productionId }, at); }
      if (productionChanged) { nextProduction.revision += 1; nextProduction.updatedAt = at; touchProduction(store, nextProduction, "todo-bound", { todoId }, at); }
      if (todoChanged) emit({ projectId, kind: "todo", id: todoId, revision: nextTodo.revision });
      if (productionChanged) emit({ projectId, kind: "production", id: productionId, revision: nextProduction.revision });
      return { todo: clone(nextTodo), production: clone(nextProduction), todoRevision: nextTodo.revision, productionRevision: nextProduction.revision };
    });
  }

  async function registerCandidates(input: Record<string, unknown>, context?: WorkflowCommandContext): Promise<Record<string, unknown>> {
    const projectId = text(input.projectId, "projectId");
    assertProject(input);
    const suppliedReceipt = input.receipt && typeof input.receipt === "object" && !Array.isArray(input.receipt) ? input.receipt as WorkflowConnectionReceipt : undefined;
    if (suppliedReceipt && !connectionCompleted(suppliedReceipt)) throw new WorkflowError("delivery-pending", `候选登记尚未完成：${suppliedReceipt.status}`, suppliedReceipt);
    const productionId = text(input.productionId, "productionId");
    const candidates = normalizeCandidates(input.candidates ?? input.candidateRefs);
    const current = await enqueue(store => {
      const production = store.getProduction(projectId, productionId);
      if (!production) throw new WorkflowError("not-found", `找不到制作请求：${productionId}`);
      const round = productionRound(input, production);
      return { production, round };
    });
    const round = current.round;
    const rid = requestId(input.requestId, `asset-candidates:${projectId}:${productionId}:${round?.round ?? 0}:${digest(candidates).slice(0, 16)}`);
    // The asset backend owns candidate registration.  Keep the workflow
    // identity in our durable fact, but send that backend only its public
    // contract so it does not need to understand production rounds.
    const payload = { projectId, candidates: clone(candidates) };
    let external: unknown;
    if (suppliedReceipt) external = suppliedReceipt;
    else if (context?.assets?.registerCandidates) external = await context.assets.registerCandidates(payload);
    if (external && typeof external === "object" && !Array.isArray(external) && "status" in external && !connectionCompleted(external as WorkflowConnectionReceipt)) {
      throw new WorkflowError("delivery-pending", `候选登记尚未完成：${String((external as WorkflowConnectionReceipt).status)}`, external);
    }
    return enqueue(store => {
      const production = store.getProduction(projectId, productionId);
      if (!production) throw new WorkflowError("not-found", `找不到制作请求：${productionId}`);
      const at = iso(now());
      const next = clone(production);
      next.candidateRefs = mergeCandidates(next.candidateRefs, candidates);
      next.candidateRegistration = { status: "completed", requestId: rid, updatedAt: at };
      next.revision += 1;
      next.updatedAt = at;
      touchProduction(store, next, "candidates-registered", { requestId: rid, count: candidates.length }, at);
      emit({ projectId, kind: "production", id: productionId, revision: next.revision });
      return { production: clone(next), candidates: clone(candidates), requestId: rid, result: external };
    });
  }

  async function adoptAsset(input: Record<string, unknown>, context?: WorkflowCommandContext): Promise<Record<string, unknown>> {
    const projectId = text(input.projectId, "projectId");
    assertProject(input);
    const suppliedReceipt = input.receipt && typeof input.receipt === "object" && !Array.isArray(input.receipt) ? input.receipt as WorkflowConnectionReceipt : undefined;
    if (suppliedReceipt && !connectionCompleted(suppliedReceipt)) throw new WorkflowError("delivery-pending", `资源采用尚未完成：${suppliedReceipt.status}`, suppliedReceipt);
    const productionId = text(input.productionId, "productionId");
    const candidateId = text(input.candidateId ?? input.assetCandidateId, "candidateId");
    const production = await enqueue(store => {
      const item = store.getProduction(projectId, productionId);
      if (!item) throw new WorkflowError("not-found", `找不到制作请求：${productionId}`);
      const candidate = item.candidateRefs.find(value => (value.id ?? value.key ?? value.assetId) === candidateId);
      if (!candidate) throw new WorkflowError("not-found", `找不到候选：${candidateId}`);
      return { item, candidate };
    });
    const rid = requestId(input.requestId, `adopt-asset:${projectId}:${productionId}:${candidateId}`);
    const assetId = optionalText(input.assetId) ?? optionalText(production.candidate.assetId);
    const versionId = optionalText(input.versionId) ?? optionalText(production.candidate.versionId) ?? optionalText(production.candidate.version);
    // Adoption is an assets operation.  The production note records the
    // resulting fact below, while the assets connection receives its small,
    // stable payload only.
    const payload = {
      projectId,
      ...(assetId ? { assetId } : {}),
      candidateId,
      ...(versionId ? { versionId } : {}),
    };
    let external: unknown;
    if (suppliedReceipt) external = suppliedReceipt;
    else if (context?.assets?.adoptVersion) external = await context.assets.adoptVersion(payload);
    if (external && typeof external === "object" && !Array.isArray(external) && "status" in external && !connectionCompleted(external as WorkflowConnectionReceipt)) {
      throw new WorkflowError("delivery-pending", `资源采用尚未完成：${String((external as WorkflowConnectionReceipt).status)}`, external);
    }
    const externalRecord = external && typeof external === "object" && !Array.isArray(external) ? external as Record<string, unknown> : {};
    const externalResult = externalRecord.result && typeof externalRecord.result === "object" && !Array.isArray(externalRecord.result) ? externalRecord.result as Record<string, unknown> : externalRecord;
    const externalAsset = externalResult.asset && typeof externalResult.asset === "object" && !Array.isArray(externalResult.asset) ? externalResult.asset as Record<string, unknown> : {};
    const externalVersion = externalResult.version && typeof externalResult.version === "object" && !Array.isArray(externalResult.version) ? externalResult.version as Record<string, unknown> : {};
    const adoptedAssetId = optionalText(externalResult.assetId ?? externalAsset.id) ?? assetId;
    const adoptedVersionId = optionalText(externalResult.versionId ?? externalVersion.id) ?? versionId;
    return enqueue(store => {
      const current = store.getProduction(projectId, productionId);
      if (!current) throw new WorkflowError("not-found", `找不到制作请求：${productionId}`);
      const at = iso(now());
      const next = clone(current);
      next.adoption = { status: "adopted", candidateId, ...(adoptedAssetId ? { assetId: adoptedAssetId } : {}), ...(adoptedVersionId ? { version: adoptedVersionId } : {}), updatedAt: at, result: clone(external) };
      next.status = "adopted";
      next.revision += 1;
      next.updatedAt = at;
      touchProduction(store, next, "asset-adopted", { candidateId, requestId: rid }, at);
      emit({ projectId, kind: "production", id: productionId, revision: next.revision });
      return { production: clone(next), candidateId, requestId: rid, result: external };
    });
  }

  async function rejectCandidate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return enqueue(store => {
      const projectId = assertProject(input);
      const productionId = text(input.productionId, "productionId");
      const candidateId = text(input.candidateId ?? input.assetCandidateId, "candidateId");
      const reason = optionalText(input.reason);
      const production = store.getProduction(projectId, productionId);
      if (!production) throw new WorkflowError("not-found", `找不到制作请求：${productionId}`);
      checkRevision(production.revision, input.baseRevision, production);
      const rid = requestId(input.requestId, `reject-candidate:${projectId}:${productionId}:${candidateId}`);
      const fingerprint = digest({ operation: "reject-candidate", productionId, candidateId, reason: reason ?? "" });
      const prior = store.getRequest(projectId, rid);
      if (prior && prior.fingerprint !== fingerprint) throw new WorkflowRequestIdReuseError(undefined, { requestId: rid, previous: prior });
      if (prior?.todoId) return { todoId: prior.todoId, production: clone(production) };
      if (!production.candidateRefs.some(value => (value.id ?? value.key ?? value.assetId) === candidateId)) throw new WorkflowError("not-found", `找不到候选：${candidateId}`);
      const at = iso(now());
      const next = clone(production);
      const marked = next.candidateRefs.find(value => (value.id ?? value.key ?? value.assetId) === candidateId)!;
      marked.rejectedAt = at;
      if (reason) marked.rejectReason = reason;
      else delete marked.rejectReason;
      checkCapacity(store, projectId, "todo");
      const todoId = `todo-${makeId()}`;
      const assetId = optionalText(marked.assetId);
      const todo: TodoRecord = {
        projectId,
        id: todoId,
        title: `返修：${production.brief}`,
        description: [`候选 ${candidateId} 被否决`, ...(assetId ? [`关联资产 ${assetId}`] : []), ...(reason ? [`原因：${reason}`] : [])].join("；"),
        status: "todo",
        completed: false,
        priority: "high",
        category: "返修",
        productionId,
        context: { projectId, kind: "production", id: productionId },
        requirementRevision: 1,
        revision: 1,
        createdAt: at,
        updatedAt: at,
      };
      next.revision += 1;
      next.updatedAt = at;
      touchProduction(store, next, "candidate-rejected", { candidateId, todoId, requestId: rid }, at);
      touchTodo(store, todo, "created", { title: todo.title, productionId, candidateId }, at);
      store.putRequest({ projectId, requestId: rid, operation: "reject-candidate", fingerprint, productionId, todoId, status: "completed", createdAt: prior?.createdAt ?? at, updatedAt: at });
      emit({ projectId, kind: "production", id: productionId, revision: next.revision });
      emit({ projectId, kind: "todo", id: todoId, revision: todo.revision });
      return { todoId, production: clone(next) };
    });
  }

  async function query(input: Record<string, unknown>, context?: WorkflowQueryContext): Promise<unknown> {
    const store = await ready;
    if (closed) throw new WorkflowError("closed", "工作流服务已关闭");
    const op = text(input.op ?? input.name ?? input.query, "query");
    const projectId = assertProject(input);
    if (op === "todos") {
      return store.listTodosPage(projectId, input);
    }
    if (op === "todo") {
      const id = text(input.id ?? input.itemId, "id");
      const item = store.getTodo(projectId, id);
      if (!item) throw new WorkflowError("not-found", `找不到 Todo：${id}`);
      const history = store.listHistoryPage(projectId, "todo", id, input);
      const execution = context?.execution && item.execution ? await context.execution(clone(item.execution)) : undefined;
      return { item: clone(item), history: history.items, ...(history.nextCursor ? { nextCursor: history.nextCursor } : {}), historyLimit: history.limit, ...(execution !== undefined ? { execution } : {}) };
    }
    if (op === "productions") {
      return store.listProductionsPage(projectId, input);
    }
    if (op === "production") {
      const id = text(input.id ?? input.productionId, "productionId");
      const production = store.getProduction(projectId, id);
      if (!production) throw new WorkflowError("not-found", `找不到制作请求：${id}`);
      const history = store.listHistoryPage(projectId, "production", id, input);
      const execution = context?.execution && production.execution ? await context.execution(clone(production.execution)) : undefined;
      return { production: clone(production), history: history.items, ...(history.nextCursor ? { nextCursor: history.nextCursor } : {}), historyLimit: history.limit, ...(execution !== undefined ? { execution } : {}) };
    }
    if (op === 'gameCandidates') {
      const featureId = optionalText(input.featureId);
      const candidates = store.listProductions(projectId).flatMap(item => item.gameCandidates ?? [])
        .filter(item => !featureId || item.featureId === featureId);
      return { projectId, items: candidates.map(clone), total: candidates.length };
    }
    if (op === "workflowStatus") {
      const counts = {
        todos: store.countTodos(projectId),
        todo: store.countTodosByStatus(projectId, "todo"),
        inProgress: store.countTodosByStatus(projectId, "in_progress"),
        done: store.countTodosByStatus(projectId, "done"),
        blocked: store.countTodosByStatus(projectId, "blocked"),
        productions: store.countProductions(projectId),
        productionDrafts: store.countProductionsByStatus(projectId, "draft"),
        productionRunning: store.countProductionsByStatus(projectId, "reserved") + store.countProductionsByStatus(projectId, "queued") + store.countProductionsByStatus(projectId, "running"),
        productionCompleted: store.countProductionsByStatus(projectId, "completed") + store.countProductionsByStatus(projectId, "adopted"),
      };
      return { projectId, project: projects.get(projectId), counts, scaleTargets: { ...WORKFLOW_SCALE_TARGETS }, limits: { pageSize: WORKFLOW_PAGE_SIZE }, generationCapability: "unknown" };
    }
    throw new WorkflowError("unknown-query", `未知工作流查询：${op}`);
  }

  async function command(method: string, input: Record<string, unknown>, context?: WorkflowCommandContext): Promise<unknown> {
    if (typeof method !== "string" || !method.trim()) throw new WorkflowError("invalid-input", "command method 不能为空");
    const name = method.trim();
    switch (name) {
      case "createTodo": return createTodo(input);
      case "updateTodo": return updateTodo(input);
      case "deleteTodo": return deleteTodo(input);
      case "todoFeedback":
      case "feedback": return todoFeedback(input);
      case "importTodos": return importTodos(input);
      case "importProductions": return importProductions(input);
      case "delegateTodo": return delegateTodo(input);
      case "upsertProduction":
      case "createProduction": return upsertProduction(input);
      case "updateProduction": return updateProduction(input);
      case "reserveProduction": return reserveProduction(input);
      case "bindProduction": return bindProduction(input);
      case "productionResult":
      case "receiveResult": return productionResult(input);
      case "bindTodo": return bindTodo(input);
      case "recordCandidates":
      case "registerCandidates": return registerCandidates(input, context);
      case "recordAdoption":
      case "adoptAsset": return adoptAsset(input, context);
      case "rejectCandidate": return rejectCandidate(input);
      case 'recordGameCandidate': return recordGameCandidate(input);
      case 'recordGameAdoption': return recordGameAdoption(input);
      default: throw new WorkflowError("unknown-command", `未知工作流命令：${name}`);
    }
  }

  return {
    query,
    command,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async close() {
      if (closed) return;
      await queue;
      closed = true;
      const store = await ready;
      await store.close();
      listeners.clear();
    },
  };
}

/** Resource adapter used by the host's `extension.cardgame-content.query`. */
export function createWorkflowQueryResource(service: WorkflowService) {
  return {
    version: String(WORKFLOW_SCHEMA_VERSION),
    async load(input: Record<string, unknown>) { return service.query(input); },
  };
}

/** Host extension adapter; connection and execution context stay host-owned. */
export function createWorkflowExtension(service: WorkflowService) {
  return {
    resources: { query: createWorkflowQueryResource(service) },
    async invoke(method: string, input: Record<string, unknown>, context?: WorkflowCommandContext) {
      return service.command(method, input, context);
    },
    async close() { await service.close(); },
  };
}
