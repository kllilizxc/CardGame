import { defineAction, defineQuery, defineEvent, z, noteConfigRef } from "@dsh-workbench/runtime";
import type { ActionContext, JsonValue, QueryContext } from "@dsh-workbench/runtime";

const recordSchema = z.record(z.string(), z.unknown());
const productionSchema = z.looseObject({ projectId: z.string(), id: z.string(), brief: z.string(), pinnedRefs: z.array(recordSchema), rounds: z.array(recordSchema), candidateRefs: z.array(recordSchema), status: z.string(), requirementRevision: z.number(), revision: z.number(), createdAt: z.string(), updatedAt: z.string() });
const productionResultSchema = z.looseObject({ production: productionSchema, revision: z.number().optional() });
const queuedSchema = z.looseObject({ status: z.literal('queued'), requestId: z.string(), eventId: z.string(), duplicate: z.boolean() });
const assetRegistrationSchema = z.discriminatedUnion('status', [
  z.looseObject({ status: z.literal('skipped'), candidates: z.array(recordSchema) }),
  queuedSchema,
  z.looseObject({ status: z.literal('failed'), error: z.string() }),
]);
const resultReceiptSchema = productionResultSchema.extend({
  accepted: z.boolean(), duplicate: z.boolean(), stale: z.boolean(), requestId: z.string(),
  round: z.number().optional(), reason: z.string().optional(), assetRegistration: assetRegistrationSchema.optional(),
});
const featureChoicesSchema = z.object({ items: z.array(z.object({ id: z.string(), title: z.string() })) });
const productionInputSchema = z.looseObject({ projectId: z.string(), productionId: z.string().optional(), id: z.string().optional(), brief: z.string(), targetAsset: z.record(z.string(), z.unknown()).optional(), pinnedRefs: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).optional(), batch: z.unknown().optional(), todoId: z.string().optional() });
export const events = {
 generationRequested: defineEvent({ name: 'cardgame.production.generationRequested', description: '准确的制作轮次和请求 ID 已持久化，等待执行台接收。', payload: z.object({ projectId: z.string(), productionId: z.string(), requestId: z.string(), round: z.number(), submit: recordSchema }), objectRef: '/productionId', revision: '/round' }),
 candidatesRequested: defineEvent({ name: 'cardgame.production.candidatesRequested', description: '向资源库登记制作结果的候选文件并回填实际版本 ID。', payload: z.object({ projectId: z.string(), productionId: z.string(), round: z.number().optional(), requestId: z.string(), candidates: z.array(recordSchema) }), objectRef: '/productionId' }),
 adoptionRequested: defineEvent({ name: 'cardgame.production.adoptionRequested', description: '用户明确采用一个候选版本；回执须保留实际资源与版本 ID。', payload: z.object({ projectId: z.string(), productionId: z.string(), candidateId: z.string(), assetId: z.string().optional(), versionId: z.string().optional(), requestId: z.string() }), objectRef: '/candidateId' }),
};


export interface ProductionState {
  projectId?: string;
  selectedId?: string;
  query?: string;
}

/** Explicit card workflow actions share the existing production backend. */
export const cardWorkflow = defineAction({
  description: "内部操作：cardWorkflow。",
  input: z.looseObject({ operation: z.enum(['createCardBatch', 'setCardDrafts', 'saveCardDraft', 'approveCardDrafts', 'requestCardArt', 'reuseCardArt', 'attachCardArt', 'assembleCardFaces', 'integrateCard', 'saveDeckPlan', 'confirmDeckDraft', 'prepareDeckArt', 'stageDeckCandidate']) }),
  output: productionResultSchema.extend({ handoff: z.string().optional(), automaticGeneration: z.boolean().optional(), reusedArt: z.boolean().optional() }),
  visibility: 'private',
}, async (input, ctx) => {
  const allowed = new Set(['createCardBatch', 'setCardDrafts', 'saveCardDraft', 'approveCardDrafts', 'requestCardArt', 'reuseCardArt', 'attachCardArt', 'assembleCardFaces', 'integrateCard', 'saveDeckPlan', 'confirmDeckDraft', 'prepareDeckArt', 'stageDeckCandidate']);
  if (!allowed.has(input.operation)) throw new Error('未知卡牌工作流动作');
  const { operation, ...payload } = input;
  return command(operation, { ...payload, projectId: await project(payload, ctx) }, ctx);
});

export type ProductionInput = z.infer<typeof productionInputSchema>;

async function project(input: Record<string, unknown>, ctx: ActionContext | QueryContext): Promise<string> {
  const configured = await ctx.store.read<Record<string, unknown>>(noteConfigRef(ctx.note.id)).catch(() => undefined);
  const projectId = typeof input.projectId === "string" && input.projectId.trim()
    ? input.projectId.trim()
    : typeof configured?.value?.projectId === "string" && configured.value.projectId.trim()
      ? configured.value.projectId.trim()
      : "";
  if (!projectId) throw new Error("CardGame 便笺尚未配置 projectId");
  return projectId;
}

async function command(method: string, input: Record<string, unknown>, ctx: ActionContext): Promise<any> {
  return ctx.extensions.request("cardgame-content", method, input);
}

async function readOp<T>(op: string, input: Record<string, unknown>, ctx: QueryContext): Promise<T> {
  const projectId = await project(input as unknown as Record<string, unknown>, ctx);
  const snapshot = await ctx.resources.read<T>({ name: "extension.cardgame-content.query", input: { ...input, projectId, op } as JsonValue });
  if (snapshot.error && snapshot.data === undefined) throw new Error(snapshot.error);
  if (snapshot.data === undefined) throw new Error(`CardGame 制作查询 ${op} 没有返回数据`);
  return snapshot.data;
}

function resultRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

/** Prefer backend-assigned candidate/version identities over local proposals. */
function candidatesFromReceipt(receipt: { result?: unknown }, fallback: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (Array.isArray(receipt.result)) {
    const values = receipt.result.filter((value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)));
    if (values.length) return values;
  }
  const result = resultRecord(receipt.result);
  for (const key of ["candidates", "candidateRefs", "versions", "items"]) {
    if (Array.isArray(result[key])) {
      const values = result[key].filter((value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)));
      if (values.length) return values;
    }
  }
  return fallback;
}

function adoptionIdentity(receipt: { result?: unknown }): { assetId?: string; versionId?: string; candidateId?: string } {
  const result = resultRecord(receipt.result);
  const asset = resultRecord(result.asset);
  const version = resultRecord(result.version);
  const currentVersion = resultRecord(result.currentVersion);
  return {
    ...(typeof (result.assetId ?? asset.id ?? result.id) === "string" ? { assetId: result.assetId ?? asset.id ?? result.id } : {}),
    ...(typeof (result.versionId ?? version.id ?? result.currentVersionId ?? currentVersion.id) === "string" ? { versionId: result.versionId ?? version.id ?? result.currentVersionId ?? currentVersion.id } : {}),
    ...(typeof (result.candidateId ?? currentVersion.candidateId) === "string" ? { candidateId: result.candidateId ?? currentVersion.candidateId } : {}),
  };
}

async function registerReturnedCandidates(projectId: string, productionId: string, round: number, requestId: string, candidates: Array<Record<string, unknown>>, ctx: ActionContext): Promise<z.infer<typeof assetRegistrationSchema>> {
  if (!candidates.length) return { status: "skipped", candidates: [] };
  try {
    const registrationRequestId = `asset-candidates:${projectId}:${productionId}:${round}:${requestId}`;
    const event = await events.candidatesRequested.publish(ctx,
      { projectId, productionId, round, requestId: registrationRequestId, candidates },
      { key: registrationRequestId, exclusive: true });
    return { status: "queued" as const, requestId: registrationRequestId, eventId: event.id, duplicate: event.duplicate };
  } catch (cause) {
    return { status: "failed", error: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** Keep the existing CardGame card discussion entry available after activation. */
export const discussCardBatch = defineAction({
  description: "内部操作：discussCardBatch。",
  input: z.object({ projectId: z.string(), productionId: z.string(), cardId: z.string().optional() }),
  output: z.looseObject({ sessionId: z.string() }),
  visibility: 'private',
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  const detail = await readOp<any>('cardBatch', { projectId, productionId: input.productionId }, ctx as unknown as QueryContext);
  if (!ctx.agent.prepare) throw new Error('宿主没有提供原生会话');
  const session = await ctx.agent.prepare({ noteId: ctx.note.id });
  const prompt = [
    `用户要继续卡牌工作流：${detail.production.brief}。projectId=${projectId}，productionId=${input.productionId}，baseRevision=${detail.production.revision}。`,
    input.cardId ? `当前选中卡牌：${input.cardId}。先读取 cardBatch，再按用户要求微调。` : '请结合项目现有 units.json、效果类型和世界观生成卡组草稿，并调用 cardWorkflow(operation=setCardDrafts) 保存，不要只在对话中输出。',
    ...(detail.batch?.deck ? [`这是独立牌组制作：${detail.batch.deck.title}，目标 ${detail.batch.deck.targetSize} 张总量（不是牌种数）。先读取现有规则与同类卡，设计原创命名、合法效果和副本数量。用 setCardDrafts 同时保存 cards 与 deckPlan（保留 id=${detail.batch.deck.id}，entries=[{cardId,count}]，总量等于 targetSize）。不要写入正式默认牌组，不调用生图；停在用户确认整套草案。单张修改用 saveCardDraft，数量调整用 saveDeckPlan，保留其余卡与素材。`] : []),
    '沿用原有执行效果结构。已确认卡牌用 saveCardDraft 逐张修改；不能覆盖人工确认。停在人工微调步骤，由用户核对。',
    '插画由 Codex 内置 imagegen 承接；本宿主没有该生图接口时保存 requestCardArt 交接，不得假装已生成或改用收费接口。',
  ].join('\n');
  await ctx.agent.run({ noteId: ctx.note.id, sessionId: session.sessionId, prompt });
  return session;
});

/** Save or edit a draft. This action never invokes a model connection. */
export const upsertRequest = defineAction({
  description: "按 Todo 身份幂等建立或更新制作单草稿，不启动生成。",
  input: productionInputSchema,
  output: productionResultSchema.extend({ created: z.boolean() }),
  receipt: "queryable",
}, async (input, ctx) => {
  const projectId = await project(input as unknown as Record<string, unknown>, ctx);
  return command("upsertProduction", { ...(input as unknown as Record<string, unknown>), projectId }, ctx);
});

export const updateProduction = defineAction({
  description: "内部操作：updateProduction。",
  input: z.object({ projectId: z.string(), productionId: z.string(), baseRevision: z.number(), patch: z.record(z.string(), z.unknown()) }),
  output: productionResultSchema,
  visibility: 'private',
}, async (input, ctx) => {
  return command("updateProduction", { ...input, projectId: await project(input, ctx) }, ctx);
});

/**
 * Reserve a durable round, then publish its immutable snapshot to the
 * Production/Desk Skill relation. The same requestId retries the same event.
 */
export const generate = defineAction({
  description: "仅在用户明确点击生成后预留轮次并发布执行请求。",
  input: z.object({ projectId: z.string(), productionId: z.string(), requestId: z.string().optional(), newRound: z.boolean().optional(), round: z.number().optional(), businessKey: z.string().optional(), scope: z.array(z.string()).optional(), cwd: z.string().optional() }),
  output: queuedSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  const reserved = await command("reserveProduction", { ...input, projectId }, ctx);
  const requestId = reserved.requestId as string;
  const submit = reserved.submit ?? reserved.input;
  const event = await events.generationRequested.publish(ctx,
    { projectId, productionId: input.productionId, requestId, round: reserved.round?.round, submit },
    { key: requestId, exclusive: true });
  return { ...reserved, status: "queued", eventId: event.id, duplicate: event.duplicate };
});

/** The Skill relation persists the exact execution receipt for this round. */
export const bindExecution = defineAction({
  description: "把执行台回执及任务 ID 记录到原制作轮次。",
  input: z.object({ projectId: z.string(), productionId: z.string(), requestId: z.string(), receipt: z.record(z.string(), z.unknown()) }),
  output: productionResultSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  return command("bindProduction", { ...input, projectId: await project(input, ctx) }, ctx);
});

/** Retry the same reserved round and requestId after an ambiguous transport. */
export const retry = defineAction({
  description: "内部操作：retry。",
  input: z.object({ projectId: z.string(), productionId: z.string() }),
  output: queuedSchema,
  visibility: 'private',
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  const detail = await readOp<any>("production", { projectId, productionId: input.productionId }, ctx as unknown as QueryContext);
  const round = detail.production?.rounds?.at(-1);
  if (!round?.requestId) throw new Error("当前制作请求还没有可重试轮次");
  return generate({ projectId, productionId: input.productionId, requestId: round.requestId, round: round.round }, ctx);
});

/** Start a new round while retaining the same execution owner businessKey. */
export const newRound = defineAction({
  description: "内部操作：newRound。",
  input: z.object({ projectId: z.string(), productionId: z.string(), scope: z.array(z.string()).optional(), cwd: z.string().optional() }),
  output: queuedSchema,
  visibility: 'private',
}, async (input, ctx) => {
  return generate({ ...input, newRound: true }, ctx);
});

/** Delivery receiver for the existing execution note. */
export const receiveResult = defineAction({
  description: "按请求 ID、轮次和需求修订接收执行结果；过期轮次只记历史。",
  input: z.looseObject({ projectId: z.string(), productionId: z.string(), requestId: z.string(), round: z.union([z.number(), z.string()]).optional(), requirementRevision: z.number().optional(), status: z.string().optional(), conclusion: z.string().optional(), candidateRefs: z.array(recordSchema).optional(), result: recordSchema.optional() }),
  output: resultReceiptSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  const received = await command("productionResult", { ...input, projectId }, ctx);
  // A late result is durable evidence of an old round only.  It must never
  // trigger candidate registration for the current production again.
  if (received?.stale) return received;
  const production = resultRecord(received?.production);
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  const roundValue = typeof input.round === "number" ? input.round : Number(input.round);
  const round = Array.isArray(production.rounds)
    ? production.rounds.find((value: any) => value?.requestId === requestId && (Number.isNaN(roundValue) || value?.round === roundValue))
    : undefined;
  const result = resultRecord(round?.result);
  const status = typeof result.status === "string" ? result.status : typeof input.status === "string" ? input.status : "completed";
  const candidates = Array.isArray(result.candidateRefs) ? result.candidateRefs.filter((value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))) : [];
  const registrationComplete = production.candidateRegistration?.status === "completed";
  if (status === "completed" && !registrationComplete && typeof input.productionId === "string" && requestId && typeof round?.round === "number") {
    const assetRegistration = await registerReturnedCandidates(input.projectId as string, input.productionId, round.round, requestId, candidates, ctx);
    return { ...received, assetRegistration };
  }
  return received;
});

/** Register bounded candidate references in the asset backend after delivery. */
export const registerCandidates = defineAction({
  description: "发布向资源库登记候选版本的请求。",
  input: z.object({ projectId: z.string(), productionId: z.string(), round: z.number().optional(), candidates: z.array(z.record(z.string(), z.unknown())), requestId: z.string().optional() }),
  output: queuedSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  const requestId = input.requestId ?? `asset-candidates:${projectId}:${input.productionId}:${input.round ?? 0}`;
  const event = await events.candidatesRequested.publish(ctx,
    { ...input, projectId, requestId }, { key: requestId, exclusive: true });
  return { status: "queued" as const, requestId, eventId: event.id, duplicate: event.duplicate };
});

/** Record asset identities returned by the Skill relation's library call. */
export const recordCandidates = defineAction({
  description: "记录资源库回执中的候选版本身份。",
  input: z.object({ projectId: z.string(), productionId: z.string(), round: z.number().optional(), candidates: z.array(z.record(z.string(), z.unknown())), requestId: z.string() }),
  output: productionResultSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  return command("recordCandidates", { ...input, projectId: await project(input, ctx) }, ctx);
});

/** Adopt a candidate through the asset backend; adoption is a separate fact. */
export const adoptAsset = defineAction({
  description: "用户明确选择候选后发布资源采用请求。",
  input: z.object({ projectId: z.string(), productionId: z.string(), candidateId: z.string(), assetId: z.string().optional(), versionId: z.string().optional(), requestId: z.string().optional() }),
  output: queuedSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  const requestId = input.requestId ?? `adopt-asset:${projectId}:${input.productionId}:${input.candidateId}`;
  const event = await events.adoptionRequested.publish(ctx,
    { ...input, projectId, requestId }, { key: requestId, exclusive: true });
  return { status: "queued" as const, requestId, eventId: event.id, duplicate: event.duplicate };
});

/** Record the exact adopted asset/version returned by the library. */
export const recordAdoption = defineAction({
  description: "记录资源库回执中的采用版本身份。",
  input: z.object({ projectId: z.string(), productionId: z.string(), candidateId: z.string(), assetId: z.string(), versionId: z.string(), requestId: z.string() }),
  output: productionResultSchema,
  receipt: "queryable",
}, async (input, ctx) => {
  return command("recordAdoption", { ...input, projectId: await project(input, ctx) }, ctx);
});

export const bindTodo = defineAction({
  description: "把制作单 ID 与来源 Todo ID 双向持久化绑定。",
  input: z.object({ projectId: z.string(), todoId: z.string(), productionId: z.string(), todoBaseRevision: z.number().optional(), productionBaseRevision: z.number().optional() }),
  output: z.record(z.string(), z.unknown()),
  receipt: "queryable",
}, async (input, ctx) => {
  return command("bindTodo", { ...input, projectId: await project(input, ctx) }, ctx);
});

/** Reject a candidate: mark it in the production record and open a high-priority rework Todo. */
export const rejectCandidate = defineAction({
  description: "内部操作：rejectCandidate。",
  input: z.object({ projectId: z.string(), productionId: z.string(), candidateId: z.string(), baseRevision: z.number(), reason: z.string().optional(), requestId: z.string().optional() }),
  output: z.record(z.string(), z.unknown()),
  visibility: 'private',
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  if (!input.candidateId) throw new Error("rejectCandidate 需要 candidateId");
  const requestId = input.requestId ?? `reject-candidate:${projectId}:${input.productionId}:${input.candidateId}`;
  return command("rejectCandidate", { ...input, projectId, requestId }, ctx);
});


/** Fill missing source metadata on an existing draft without recreating its cards. */
export const linkCompanion = defineAction({
  description: "内部操作：linkCompanion。",
  input: z.object({ projectId: z.string(), productionId: z.string(), baseRevision: z.number(), todoId: z.string(), sourceCardId: z.string(), sourceRevision: z.string() }),
  output: z.record(z.string(), z.unknown()),
  visibility: 'private',
}, async (input, ctx) => {
  const projectId = await project(input, ctx);
  const [detail, todo, source] = await Promise.all([readOp<any>('production', { projectId, productionId: input.productionId }, ctx as unknown as QueryContext), readOp<any>('todo', { projectId, id: input.todoId }, ctx as unknown as QueryContext), readOp<any>('card', { projectId, id: input.sourceCardId }, ctx as unknown as QueryContext)]);
  if (detail.production.revision !== input.baseRevision) throw new Error('制作单已变化，请刷新后重试');
  if (todo.item.productionId && todo.item.productionId !== input.productionId) throw new Error('待办已关联另一制作单');
  if (source.kind !== 'unit' || source.revision !== input.sourceRevision) throw new Error('配套单位已变化，请刷新后重试');
  if (detail.production.batch?.kind !== 'card-generation') throw new Error('这不是卡牌制作单');
  const companion = { cardId: source.id, revision: source.revision };
  const result = await command('updateProduction', { projectId, productionId: input.productionId, baseRevision: input.baseRevision, patch: { batch: { ...detail.production.batch, companion } } }, ctx);
  return command('bindTodo', { projectId, productionId: input.productionId, todoId: input.todoId, todoBaseRevision: todo.item.revision, productionBaseRevision: result.revision }, ctx);
});

const featureChoices = defineQuery({
  description: "内部查询：featureChoices。",
  input: z.object({}).default({}),
  output: featureChoicesSchema,
  visibility: 'private',
}, async (_input, ctx) => {
    const owner = await ctx.notes.read(ctx.note.id);
    const notes = await ctx.notes.lookup({ desktopId: owner.desktopId });
    const trackers = notes.filter(note => !note.archived && note.actions?.includes('setArchiveStatus') && note.actions?.includes('confirmGameCandidate'));
    if (trackers.length !== 1) throw new Error(trackers.length ? '本桌面有多个功能进展便笺，请先确定使用哪一个' : '本桌面没有可用的功能进展便笺');
    const snapshot = await ctx.resources.read<any>({ name: 'extension.official-feature-tracker.state', input: { targetNoteId: trackers[0]!.id } });
    if (snapshot.error && snapshot.data === undefined) throw new Error(snapshot.error);
    return { items: Array.isArray(snapshot.data?.features) ? snapshot.data.features.filter((item: any) => !item.archived).map((item: any) => ({ id: String(item.id), title: String(item.title) })) : [] };
  });

export const queries = {
  productionContext: defineQuery({
    description: "内部查询：productionContext。",
    input: z.object({ projectId: z.string(), productionId: z.string() }),
    output: z.object({ feature: z.object({ id: z.string(), title: z.string() }).optional(), todo: recordSchema.optional(), source: recordSchema.optional() }),
    visibility: 'private',
  }, async (input, ctx) => {
    const [detail, choices] = await Promise.all([readOp<any>('production', input, ctx), featureChoices({}, ctx)]);
    const production = detail.production;
    const [todo, source] = await Promise.all([production.todoId ? readOp<any>('todo', { projectId: input.projectId, id: production.todoId }, ctx) : undefined, production.batch?.companion ? readOp<any>('card', { projectId: input.projectId, id: production.batch.companion.cardId }, ctx) : undefined]);
    return { feature: choices.items.find((item: any) => item.id === production.featureId), todo: todo?.item, source };
  }),

  companionChoices: defineQuery({
    description: "内部查询：companionChoices。",
    input: z.object({ projectId: z.string() }),
    output: z.object({ features: z.array(z.object({ id: z.string(), title: z.string() })), units: z.array(recordSchema), todos: z.array(recordSchema) }),
    visibility: 'private',
  }, async (input, ctx) => {
    const [features, units, todos] = await Promise.all([featureChoices({}, ctx), readOp<any>('cards', { ...input, kind: 'unit', limit: 200 }, ctx), readOp<any>('todos', { ...input, limit: 200 }, ctx)]);
    return { features: features.items, units: (units.items ?? []).filter((item: any) => item.kind === 'unit'), todos: (todos.items ?? []).filter((item: any) => !item.productionId && item.status !== 'done') };
  }),
  sourceCard: defineQuery({
    description: "内部查询：sourceCard。",
    input: z.object({ projectId: z.string(), id: z.string() }),
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => { return readOp<any>('card', input, ctx);
  }),

  featureChoices,

  cardBatch: defineQuery({
    description: "内部查询：cardBatch。",
    input: z.object({ projectId: z.string(), productionId: z.string() }),
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => { return readOp<any>('cardBatch', input, ctx);
  }),
  cardFaceThemes: defineQuery({
    description: "内部查询：cardFaceThemes。",
    input: z.object({ projectId: z.string() }),
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => { return readOp<any>('cardFaceThemes', input, ctx);
  }),
  productions: defineQuery({
    description: "按项目和 Todo ID 分页核对已有制作单。",
    input: z.object({ projectId: z.string(), cursor: z.string().optional(), limit: z.number().optional(), q: z.string().optional(), status: z.string().optional(), todoId: z.string().optional() }),
    output: z.looseObject({ projectId: z.string(), items: z.array(productionSchema), nextCursor: z.string().optional(), limit: z.number(), total: z.number().optional() }),
  }, async (input, ctx) => {
    return readOp<any>("productions", input, ctx);
  }),
  production: defineQuery({
    description: "按项目和制作单 ID 读取当前要求、轮次及回执。",
    input: z.object({ projectId: z.string(), productionId: z.string(), historyCursor: z.string().optional(), historyLimit: z.number().optional() }),
    output: z.looseObject({ production: productionSchema, history: z.array(recordSchema).optional(), nextCursor: z.string().optional(), historyLimit: z.number().optional(), execution: recordSchema.optional() }),
    objectRef: "/production/id",
    revision: "/production/revision",
  }, async (input, ctx) => {
    return readOp<any>("production", { ...input, id: input.productionId }, ctx);
  }),
  media: defineQuery({
    description: "内部查询：media。",
    input: z.object({ projectId: z.string(), path: z.string().optional(), id: z.string().optional(), variant: z.string().optional() }),
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<any>("media", input, ctx);
  }),
  workflowStatus: defineQuery({
    description: "内部查询：workflowStatus。",
    input: z.object({ projectId: z.string() }),
    output: z.record(z.string(), z.unknown()),
    visibility: 'private',
  }, async (input, ctx) => {
    return readOp<any>("workflowStatus", input, ctx);
  }),
};
