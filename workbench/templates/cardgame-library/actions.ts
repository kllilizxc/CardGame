import { defineAction, defineQuery, z, noteConfigRef } from "@dsh-workbench/runtime";
import type { ActionContext, JsonValue, QueryContext } from "@dsh-workbench/runtime";

import { encodeContentRef } from "./model";
import type {
  CardGameConfig,
  CardData,
  ContentList,
  DocumentData,
  DocumentMeta,
  GraphData,
  MediaData,
  MovePreviewData,
  ReferenceResource,
  StatusData,
} from "./model";

export type {
  AssetData,
  AssetFilters,
  AssetItem,
  BacklinkItem,
  CardData,
  CardItem,
  CardGameConfig,
  CardGameNotes,
  ContentKind,
  ContentList,
  ContentRef,
  DirectoryItem,
  DocumentData,
  DocumentMeta,
  DocumentItem,
  GraphData,
  LibraryItem,
  LibraryMode,
  LibraryState,
  MediaData,
  MovePreviewData,
  RecentChangeItem,
  RecentChangesData,
  ReferenceResource,
  StatusData,
  VersionItem,
} from "./model";

const recordSchema = z.record(z.string(), z.unknown());
const libraryItemSchema = z.looseObject({ id: z.string(), title: z.string().optional(), name: z.string().optional(), path: z.string().optional(), revision: z.string().optional() });
const contentListSchema = z.looseObject({ items: z.array(libraryItemSchema), nextCursor: z.string().nullable().optional(), total: z.number().optional() });
const documentSchema = libraryItemSchema.extend({ title: z.string(), path: z.string(), content: z.string(), format: z.string().optional() });
const cardSchema = libraryItemSchema.extend({ name: z.string(), kind: z.string().optional(), rarity: z.string().optional(), labels: z.array(z.string()).optional(), cost: z.union([z.number(), z.string()]).optional(), sourcePath: z.string().optional(), cardRevision: z.string().optional(), facePreview: z.string().optional(), json: recordSchema.optional(), raw: z.unknown().optional(), definition: z.unknown().optional(), content: z.string().optional() });
const assetSchema = libraryItemSchema.extend({ kind: z.string().optional(), mimeType: z.string().optional(), width: z.number().optional(), height: z.number().optional(), durationMs: z.number().optional(), frameCount: z.number().optional(), format: z.string().optional(), tags: z.array(z.string()).optional(), versionId: z.string().optional(), currentVersionId: z.string().optional(), sourcePath: z.string().optional(), status: z.string().optional(), metadataRevision: z.string().optional(), metadata: recordSchema.optional(), description: z.string().optional(), currentVersion: recordSchema.optional() });
const mediaSchema = z.looseObject({ path: z.string().optional(), url: z.string().optional(), src: z.string().optional(), data: z.string().optional(), mimeType: z.string().optional(), revision: z.string().optional(), width: z.number().optional(), height: z.number().optional(), durationMs: z.number().optional(), frameCount: z.number().optional(), frameWidth: z.number().optional(), frameHeight: z.number().optional(), columns: z.number().optional(), rows: z.number().optional() });
const movePreviewSchema = z.looseObject({ source: z.union([z.string(), documentSchema]).optional(), target: z.string().optional(), toPath: z.string().optional(), affected: z.array(libraryItemSchema.extend({ from: z.string().optional(), to: z.string().optional(), kind: z.string().optional(), changedLinks: z.number().optional(), changed: z.boolean().optional() })).optional(), errors: z.array(z.string()).optional(), conflicts: z.array(z.string()).optional(), canApply: z.boolean().optional() });
const graphSchema = z.looseObject({ nodes: z.array(libraryItemSchema.extend({ kind: z.enum(['document', 'card', 'asset', 'production', 'todo', 'preview']).optional(), type: z.enum(['document', 'card', 'asset', 'production', 'todo', 'preview']).optional() })).optional(), edges: z.array(z.looseObject({ source: z.string().optional(), target: z.string().optional(), sourceId: z.string().optional(), targetId: z.string().optional(), sourcePath: z.string().optional(), targetPath: z.string().optional(), label: z.string().optional() })).optional(), truncated: z.boolean().optional() });
const statusSchema = z.looseObject({ projectId: z.string().optional(), ready: z.boolean().optional(), indexedAt: z.string().optional(), documents: z.number().optional(), cards: z.number().optional(), assets: z.number().optional(), error: z.string().optional() });
// Additional connector-specific filters remain intact for the backend.
const queryInputSchema = z.looseObject({ projectId: z.string().optional(), id: z.string().optional(), path: z.string().optional(), query: z.string().optional(), q: z.string().optional(), limit: z.number().optional(), cursor: z.string().optional(), parentPath: z.string().optional(), directory: z.string().optional(), targetPath: z.string().optional(), toPath: z.string().optional(), resourcePath: z.string().optional(), from: z.string().optional(), assetId: z.string().optional(), kind: z.string().optional(), format: z.string().optional(), mimeType: z.string().optional(), minWidth: z.number().optional(), maxWidth: z.number().optional(), minDurationMs: z.number().optional(), maxDurationMs: z.number().optional(), status: z.string().optional(), rarity: z.string().optional(), tags: z.union([z.string(), z.array(z.string())]).optional(), labels: z.union([z.string(), z.array(z.string())]).optional(), depth: z.number().optional(), maxNodes: z.number().optional(), kinds: z.array(z.string()).optional(), since: z.string().optional(), offset: z.number().optional(), versionId: z.string().optional(), variant: z.string().optional(), freshKind: z.string().optional() }).default({});
const candidateSchema = z.looseObject({ id: z.string().optional(), name: z.string().optional(), fileName: z.string().optional(), mimeType: z.string().optional(), data: z.string().optional(), base64: z.string().optional(), sourcePath: z.string().optional(), metadata: recordSchema.optional() });
const stagedDocumentSchema = z.object({ path: z.string(), content: z.string(), expectedRevision: z.string().nullable().optional() });
const candidateResultSchema = z.looseObject({ candidate: recordSchema, production: recordSchema, reused: z.boolean().optional() });

type QueryInput = z.infer<typeof queryInputSchema>;
type CommandInput = Record<string, unknown>;

/** Read the current instance config; the project ID is never inferred from content rows. */
async function projectFor(ctx: QueryContext | ActionContext, input: Record<string, unknown> = {}): Promise<string> {
  const config = await ctx.store.read<Partial<CardGameConfig>>(noteConfigRef(ctx.note.id));
  const configured = typeof config.value?.projectId === "string" ? config.value.projectId.trim() : "";
  const supplied = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const projectId = configured || supplied;
  if (!projectId) throw new Error("CardGame 便笺尚未配置 projectId");
  return projectId;
}

/**
 * All display reads go through the single content extension query resource.
 * `snapshot.data` is the backend payload; the snapshot envelope is never exposed.
 */
async function readOp<T>(op: string, rawInput: unknown, ctx: QueryContext): Promise<T> {
  const input = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
    ? rawInput as QueryInput
    : {};
  const projectId = await projectFor(ctx, input);
  const { query, targetPath, parentPath, id, limit, ...rest } = input;
  const normalized: Record<string, unknown> = {
    ...rest,
    ...(query !== undefined && rest.q === undefined ? { q: query } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(op === "directories" && parentPath !== undefined && rest.directory === undefined ? { directory: parentPath } : {}),
    ...(op === "movePreview" && targetPath !== undefined && rest.toPath === undefined ? { toPath: targetPath } : {}),
    ...(op === "graph" && limit !== undefined && rest.maxNodes === undefined ? { maxNodes: limit } : {}),
    ...(op === "versions" && id !== undefined && rest.assetId === undefined ? { assetId: id } : {}),
    ...(op !== "versions" && id !== undefined ? { id } : {}),
    projectId,
    op,
  };
  const resourceInput = normalized as unknown as JsonValue;
  const snapshot = await ctx.resources.read<T>({ name: "extension.cardgame-content.query", input: resourceInput });
  if (snapshot.error && snapshot.data === undefined) throw new Error(snapshot.error);
  if (snapshot.data === undefined) throw new Error(`CardGame 内容查询 ${op} 没有返回数据`);
  return snapshot.data;
}

export const queries = {
  featureChoices: defineQuery({
    description: "内部查询：featureChoices。",
    input: queryInputSchema,
    output: z.object({ items: z.array(z.object({ id: z.string(), title: z.string() })) }),
    visibility: 'private',
  }, async (_input, ctx) => {
    const owner = await ctx.notes.read(ctx.note.id);
    const notes = await ctx.notes.lookup({ desktopId: owner.desktopId });
    const trackers = notes.filter(note => !note.archived && note.actions?.includes('setArchiveStatus') && note.actions?.includes('confirmGameCandidate'));
    if (trackers.length !== 1) throw new Error(trackers.length ? '本桌面有多个功能进展便笺，请先确定使用哪一个' : '本桌面没有可用的功能进展便笺');
    const snapshot = await ctx.resources.read<any>({ name: 'extension.official-feature-tracker.state', input: { targetNoteId: trackers[0]!.id } });
    if (snapshot.error && snapshot.data === undefined) throw new Error(snapshot.error);
    return { items: Array.isArray(snapshot.data?.features) ? snapshot.data.features.filter((item: any) => !item.archived).map((item: any) => ({ id: String(item.id), title: String(item.title) })) : [] };
  }),
  status: defineQuery({
    description: "内部查询：status。",
    input: queryInputSchema,
    output: statusSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<StatusData>("status", input, ctx);
  }),
  documents: defineQuery({
    description: "内部查询：documents。",
    input: queryInputSchema,
    output: contentListSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<ContentList>("documents", input, ctx);
  }),
  directories: defineQuery({
    description: "内部查询：directories。",
    input: queryInputSchema,
    output: contentListSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<ContentList>("directories", input, ctx);
  }),
  document: defineQuery({
    description: "按 ID 或登记路径读取一份知识文档的当前内容与版本。",
    input: queryInputSchema,
    output: documentSchema,
  }, async (input, ctx) => {
    // Keep the pre-CardGame registered-reference reader compatible for design
    // notes and memory files that remain in the instance config after upgrade.
    if (typeof input.resourcePath === "string") return readReferenceDocument(input, ctx) as Promise<DocumentData>;
    return readOp<DocumentData>("document", input, ctx);
  }),
  documentMeta: defineQuery({
    description: "内部查询：documentMeta。",
    input: queryInputSchema,
    output: z.looseObject({ id: z.string(), path: z.string(), title: z.string(), revision: z.string(), size: z.number(), isScene: z.boolean() }),
    visibility: 'private',
  }, async (input, ctx) => {
    return { ...await readOp<DocumentMeta>("documentMeta", input, ctx) };
  }),
  referenceDocument: defineQuery({
    description: "内部查询：referenceDocument。",
    input: queryInputSchema,
    output: documentSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readReferenceDocument(input, ctx) as Promise<DocumentData>;
  }),
  backlinks: defineQuery({
    description: "内部查询：backlinks。",
    input: queryInputSchema,
    output: contentListSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<ContentList>("backlinks", input, ctx);
  }),
  graph: defineQuery({
    description: "内部查询：graph。",
    input: queryInputSchema,
    output: graphSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<z.infer<typeof graphSchema>>("graph", input, ctx);
  }),
  movePreview: defineQuery({
    description: "内部查询：movePreview。",
    input: queryInputSchema,
    output: movePreviewSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<MovePreviewData>("movePreview", input, ctx);
  }),
  cards: defineQuery({
    description: "内部查询：cards。",
    input: queryInputSchema,
    output: contentListSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<ContentList>("cards", input, ctx);
  }),
  card: defineQuery({
    description: "按稳定卡牌 ID 读取定义和源文件版本。",
    input: queryInputSchema,
    output: cardSchema,
  }, async (input, ctx) => {
    return readOp<CardData>("card", input, ctx);
  }),
  assets: defineQuery({
    description: "分页查找资源库内的素材。",
    input: queryInputSchema,
    output: contentListSchema,
  }, async (input, ctx) => {
    return readOp<ContentList>("assets", input, ctx);
  }),
  asset: defineQuery({
    description: "按资源 ID 读取当前素材及采用版本。",
    input: queryInputSchema,
    output: assetSchema,
  }, async (input, ctx) => {
    return readOp<z.infer<typeof assetSchema>>("asset", input, ctx);
  }),
  versions: defineQuery({
    description: "按资源 ID 读取候选与历史版本。",
    input: queryInputSchema,
    output: contentListSchema,
  }, async (input, ctx) => {
    return readOp<ContentList>("versions", input, ctx);
  }),
  inspection: defineQuery({
    description: "内部查询：inspection。",
    input: queryInputSchema,
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<Record<string, unknown>>("inspection", input, ctx);
  }),
  recentChanges: defineQuery({
    description: "内部查询：recentChanges。",
    input: queryInputSchema,
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<Record<string, unknown>>("recentChanges", input, ctx);
  }),
  storyBuilds: defineQuery({
    description: "内部查询：storyBuilds。",
    input: queryInputSchema,
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<Record<string, unknown>>("storyBuilds", input, ctx);
  }),
  storyScenePage: defineQuery({
    description: "内部查询：storyScenePage。",
    input: queryInputSchema,
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<Record<string, unknown>>("storyScenePage", input, ctx);
  }),
  media: defineQuery({
    description: "内部查询：media。",
    input: queryInputSchema,
    output: mediaSchema,
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<MediaData>("media", input, ctx);
  }),
};

async function readReferenceDocument(input: QueryInput, ctx: QueryContext): Promise<Record<string, unknown>> {
  const resourceInput = { ...input } as unknown as JsonValue;
  const snapshot = await ctx.resources.read<Record<string, unknown>>({ name: "extension.reference.file", input: resourceInput });
  if (snapshot.error && snapshot.data === undefined) throw new Error(snapshot.error);
  if (!snapshot.data) throw new Error("注册资料没有返回内容");
  return snapshot.data;
}

async function requestContent(method: string, rawInput: CommandInput, ctx: ActionContext, required: string[] = []) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const projectId = await projectFor(ctx, input);
  for (const field of required) {
    const value = input[field];
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${method} 缺少 ${field}`);
  }
  return ctx.extensions.request("cardgame-content", method, { ...input, projectId });
}

/** Save one Markdown document using the backend revision for compare-and-save. */
export const saveDocument = defineAction({
  description: "内部操作：saveDocument。",
  input: z.object({ projectId: z.string().optional(), id: z.string().optional(), path: z.string().optional(), revision: z.string().optional(), expectedRevision: z.string().optional(), content: z.string(), title: z.string().optional() }),
  output: documentSchema,
  visibility: 'private',
}, async (input, ctx) => {
  if (typeof input?.content !== "string") throw new Error("saveDocument 需要 content");
  const { revision, ...rest } = input;
  return requestContent("saveDocument", { ...rest, ...(rest.expectedRevision === undefined && revision !== undefined ? { expectedRevision: revision } : {}) }, ctx);
});

/** Previewed document moves are applied by the backend as one link-aware operation. */
export const moveDocument = defineAction({
  description: "内部操作：moveDocument。",
  input: z.object({ projectId: z.string().optional(), id: z.string().optional(), path: z.string().optional(), revision: z.string().optional(), expectedRevision: z.string().optional(), from: z.string().optional(), to: z.string().optional(), targetPath: z.string().optional(), toPath: z.string().optional(), expectedRevisions: z.record(z.string(), z.string()).optional(), updateLinks: z.boolean().optional() }),
  output: movePreviewSchema,
  visibility: 'private',
}, async (input, ctx) => {
  const { from, to, targetPath, revision, ...rest } = input;
  return requestContent("moveDocument", {
    ...rest,
    ...(rest.path === undefined && typeof from === "string" ? { path: from } : {}),
    ...(rest.toPath === undefined && typeof (to ?? targetPath) === "string" ? { toPath: to ?? targetPath } : {}),
    ...(rest.expectedRevision === undefined && revision !== undefined ? { expectedRevision: revision } : {}),
    updateLinks: rest.updateLinks ?? true,
  }, ctx);
});

/** Update a card definition; the backend enforces the supplied revision/CAS token. */
export const updateCard = defineAction({
  description: "内部操作：updateCard。",
  input: z.object({ projectId: z.string().optional(), revision: z.string().optional(), expectedRevision: z.string().optional(), id: z.string(), value: recordSchema.optional(), definition: recordSchema.optional(), card: recordSchema.optional(), patch: recordSchema.optional() }),
  output: cardSchema,
  visibility: 'private',
}, async (input, ctx) => {
  const { value, definition, revision, ...rest } = input;
  return requestContent("updateCard", {
    ...rest,
    ...(rest.card === undefined && (value !== undefined || definition !== undefined) ? { card: value ?? definition } : {}),
    ...(rest.expectedRevision === undefined && revision !== undefined ? { expectedRevision: revision } : {}),
  }, ctx, ["id"]);
});

/** Update only asset metadata; media bytes and version revisions remain backend-owned. */
export const updateAsset = defineAction({
  description: "内部操作：updateAsset。",
  input: z.object({ projectId: z.string().optional(), id: z.string(), name: z.string().optional(), tags: z.array(z.string()).optional(), metadataRevision: z.string().optional(), expectedMetadataRevision: z.string().optional() }),
  output: assetSchema,
  visibility: 'private',
}, async (input, ctx) => {
  const { metadataRevision, ...rest } = input;
  return requestContent("updateAsset", {
    ...rest,
    ...(rest.expectedMetadataRevision === undefined && metadataRevision !== undefined ? { expectedMetadataRevision: metadataRevision } : {}),
  }, ctx, ["id"]);
});

/** Register generated asset candidates without copying candidate payload into note state. */
export const registerCandidates = defineAction({
  description: "将明确的制作产物登记为未采用的资源候选版本。",
  input: z.looseObject({ projectId: z.string().optional(), candidates: z.array(candidateSchema), autoAdopt: z.object({ path: z.string().optional(), assetId: z.string().optional(), metadata: recordSchema.optional() }).optional() }),
  output: z.array(recordSchema),
  receipt: "queryable",
}, async (input, ctx) => {
  return requestContent("registerCandidates", input, ctx);
});

/** Adopt one asset version after the backend has validated its provenance. */
export const adoptVersion = defineAction({
  description: "按候选身份采用明确版本，返回实际资源和版本 ID。",
  input: z.looseObject({ projectId: z.string().optional(), revision: z.string().optional(), candidateId: z.string().optional(), versionId: z.string().optional(), assetId: z.string().optional(), path: z.string().optional(), fileName: z.string().optional(), metadata: recordSchema.optional() }),
  output: assetSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  const { revision: _revision, ...rest } = input;
  return requestContent("adoptVersion", rest, ctx);
});

/**
 * Compile the scene graph reachable from one entry document into the game's
 * StoryState JSON. Diagnostics come back in the result; error diagnostics mean
 * nothing was written.
 */
export const compileStory = defineAction({
  description: "内部操作：compileStory。",
  input: z.object({ projectId: z.string().optional(), entry: z.string(), storyId: z.string().optional(), dryRun: z.boolean().optional() }),
  output: z.looseObject({ storyId: z.string(), outputPath: z.string(), catalogUpdated: z.boolean(), nodeCount: z.number(), choiceCount: z.number(), diagnostics: z.array(z.object({ severity: z.enum(['error', 'warning']), path: z.string(), line: z.number().optional(), detail: z.string() })) }),
  visibility: 'private',
}, async (input, ctx) => {
  return requestContent("compileStory", input, ctx, ["entry"]);
});

/** Compile supplied Markdown in an isolated playable game candidate. */
export const stageStoryCandidate = defineAction({
  description: "内部操作：stageStoryCandidate。",
  input: z.looseObject({ projectId: z.string().optional(), featureId: z.string(), storyId: z.string(), entryPath: z.string(), brief: z.string(), documents: z.array(stagedDocumentSchema), referenceDocuments: z.array(stagedDocumentSchema).optional(), assets: z.array(z.object({ candidateId: z.string(), path: z.string() })).optional(), npcs: z.array(recordSchema).optional(), items: z.array(recordSchema).optional(), shops: z.array(recordSchema).optional(), recipes: z.array(recordSchema).optional(), quests: z.array(recordSchema).optional(), copyEdits: z.array(recordSchema).optional(), launch: z.object({ hubPath: z.string(), locationId: z.string(), actionId: z.string(), label: z.string() }).optional() }),
  output: candidateResultSchema,
  visibility: 'private',
}, async (input, ctx) => {
  const projectId = await projectFor(ctx, input);
  return ctx.extensions.request('cardgame-content', 'stageStoryCandidate', { ...input, projectId });
});

/** Stage ordinary Markdown documents without binding them to a playable story. */
export const stageDocumentsCandidate = defineAction({
  description: "内部操作：stageDocumentsCandidate。",
  input: z.object({ projectId: z.string().optional(), featureId: z.string(), brief: z.string(), documents: z.array(stagedDocumentSchema) }),
  output: candidateResultSchema,
  visibility: 'private',
}, async (input, ctx) => {
  const projectId = await projectFor(ctx, input);
  return ctx.extensions.request('cardgame-content', 'stageDocumentsCandidate', { ...input, projectId });
});

/**
 * Reject the current asset version. When an earlier adopted version exists the
 * asset is reverted to it; either way a high-priority rework Todo is opened
 * with a deep link back to the asset.
 */
export const rejectAssetVersion = defineAction({
  description: "内部操作：rejectAssetVersion。",
  input: z.object({ assetId: z.string(), reason: z.string().optional() }),
  output: z.object({ reverted: z.boolean(), versionId: z.string().optional(), todoId: z.string().optional() }),
  visibility: 'private',
}, async (input, ctx) => {
  if (typeof input?.assetId !== "string" || !input.assetId.trim()) throw new Error("rejectAssetVersion 需要 assetId");
  const projectId = await projectFor(ctx, input as Record<string, unknown>);
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : undefined;
  const asset = await readOp<Record<string, unknown>>("asset", { id: input.assetId }, ctx as unknown as QueryContext);
  const currentVersionId = typeof asset.currentVersionId === "string" ? asset.currentVersionId : typeof asset.versionId === "string" ? asset.versionId : undefined;
  const versions = await readOp<ContentList>("versions", { id: input.assetId, limit: 100 }, ctx as unknown as QueryContext);
  const previous = versions.items
    .filter(version => Boolean(version.adopted) && (version.versionId ?? version.id) !== currentVersionId)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
  const previousVersionId = previous ? String(previous.versionId ?? previous.id) : undefined;
  if (previousVersionId) await requestContent("adoptVersion", { assetId: input.assetId, versionId: previousVersionId }, ctx);
  const assetName = [asset.name, asset.title].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const todo = await requestContent("createTodo", {
    title: `返修：${assetName ?? input.assetId}`,
    description: [`资源 ${input.assetId} 当前版本${currentVersionId ? ` ${currentVersionId}` : ""} 被否决`, previousVersionId ? `已回退到版本 ${previousVersionId}` : "没有可回退的历史版本，未回退", ...(reason ? [`原因：${reason}`] : [])].join("；"),
    priority: "high",
    category: "返修",
    context: { projectId, kind: "asset", id: input.assetId },
  }, ctx);
  const todoRecord = todo && typeof todo === "object" && !Array.isArray(todo) ? (todo as Record<string, unknown>).item : undefined;
  const todoId = todoRecord && typeof todoRecord === "object" && typeof (todoRecord as Record<string, unknown>).id === "string" ? (todoRecord as Record<string, unknown>).id as string : undefined;
  return { reverted: Boolean(previousVersionId), ...(previousVersionId ? { versionId: previousVersionId } : {}), todoId };
});

export const createCardWorkflow = defineAction({
  description: "内部操作：createCardWorkflow。",
  input: z.object({ itemIds: z.array(z.string()), featureId: z.string(), draft: z.record(z.string(), z.unknown()).optional(), expectedRevision: z.string().optional(), requestId: z.string().optional() }),
  output: z.object({ noteId: z.string(), itemId: z.string() }),
  visibility: 'private',
}, async (input, ctx) => {
  const config = await ctx.store.read<Partial<CardGameConfig>>(noteConfigRef(ctx.note.id));
  const projectId = await projectFor(ctx, input);
  const noteId = config.value?.notes?.production;
  if (!noteId) throw new Error('尚未关联卡牌制作便笺');
  if (!input.itemIds?.length) throw new Error('请先选中卡牌');
  if (!input.featureId?.trim()) throw new Error('请先选择所属功能');
  if (input.draft && input.itemIds.length !== 1) throw new Error('原始数据编辑只能针对一张卡');
  let draftDefinition: Record<string, unknown> | undefined;
  let draftPresentation: Record<string, unknown> | undefined;
  if (input.draft) {
    const source = await readOp<CardData>('card', { id: input.itemIds[0] }, ctx as unknown as QueryContext);
    const originalFace = ((source.json ?? source.definition ?? source) as Record<string, any>).cardFace;
    const requestedFace = input.draft.cardFace as Record<string, any> | undefined;
    const { themeId: oldTheme, ...originalStructure } = originalFace ?? {};
    const { themeId: nextTheme, ...requestedStructure } = requestedFace ?? {};
    const stable = (value: any): string => value && typeof value === 'object'
      ? Array.isArray(value) ? `[${value.map(stable).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    if (stable(originalStructure) !== stable(requestedStructure)) throw new Error('卡面资源与布局请在制作单中修改');
    const { cardFace: _cardFace, ...definition } = input.draft;
    draftDefinition = definition;
    if (typeof nextTheme === 'string' && nextTheme !== oldTheme) draftPresentation = { themeId: nextTheme };
  }
  const result = await ctx.extensions.request('cardgame-content', 'createCardBatch', { projectId, cardIds: input.itemIds, featureId: input.featureId, ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.expectedRevision ? { sourceRevisions: { [input.itemIds[0]!]: input.expectedRevision } } : {}), brief: `卡面制作 · ${input.itemIds.join('、')}` }) as any;
  if (draftDefinition) {
    await ctx.extensions.request('cardgame-content', 'saveCardDraft', { projectId, productionId: result.production.id,
      cardId: input.itemIds[0], baseRevision: result.production.revision, definition: draftDefinition,
      ...(draftPresentation ? { presentation: draftPresentation } : {}) });
  }
  return { noteId, itemId: encodeContentRef({ projectId, kind: 'production', id: result.production.id }) };
});

export const switchCardTheme = defineAction({
  description: "内部操作：switchCardTheme。",
  input: z.object({ id: z.string(), themeId: z.string(), expectedRevision: z.string() }),
  output: cardSchema,
  visibility: 'private',
}, async (input, ctx) => {
  const card = await readOp<CardData>('card', { id: input.id }, ctx as unknown as QueryContext);
  const definition = (card.json ?? card.definition ?? card) as Record<string, any>;
  const face = definition.cardFace;
  if (!face?.variants?.[input.themeId]) throw new Error('这个主题尚未组装，请先进入卡牌工作流');
  return requestContent('updateCard', { id: input.id, expectedRevision: input.expectedRevision, patch: { cardFace: { ...face, themeId: input.themeId } } }, ctx);
});
