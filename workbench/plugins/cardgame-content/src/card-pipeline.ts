import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import sharp from 'sharp';
import { validateCard } from './content';
import { cardCollection } from './card-collections';
import { inspectDeck, normalizeDeckPlan, type DeckPlan } from './deck-plan';
import type { ContentService, CardItem } from './types';
import type { WorkflowService, ProductionRecord, GameCandidateRecord } from './workflow';
import type { CardImageGenerator } from './codex-imagegen';
import { CARD_FACE_THEMES, CARD_FACE_VERSION, DEFAULT_FACE, normalizeFace, renderCardFace, type FacePresentation } from '../../../templates/cardgame-production/card-face';

export interface PipelineCard {
  definition: Record<string, any>;
  sourceRevision?: string;
  artBrief: string;
  presentation: FacePresentation;
  reviewed?: string;
  artRequest?: { id: string; fingerprint: string; prompt: string };
  artGeneration?: { requestId: string; status: 'running' | 'ready' | 'failed' | 'unavailable'; startedAt: string; error?: string };
  art?: { id: string; revision: string; fingerprint: string; provider: 'codex' | 'existing'; sourceCardId?: string };
  assembly?: { fingerprint: string; variants: Record<string, { previewId: string; runtimeId: string }> };
  integration?: { fingerprint: string; revision: string };
}
export interface CardBatch { kind: 'card-generation'; schemaVersion: 1; provider: 'codex'; cards: PipelineCard[]; deck?: DeckPlan; artBaseline?: { cardRevisions: Record<string, string> }; draftOrigin?: 'agent' | 'user' | 'unknown'; draftSource?: { kind: 'native-session'; noteId: string; sessionId: string }; creation?: { requestId: string; fingerprint: string }; companion?: { cardId: string; revision: string }; progress?: { total: number; done: number } }
function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const text = (value: unknown, label: string) => { if (typeof value !== 'string' || !value.trim()) throw Error(`${label}不能为空`); return value.trim(); };
export const reviewFingerprint = (card: PipelineCard) => hash(card.definition);
export const artFingerprint = (card: PipelineCard) => hash({ id: card.definition.id, brief: card.artBrief });
export const faceFingerprint = (card: PipelineCard) => hash({ definition: card.definition, art: card.art, zoom: card.presentation.zoom, focus: card.presentation.focus, templates: CARD_FACE_THEMES, version: CARD_FACE_VERSION });
export const candidateFingerprint = (card: PipelineCard, featureId: string) => hash({ definition: card.definition, art: card.art, assembly: card.assembly, presentation: card.presentation, sourceRevision: card.sourceRevision, featureId });
export function cardStage(card: PipelineCard, candidates: GameCandidateRecord[] = []): string {
  if (card.reviewed !== reviewFingerprint(card)) return 'review';
  if (!card.art || card.art.fingerprint !== artFingerprint(card)) return 'art';
  if (card.assembly?.fingerprint !== faceFingerprint(card)) return 'assemble';
  if (!candidates.some(candidate => candidate.cardId === card.definition.id && candidate.fingerprint === candidateFingerprint(card, candidate.featureId) && candidate.status !== 'undone')) return 'integrate';
  return 'done';
}
export function cardBatch(value: unknown): CardBatch | undefined {
  const batch = value as CardBatch | undefined;
  return batch?.kind === 'card-generation' && batch.schemaVersion === 1 && Array.isArray(batch.cards) ? batch : undefined;
}

/** Reuses production persistence/CAS/history and content asset versions; owns no parallel database. */
export function createCardPipeline(content: ContentService, workflow: WorkflowService, fonts: Record<string, { file: string; family: string }> = {}, candidates?: { stageCard(input: { projectId: string; productionId: string; cardId: string; featureId: string; baseRevision: number }): Promise<unknown>; stageDeck?(input: { projectId: string; productionId: string; featureId: string; baseRevision: number }): Promise<unknown> }, options: { generatedImagesRoot?: string; imageGenerator?: CardImageGenerator } = {}) {
  const generatedImagesRoot = options.generatedImagesRoot ?? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images');
  let queue = Promise.resolve<unknown>(undefined);
  const serial = <T>(operation: () => Promise<T>): Promise<T> => { const next = queue.then(operation); queue = next.catch(() => undefined); return next; };
  const generationJobs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  let systemFont: Promise<{ file: string; family: string } | undefined> | undefined;
  const faceFont = (projectId: string) => fonts[projectId] ? Promise.resolve(fonts[projectId]) : systemFont ??= (async () => {
    const choices = [
      { file: '/mnt/c/Windows/Fonts/simkai.ttf', family: 'KaiTi' },
      { file: '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc', family: 'Noto Serif CJK SC' },
      { file: '/usr/share/fonts/truetype/arphic/ukai.ttc', family: 'AR PL UKai CN' },
      ...(process.platform === 'win32' ? [{ file: join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'simkai.ttf'), family: 'KaiTi' }] : []),
    ];
    for (const item of choices) if (await stat(item.file).then(info => info.isFile(), () => false)) return item;
    return undefined;
  })();
  const generationKey = (projectId: string, productionId: string, cardId: string, requestId: string) => `${projectId}:${productionId}:${cardId}:${requestId}`;
  async function detail(input: Record<string, any>) {
    const { production } = await workflow.query({ projectId: input.projectId, op: 'production', id: input.productionId }) as { production: ProductionRecord };
    const batch = cardBatch(production.batch);
    if (!batch) throw Error('这不是卡牌生成批次');
    if (input.baseRevision !== undefined && input.baseRevision !== production.revision) throw Error('制作单已变化，请刷新后重试');
    return { production, batch: structuredClone(batch) };
  }
  async function save(production: ProductionRecord, batch: CardBatch) {
    batch.progress = { total: batch.cards.length, done: batch.cards.filter(card => cardStage(card, production.gameCandidates) === 'done').length };
    return workflow.command('updateProduction', { projectId: production.projectId, productionId: production.id, baseRevision: production.revision, patch: { batch } });
  }
  async function candidate(projectId: string, bytes: Buffer, name: string, provider = 'card-template') {
    const results = await content.command('registerCandidates', { projectId, candidates: [{ name, mimeType: 'image/png', base64: bytes.toString('base64'), metadata: { purpose: 'card-face', provider } }] }) as Array<Record<string, any>>;
    return results[0]!;
  }
  async function readGeneratedImage(pathInput: unknown): Promise<Buffer> {
    const path = text(pathInput, 'Codex 生图文件路径');
    if (!isAbsolute(path)) throw Error('Codex 生图文件必须使用绝对路径');
    let root: string;
    let resolved: string;
    try {
      [root, resolved] = await Promise.all([realpath(generatedImagesRoot), realpath(path)]);
    } catch {
      throw Error('Codex 生图文件不存在或输出目录不可用');
    }
    const within = relative(root, resolved);
    if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
      throw Error('仅接受 Codex generated_images 目录中的文件');
    }
    const file = await stat(resolved);
    if (!file.isFile() || file.size > 20_000_000) throw Error('Codex 生图文件必须是 20 MB 以内的普通文件');
    const bytes = await readFile(resolved);
    if (bytes.length > 20_000_000) throw Error('Codex 生图文件超过 20 MB');
    return bytes;
  }
  async function currentGeneration(projectId: string, productionId: string, cardId: string, requestId: string) {
    const current = await detail({ projectId, productionId });
    const card = current.batch.cards.find(item => item.definition.id === cardId);
    return card?.artRequest?.id === requestId && card.artRequest.fingerprint === artFingerprint(card) ? { ...current, card } : undefined;
  }
  function startGeneration(projectId: string, productionId: string, cardId: string, request: NonNullable<PipelineCard['artRequest']>) {
    const generator = options.imageGenerator;
    if (!generator) return;
    const key = generationKey(projectId, productionId, cardId, request.id);
    if (generationJobs.has(key)) return;
    const controller = new AbortController();
    const done = (async () => {
      try {
        const generatedImagePath = await generator.generate(request.prompt, controller.signal);
        const attached = await serial(async () => {
          const current = await currentGeneration(projectId, productionId, cardId, request.id);
          if (!current || current.card.art?.fingerprint === artFingerprint(current.card)) return false;
          await execute('attachCardArt', { projectId, productionId, cardId, requestId: request.id, baseRevision: current.production.revision, generatedImagePath });
          return true;
        });
        if (!attached) return;
        const assembled = await serial(async () => {
          const current = await currentGeneration(projectId, productionId, cardId, request.id);
          if (!current) return false;
          await execute('assembleCardFaces', { projectId, productionId, cardId, baseRevision: current.production.revision });
          return true;
        });
        if (!assembled || !candidates) return;
        await serial(async () => {
          const current = await currentGeneration(projectId, productionId, cardId, request.id);
          if (current && !current.batch.deck) await execute('integrateCard', { projectId, productionId, cardId, baseRevision: current.production.revision });
        });
      } catch (cause) {
        await serial(async () => {
          const current = await currentGeneration(projectId, productionId, cardId, request.id).catch(() => undefined);
          if (!current || current.card.artGeneration?.requestId !== request.id) return;
          current.card.artGeneration = { ...current.card.artGeneration, status: 'failed', error: cause instanceof Error ? cause.message : String(cause) };
          await save(current.production, current.batch);
        }).catch(() => undefined);
      }
    })();
    generationJobs.set(key, { controller, done });
    void done.finally(() => generationJobs.delete(key));
  }
  async function create(input: Record<string, any>) {
    if (input.productionId) throw Error('新建批次由服务生成 ID；修改请使用现有批次动作');
    const requested = typeof input.requestId === 'string' && input.requestId.trim() ? input.requestId.trim() : undefined;
    const creation = requested ? { requestId: requested, fingerprint: hash({ projectId: input.projectId, brief: input.brief, featureId: input.featureId, todoId: input.todoId, cards: input.cards, cardIds: input.cardIds, companion: input.companion, deckPlan: input.deckPlan }) } : undefined;
    const requestedId = requested ? `production-card-${hash({ projectId: input.projectId, requestId: requested }).slice(0, 32)}` : undefined;
    let prior: ProductionRecord | undefined;
    if (requestedId) {
      try { prior = (await workflow.query({ projectId: input.projectId, op: 'production', id: requestedId }) as { production: ProductionRecord }).production; }
      catch (error) { if ((error as any).code !== 'not-found') throw error; }
      if (prior && cardBatch(prior.batch)?.creation?.fingerprint !== creation?.fingerprint) throw Error('这个创建请求已经用于另一份需求，请重新发起创建');
    }
    let todo: any;
    if (input.todoId) {
      todo = (await workflow.query({ projectId: input.projectId, op: 'todo', id: text(input.todoId, '待办') }) as any).item;
      if (todo.productionId && todo.productionId !== requestedId) throw Error('该待办已关联制作单，请打开已有制作单');
    }
    if (prior) {
      if (todo) await workflow.command('bindTodo', { projectId: input.projectId, todoId: todo.id, productionId: prior.id, todoBaseRevision: todo.revision, productionBaseRevision: prior.revision });
      return { production: prior, revision: prior.revision, created: false, reused: true };
    }
    let companion: CardBatch['companion'];
    if (input.companion) {
      const source = await content.query({ projectId: input.projectId, op: 'card', id: text(input.companion.cardId, '配套单位') }) as CardItem;
      if (source.json?.kind !== 'unit' || source.revision !== input.companion.revision) throw Error('配套单位已变化，请刷新后重新设计');
      companion = { cardId: source.id, revision: source.revision };
    }
    const cards: PipelineCard[] = [];
    for (const id of input.cardIds ?? []) {
      const source = await content.query({ projectId: input.projectId, op: 'card', id }) as CardItem;
      if (input.sourceRevisions?.[id] && input.sourceRevisions[id] !== source.revision) throw Error(`卡牌 ${id} 已变化，请刷新后建立候选`);
      const { cardFace: _face, ...definition } = source.json!;
      const card: PipelineCard = { definition, sourceRevision: source.revision, artBrief: String(input.artBrief || `为「${source.name}」绘制修仙像素插画，主体清晰，无文字、无边框、无数值。`), presentation: normalizeFace({ themeId: (source.json?.cardFace as any)?.themeId ?? DEFAULT_FACE.themeId }) };
      const artwork = (source.json?.cardFace as any)?.artwork;
      if (typeof artwork === 'string' && artwork.startsWith('/assets/card-faces/')) {
        try {
          const asset = await content.resolveMedia({ projectId: input.projectId, op: 'media', path: 'public' + artwork, variant: 'original' });
          card.art = { id: asset.id, revision: asset.revision, fingerprint: artFingerprint(card), provider: 'codex' };
        } catch (error) { if ((error as any).code !== 'NOT_FOUND') throw error; }
      }
      cards.push(card);
    }
    for (const raw of input.cards ?? []) {
      const definition = validateCard(raw);
      cardCollection(definition.kind);
      cards.push({ definition, artBrief: `为「${definition.name}」绘制修仙像素插画，无文字、无边框、无数值。`, presentation: { ...DEFAULT_FACE } });
    }
    if (cards.length > 30 || new Set(cards.map(card => card.definition.id)).size !== cards.length) throw Error('每批最多 30 张，卡牌 ID 不能重复');
    for (const card of cards) cardCollection(card.definition.kind);
    const batch: CardBatch = { kind: 'card-generation', schemaVersion: 1, provider: 'codex', cards, ...(cards.length ? { draftOrigin: ['agent', 'user'].includes(input._draftOrigin) ? input._draftOrigin : 'unknown', ...(input._draftOrigin === 'agent' && input._draftSource ? { draftSource: input._draftSource } : {}) } : {}), ...(creation ? { creation } : {}), ...(companion ? { companion } : {}), progress: { total: cards.length, done: 0 }, ...(input.deckPlan ? { deck: normalizeDeckPlan(input.deckPlan, input.brief) } : {}) };
    const result = await workflow.command('upsertProduction', { projectId: input.projectId, ...(requestedId ? { id: requestedId } : {}), ...(todo ? { todoId: todo.id } : {}), brief: text(input.brief, '制作目标'), featureId: text(input.featureId, '功能项'), batch }) as { production: ProductionRecord; revision: number; created: boolean };
    if (todo) await workflow.command('bindTodo', { projectId: input.projectId, todoId: todo.id, productionId: result.production.id, todoBaseRevision: todo.revision, productionBaseRevision: result.revision });
    return result;
  }
  async function execute(method: string, input: Record<string, any>): Promise<any> {
    if (method === 'createCardBatch') return create(input);
    if (!Number.isInteger(input.baseRevision)) throw Error('需要当前制作单 baseRevision，请先读取 cardBatch');
    const { production, batch } = await detail(input);
    if (method === 'setCardDrafts') {
      if (batch.cards.some(card => card.reviewed)) throw Error('已确认的卡组不能被 AI 整批覆盖，请逐张修改');
      if (!Array.isArray(input.cards) || !input.cards.length || input.cards.length > 30) throw Error('需要 1–30 张卡牌定义');
      const ids = new Set<string>();
      batch.cards = input.cards.map((raw: unknown) => {
        const definition = validateCard(raw);
        cardCollection(definition.kind);
        if (ids.has(String(definition.id))) throw Error('卡牌 ID 不可重复');
        ids.add(String(definition.id));
        const prior = batch.cards.find(card => card.definition.id === definition.id);
        return { ...prior, definition, artBrief: prior?.artBrief ?? `为「${definition.name}」绘制修仙像素插画，无文字、无边框、无数值。`, presentation: prior?.presentation ?? { ...DEFAULT_FACE } };
      });
      if (input.deckPlan) batch.deck = normalizeDeckPlan(input.deckPlan, production.brief, batch.deck);
      batch.draftOrigin = ['agent', 'user'].includes(input._draftOrigin) ? input._draftOrigin : 'unknown';
      batch.draftSource = batch.draftOrigin === 'agent' ? input._draftSource : undefined;
      return save(production, batch);
    }
    if (method === 'saveDeckPlan') {
      batch.deck = normalizeDeckPlan(input.deckPlan, production.brief, batch.deck);
      return save(production, batch);
    }
    if (method === 'confirmDeckDraft') {
      if (!batch.deck) throw Error('没有独立牌组方案');
      const report = inspectDeck(batch.cards, batch.deck, production.brief, production.gameCandidates);
      if (!report.legal || report.basisChanged) throw Error('请先补齐数量、合法定义及当前简报对应的牌组方案');
      batch.deck.approvedFingerprint = report.fingerprint;
      return save(production, batch);
    }
    if (method === 'prepareDeckArt') {
      if (!batch.deck) throw Error('没有独立牌组方案');
      const report = inspectDeck(batch.cards, batch.deck, production.brief, production.gameCandidates);
      if (!report.confirmed || !production.gameCandidates?.some(item => item.kind === 'deck' && item.targetId === batch.deck!.id && item.status === 'adopted')) throw Error('请先正式采用当前牌组，再更新整套插画');
      const cardRevisions: Record<string, string> = {};
      for (const entry of batch.deck.entries) {
        const card = batch.cards.find(item => item.definition.id === entry.cardId)!;
        const source = await content.query({ projectId: input.projectId, op: 'card', id: entry.cardId, freshKind: String(card.definition.kind) }) as CardItem;
        const { cardFace: _face, ...definition } = source.json!;
        if (stable(definition) !== stable(card.definition)) throw Error(`正式卡牌 ${entry.cardId} 的规则或数值已变化，请先核对当前草稿`);
        cardRevisions[entry.cardId] = source.revision;
      }
      // The candidate service binds the exact existing deck bytes; art never forges logic approval.
      batch.artBaseline = { cardRevisions };
      return save(production, batch);
    }
    if (method === 'stageDeckCandidate') {
      if (!candidates?.stageDeck) throw Error('整套候选服务不可用；不会写入正式游戏');
      return candidates.stageDeck({ projectId: input.projectId, productionId: production.id, featureId: text(production.featureId, '制作单功能项'), baseRevision: production.revision });
    }
    if (method === 'approveCardDrafts') {
      if (!batch.cards.length) throw Error('请先生成卡组草稿');
      for (const card of batch.cards.filter(card => !input.cardId || card.definition.id === input.cardId)) { validateCard(card.definition); card.reviewed = reviewFingerprint(card); }
      return save(production, batch);
    }
    const card = batch.cards.find(card => card.definition.id === input.cardId);
    if (!card) throw Error('找不到批次中的卡牌');
    if (method === 'saveCardDraft') {
      const previousArtFingerprint = artFingerprint(card);
      if (input.definition) {
        const definition = validateCard(input.definition);
        if (definition.id !== card.definition.id || definition.kind !== card.definition.kind) throw Error('卡牌 ID 和类别不可修改');
        card.definition = definition;
      }
      if (input.artBrief !== undefined) card.artBrief = text(input.artBrief, '生图要求');
      if (artFingerprint(card) !== previousArtFingerprint) { card.artRequest = undefined; card.artGeneration = undefined; }
      if (input.presentation) card.presentation = normalizeFace({ ...card.presentation, ...input.presentation });
      return save(production, batch);
    }
    // Fix the exact draft version when production starts. This records a CAS
    // boundary; it is not a claim that the user approved the card for adoption.
    if (card.reviewed !== reviewFingerprint(card)) {
      if (method === 'requestCardArt' || method === 'reuseCardArt' || method === 'assembleCardFaces') card.reviewed = reviewFingerprint(card);
      else throw Error('卡牌定义已变化，请从当前草稿重新制作');
    }
    if (method === 'reuseCardArt') {
      if (card.artGeneration?.status === 'running') throw Error('当前卡牌正在生图，请等待该任务结束再选择复用');
      const sourceId = text(input.sourceCardId, '插画来源卡牌');
      const source = await content.query({ projectId: input.projectId, op: 'card', id: sourceId }) as CardItem;
      if (typeof input.sourceRevision !== 'string' || source.revision !== input.sourceRevision) throw Error('来源卡牌已变化，请刷新后重新选择插画');
      const artwork = (source.json?.cardFace as any)?.artwork;
      if (typeof artwork !== 'string' || !artwork.startsWith('/assets/card-faces/')) throw Error('这张卡没有可复用的插画');
      const media = await content.resolveMedia({ projectId: input.projectId, op: 'media', path: 'public' + artwork, variant: 'original' });
      const metadata = await sharp(await readFile(media.absolutePath), { limitInputPixels: 24_000_000 }).metadata();
      if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.width ?? 0) < 256 || (metadata.height ?? 0) < 256) throw Error('来源需要至少 256×256 的 PNG、JPEG 或 WebP');
      const art: NonNullable<PipelineCard['art']> = { id: media.id, revision: media.revision, fingerprint: artFingerprint(card), provider: 'existing', sourceCardId: sourceId };
      if (stable(card.art) === stable(art) && cardBatch(production.batch)?.cards.find(item => item.definition.id === card.definition.id)?.reviewed === reviewFingerprint(card)) return { production, reused: true };
      card.art = art; card.artRequest = undefined; card.artGeneration = undefined;
      return save(production, batch);
    }
    if (method === 'requestCardArt') {
      if (card.art?.fingerprint === artFingerprint(card)) {
        const result = await save(production, batch);
        return { ...result as object, reusedArt: true };
      }
      const fingerprint = artFingerprint(card);
      if (card.artRequest?.fingerprint !== fingerprint) card.artRequest = {
        id: randomUUID(), fingerprint,
        prompt: `${card.artBrief}\n只生成独立插画；不要卡名、规则、数字、边框或水印。保留四周裁切余量，主体放在中央。卡牌定义：${JSON.stringify(card.definition)}。`,
      };
      const key = generationKey(input.projectId, production.id, card.definition.id, card.artRequest.id);
      if (generationJobs.has(key)) return { production, batch, request: card.artRequest, automaticGeneration: true, generation: 'running' };
      const automaticGeneration = await options.imageGenerator?.available() ?? false;
      card.artGeneration = { requestId: card.artRequest.id, status: automaticGeneration ? 'running' : 'unavailable', startedAt: new Date().toISOString(), ...(!automaticGeneration ? { error: '当前宿主没有可用的 Codex CLI 内置生图能力' } : {}) };
      const result = await save(production, batch);
      if (automaticGeneration) startGeneration(input.projectId, production.id, card.definition.id, card.artRequest);
      return { ...result as object, request: card.artRequest, automaticGeneration, ...(automaticGeneration ? { generation: 'running' } : { handoff: `当前宿主没有可用的 Codex CLI。请在 Codex 会话用 $imagegen 为当前请求生成插画，再把 $CODEX_HOME/generated_images 下的原始文件路径通过 attachCardArt 回填。请求：${card.artRequest.id}\n${card.artRequest.prompt}` }) };
    }
    if (method === 'attachCardArt') {
      if (!card.artRequest || input.requestId !== card.artRequest.id || card.artRequest.fingerprint !== artFingerprint(card)) throw Error('生图回执已过期，请使用当前生图请求');
      if ((input.base64 !== undefined) === (input.generatedImagePath !== undefined)) throw Error('请只提供图片 base64 或 Codex 生图文件路径之一');
      let imageBytes: Buffer;
      if (input.generatedImagePath !== undefined) imageBytes = await readGeneratedImage(input.generatedImagePath);
      else {
        const encoded = text(input.base64, '图片');
        if (encoded.length > 28_000_000) throw Error('图片过大，请使用 20 MB 以内的素材');
        imageBytes = Buffer.from(encoded.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      }
      const image = sharp(imageBytes, { limitInputPixels: 24_000_000 });
      const metadata = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.width ?? 0) < 256 || (metadata.height ?? 0) < 256) throw Error('需要至少 256×256 的 PNG、JPEG 或 WebP');
      const bytes = await image.rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      const asset = await candidate(input.projectId, bytes, `${card.definition.id}-art.png`, 'codex');
      card.art = { id: String(asset.id), revision: String(asset.revision), fingerprint: artFingerprint(card), provider: 'codex' };
      if (card.artGeneration?.requestId === card.artRequest.id) card.artGeneration = { ...card.artGeneration, status: 'ready', error: undefined };
      return save(production, batch);
    }
    if (!card.art || card.art.fingerprint !== artFingerprint(card)) throw Error('需要当前要求对应的插画');
    if (method === 'assembleCardFaces') {
      const fingerprint = faceFingerprint(card);
      if (card.assembly?.fingerprint === fingerprint) return { production, reused: true };
      const media = await content.resolveMedia({ projectId: input.projectId, op: 'media', id: card.art.id, variant: 'original' });
      const art = `data:image/png;base64,${(await readFile(media.absolutePath)).toString('base64')}`;
      const font = await faceFont(input.projectId);
      // A trusted local host option can register a CJK font without distributing it.
      if (font) await sharp({ text: { text: '卡牌', font: font.family, fontfile: font.file, rgba: true } }).png().toBuffer();
      const variants: NonNullable<PipelineCard['assembly']>['variants'] = {};
      for (const theme of CARD_FACE_THEMES) {
        const face = { ...card.presentation, themeId: theme.id };
        const preview = await sharp(Buffer.from(renderCardFace(card.definition, art, face, true, font?.family))).png().toBuffer();
        const runtime = await sharp(Buffer.from(renderCardFace(card.definition, art, face, false, font?.family))).png().toBuffer();
        const a = await candidate(input.projectId, preview, `${card.definition.id}-${theme.id}-preview.png`);
        const b = await candidate(input.projectId, runtime, `${card.definition.id}-${theme.id}-runtime.png`);
        variants[theme.id] = { previewId: String(a.id), runtimeId: String(b.id) };
      }
      card.assembly = { fingerprint, variants };
      return save(production, batch);
    }
    if (method === 'integrateCard') {
      if (!candidates) throw Error('候选制作服务不可用；不会写入正式游戏');
      if (card.assembly?.fingerprint !== faceFingerprint(card)) throw Error('牌面已过期，请重新组装');
      const featureId = text(production.featureId, '制作单功能项');
      return candidates.stageCard({ projectId: input.projectId, productionId: production.id, cardId: card.definition.id, featureId, baseRevision: production.revision });
    }
    throw Error(`未知卡牌流程动作：${method}`);
  }
  return {
    command: (method: string, input: Record<string, any>) => serial(() => execute(method, input)),
    async query(input: Record<string, any>): Promise<any> {
      if (input.op === 'cardFaceThemes') return { items: CARD_FACE_THEMES, provider: 'codex', automaticGeneration: await options.imageGenerator?.available() ?? false };
      const { production, batch } = await detail(input);
      for (const card of batch.cards) if (card.artGeneration?.status === 'running' && !generationJobs.has(generationKey(input.projectId, production.id, card.definition.id, card.artGeneration.requestId))) card.artGeneration = { ...card.artGeneration, status: 'failed', error: '上次生图任务已中断，可重新发起当前请求' };
      return { production, batch, ...(batch.deck ? { deckInspection: inspectDeck(batch.cards, batch.deck, production.brief, production.gameCandidates) } : {}), stages: Object.fromEntries(batch.cards.map(card => [card.definition.id, cardStage(card, production.gameCandidates)])) };
    },
    async close() { for (const job of generationJobs.values()) job.controller.abort(); await Promise.allSettled([...generationJobs.values()].map(job => job.done)); await queue; },
  };
}
export const CARD_PIPELINE_COMMANDS = new Set(['createCardBatch', 'setCardDrafts', 'saveCardDraft', 'approveCardDrafts', 'requestCardArt', 'reuseCardArt', 'attachCardArt', 'assembleCardFaces', 'integrateCard', 'saveDeckPlan', 'confirmDeckDraft', 'prepareDeckArt', 'stageDeckCandidate']);
