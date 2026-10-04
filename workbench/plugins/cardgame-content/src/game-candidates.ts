import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createContentService, frontmatterHasScene, validateCard } from './content';
import { CARD_COLLECTIONS, cardCollection, type CardKind } from './card-collections';
import type { ContentService, CardItem, CompileStoryResult, Page, StoryBuildItem } from './types';
import type { GameCandidateRecord, ProductionRecord, WorkflowService } from './workflow';
import { deckCandidateHash, deckCardFingerprints, deckArtFingerprints, deckPath, inspectDeck } from './deck-plan';
import { CARD_FACE_VERSION } from '../../../templates/cardgame-production/card-face';
import { artFingerprint, candidateFingerprint, faceFingerprint, type CardBatch } from './card-pipeline';
import { applyStoryCopyEdits, validStoryCopyPath, validateStoryCopyEdits, type StoryCopyEdit } from './story-copy-edits';

const run = promisify(execFile);
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const safe = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
const git = async (cwd: string, ...args: string[]) => (await run('git', args, { cwd, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' } })).stdout.trim();
const fileHash = async (path: string): Promise<string | null> => {
  try { return digest(await readFile(path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
};
async function candidateFile(checkout: string, path: string): Promise<string> {
  const absolute = join(checkout, path);
  if ((await lstat(absolute)).isSymbolicLink() || !(await realpath(absolute)).startsWith(resolve(checkout) + '/')) {
    throw Error(`候选依赖文件越界：${path}`);
  }
  return absolute;
}

async function sourceSnapshot(source: string, target: string) {
  await git(dirname(target), 'clone', '--local', '--quiet', '--no-hardlinks', source, target);
  for (const path of ['src', 'public', 'knowledge', 'vite', 'package.json', 'bun.lock', 'bun.lockb', 'index.html']) {
    const from = join(source, path), to = join(target, path);
    const info = await lstat(from).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; });
    if (!info) { await rm(to, { recursive: true, force: true }); continue; }
    if (info.isSymbolicLink()) throw Error(`候选源码包含未核验的符号链接：${path}`);
    await rm(to, { recursive: true, force: true });
    await cp(from, to, { recursive: true, force: true, errorOnExist: false });
  }
}

/** Git tree of exactly the source paths that a candidate copies, including uncommitted worktree content. */
export async function gameSourceSnapshotTree(source: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'worka-game-source-'));
  try {
    const checkout = join(directory, 'repo');
    await sourceSnapshot(source, checkout);
    await git(checkout, 'add', '-A');
    return await git(checkout, 'write-tree');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
/** Runtime source identity. Content is checked separately by each candidate's dependency closure. */
export async function gameRuntimeSnapshotTree(source: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'worka-game-runtime-'));
  try {
    const checkout = join(directory, 'repo');
    await sourceSnapshot(source, checkout);
    return await runtimeTree(checkout);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function runtimeTree(checkout: string): Promise<string> {
  await git(checkout, 'add', '-A');
  await git(checkout, 'rm', '-r', '--cached', '--ignore-unmatch', '--',
    'knowledge', 'public/data', 'public/assets/asset-manifest.json', 'public/assets/card-faces', 'public/assets/story');
  return git(checkout, 'write-tree');
}
function candidateSlot(baseId: string, candidates: GameCandidateRecord[] | undefined): { id: string; previous?: GameCandidateRecord } {
  const versions = (candidates ?? []).filter(item => item.id === baseId || item.id.startsWith(`${baseId}-r`) && /^\d+$/u.test(item.id.slice(baseId.length + 2)));
  const previous = [...versions].reverse().find(item => item.status !== 'undone');
  if (previous) return { id: previous.id, previous };
  const last = Math.max(-1, ...versions.map(item => item.id === baseId ? 0 : Number(item.id.slice(baseId.length + 2))));
  return { id: last < 0 ? baseId : `${baseId}-r${last + 1}` };
}
export const CARD_UNITS_PATH = CARD_COLLECTIONS.unit.path;
export const CARD_ASSET_MANIFEST_PATH = 'public/assets/asset-manifest.json';
export const CARD_STARTER_DECK_PATH = 'public/data/decks/starter-deck.json';
export const CARD_BATTLE_LOADOUT_PATH = 'public/data/config/battle-loadout.json';
export const STORY_CATALOG_PATH = 'public/data/content-catalog.json';
export const STORY_ASSET_MANIFEST_PATH = 'public/assets/asset-manifest.json';
export const STORY_NPC_CATALOG_PATH = 'public/data/world/npcs.json';
export const STORY_ITEM_CATALOG_PATH = 'public/data/world/items.artifacts.json';
export const STORY_QUEST_CATALOG_PATH = 'public/data/world/quests.json';
type ShopItemType = 'artifact' | 'tool' | 'consumable' | 'material' | 'quest';
type ShopItemStack = { id: string; itemType: ShopItemType; count: number };
type ShopCardStack = { id: string; count: number };
type StoryShopOffer = {
  id: string; label: string; description: string;
  cost: { spiritStones: number; items?: ShopItemStack[] };
  rewards: { cards: ShopCardStack[]; items: ShopItemStack[]; spiritStones: number };
};
type StoryShopInput = { resourceId: string; nodeId: string; offers: StoryShopOffer[] };
type StoryRecipe = {
  id: string; name: string; description?: string;
  cost: { spiritStones: number; items: ShopItemStack[] };
  rewards: { items: ShopItemStack[] };
};
type StoryQuest = {
  id: string; title: string; summary: string; actorIds: string[];
  stages: Array<{ id: string; status: 'available' | 'active' | 'completed' | 'failed'; label: string; objective: string }>;
};
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validShopId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{1,127}$/u.test(value);
const validAmount = (value: unknown, min: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
function validateStoryShops(shops: StoryShopInput[] | undefined): void {
  if (shops === undefined) return;
  if (!Array.isArray(shops) || shops.length < 1 || shops.length > 8) throw Error('剧情候选每批最多修改 8 个商店节点');
  const nodes = new Set<string>();
  for (const shop of shops) {
    if (!isRecord(shop) || !validShopId(shop.resourceId) || !validShopId(shop.nodeId)
      || !Array.isArray(shop.offers) || shop.offers.length < 1 || shop.offers.length > 16
      || nodes.has(`${shop.resourceId}:${shop.nodeId}`)) throw Error('商店候选节点无效或重复');
    nodes.add(`${shop.resourceId}:${shop.nodeId}`);
    const offerIds = new Set<string>();
    for (const offer of shop.offers) {
      const cost = offer?.cost, rewards = offer?.rewards;
      const validItems = (value: unknown): value is ShopItemStack[] => Array.isArray(value) && value.length <= 8
        && value.every(item => isRecord(item) && validShopId(item.id) && ['artifact', 'tool', 'consumable', 'material', 'quest'].includes(String(item.itemType)) && validAmount(item.count, 1))
        && new Set(value.map(item => item.id)).size === value.length;
      const validCards = (value: unknown): value is ShopCardStack[] => Array.isArray(value) && value.length <= 8
        && value.every(card => isRecord(card) && validShopId(card.id) && validAmount(card.count, 1))
        && new Set(value.map(card => card.id)).size === value.length;
      if (!isRecord(offer) || !/^offer[._][A-Za-z0-9._-]{1,126}$/u.test(String(offer.id)) || offerIds.has(offer.id)
        || typeof offer.label !== 'string' || !offer.label.trim() || offer.label.length > 80
        || typeof offer.description !== 'string' || !offer.description.trim() || offer.description.length > 1000
        || !isRecord(cost) || !validAmount(cost.spiritStones, 0) || !validItems(cost.items ?? [])
        || !isRecord(rewards) || !validCards(rewards.cards) || !validItems(rewards.items)
        || !validAmount(rewards.spiritStones, 0)) throw Error(`商店报价定义无效：${offer?.id}`);
      offerIds.add(offer.id);
    }
  }
}
function validateStoryRecipes(recipes: StoryRecipe[] | undefined): void {
  if (recipes === undefined) return;
  if (!Array.isArray(recipes) || recipes.length < 1 || recipes.length > 16) throw Error('剧情候选每批需包含 1–16 个制作配方');
  const ids = new Set<string>();
  const validItems = (value: unknown): value is ShopItemStack[] => Array.isArray(value) && value.length <= 8
    && value.every(item => isRecord(item) && validShopId(item.id)
      && ['artifact', 'tool', 'consumable', 'material', 'quest'].includes(String(item.itemType)) && validAmount(item.count, 1))
    && new Set(value.map(item => item.id)).size === value.length;
  for (const recipe of recipes) {
    if (!isRecord(recipe) || !/^recipe[._][A-Za-z0-9._-]{1,126}$/u.test(String(recipe.id)) || ids.has(recipe.id)
      || typeof recipe.name !== 'string' || !recipe.name.trim() || recipe.name.length > 80
      || recipe.description !== undefined && (typeof recipe.description !== 'string' || recipe.description.length > 500)
      || !isRecord(recipe.cost) || !validAmount(recipe.cost.spiritStones, 0) || !validItems(recipe.cost.items)
      || !isRecord(recipe.rewards) || !validItems(recipe.rewards.items)
      || (!recipe.cost.items.length && recipe.cost.spiritStones === 0) || !recipe.rewards.items.length) {
      throw Error(`制作配方定义无效：${recipe?.id}`);
    }
    ids.add(recipe.id);
  }
}
function validateStoryQuests(quests: StoryQuest[] | undefined): void {
  if (quests === undefined) return;
  if (!Array.isArray(quests) || quests.length < 1 || quests.length > 16) throw Error('剧情候选每批需包含 1–16 个任务');
  const ids = new Set<string>();
  for (const quest of quests) {
    if (!isRecord(quest) || !/^quest[._][A-Za-z0-9._-]{1,126}$/u.test(String(quest.id)) || ids.has(quest.id)
      || typeof quest.title !== 'string' || !quest.title.trim() || quest.title.length > 40
      || typeof quest.summary !== 'string' || !quest.summary.trim() || quest.summary.length > 500
      || !Array.isArray(quest.actorIds) || quest.actorIds.length > 16
      || quest.actorIds.some(id => typeof id !== 'string' || !/^npc[._][A-Za-z0-9._-]{1,126}$/u.test(id))
      || new Set(quest.actorIds).size !== quest.actorIds.length
      || !Array.isArray(quest.stages) || quest.stages.length < 1 || quest.stages.length > 32) throw Error(`游戏任务定义无效：${quest?.id}`);
    const stageIds = new Set<string>();
    for (const stage of quest.stages) {
      if (!isRecord(stage) || !validShopId(stage.id) || stageIds.has(stage.id)
        || !['available', 'active', 'completed', 'failed'].includes(String(stage.status))
        || typeof stage.label !== 'string' || !stage.label.trim() || stage.label.length > 40
        || typeof stage.objective !== 'string' || !stage.objective.trim() || stage.objective.length > 80) {
        throw Error(`游戏任务阶段无效：${quest.id}/${stage?.id}`);
      }
      stageIds.add(stage.id);
    }
    ids.add(quest.id);
  }
}
export function validStoryAssetPath(path: string): boolean {
  return /^public\/assets\/story\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/u.test(path) && !path.split('/').some(part => part === '.' || part === '..');
}
export function validItemIconAssetPath(path: string): boolean {
  return /^public\/assets\/items\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/u.test(path) && !path.split('/').some(part => part === '.' || part === '..');
}
export function validStorySourcePath(path: string): boolean {
  return /^knowledge\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/u.test(path) && !path.split('/').some(part => part === '.' || part === '..');
}
function validStoryBattlePath(path: string, kind: 'encounter' | 'deck'): boolean {
  return new RegExp(`^public/data/${kind === 'encounter' ? 'encounters' : 'decks'}/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+\\.json$`, 'u').test(path)
    && !path.split('/').some(part => part === '.' || part === '..');
}
export function validStoryTargetPath(path: string): boolean {
  return validStorySourcePath(path) || /^public\/data\/(?:story|hub)\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/u.test(path)
    || validStoryCopyPath(path)
    || /^public\/data\/mijing\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/u.test(path)
    || validStoryAssetPath(path) || validItemIconAssetPath(path) || validStoryBattlePath(path, 'encounter') || validStoryBattlePath(path, 'deck')
    || path === STORY_ASSET_MANIFEST_PATH || path === STORY_CATALOG_PATH || path === CARD_UNITS_PATH || path === STORY_NPC_CATALOG_PATH || path === STORY_ITEM_CATALOG_PATH || path === STORY_QUEST_CATALOG_PATH;
}
export async function storyTargetBaseRevision(root: string, baseDependencies: Array<{ path: string; revision: string | null }>): Promise<string> {
  return digest(stable(await Promise.all(baseDependencies.map(async item => ({ path: item.path, revision: await fileHash(join(root, item.path)) })))));
}
export function candidateAssetPaths(candidate: GameCandidateRecord): string[] {
  const cardPaths = new Set<string>(Object.values(CARD_COLLECTIONS).map(item => item.path));
  return candidate.dependencies.map(item => item.path).filter(path => !cardPaths.has(path) && path !== CARD_ASSET_MANIFEST_PATH && path !== CARD_STARTER_DECK_PATH && path !== CARD_BATTLE_LOADOUT_PATH);
}
export function candidateCardKind(candidate: GameCandidateRecord): CardKind {
  const kinds = (Object.entries(CARD_COLLECTIONS) as Array<[CardKind, typeof CARD_COLLECTIONS[CardKind]]>)
    .filter(([, collection]) => candidate.dependencies.some(item => item.path === collection.path))
    .map(([kind]) => kind);
  if (kinds.length !== 1) throw Error('候选卡牌定义依赖不唯一');
  return kinds[0]!;
}
export async function cardTargetBaseRevision(root: string, cardId: string, assetPaths: string[], kind: CardKind = 'unit'): Promise<string> {
  const collection = cardCollection(kind);
  const source = JSON.parse(await readFile(join(root, collection.path), 'utf8')) as Record<string, Array<Record<string, unknown>>>;
  const card = source[collection.key]?.find(item => item.id === cardId);
  const manifest = JSON.parse(await readFile(join(root, CARD_ASSET_MANIFEST_PATH), 'utf8').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '{"assets":[]}';
    throw error;
  })) as { assets?: Array<Record<string, unknown>> };
  const deck = collection.inDeck ? JSON.parse(await readFile(join(root, CARD_STARTER_DECK_PATH), 'utf8')) as { cards?: Array<{id: string; count: number}> } : undefined;
  const loadout = collection.inDeck ? undefined : await readFile(join(root, CARD_BATTLE_LOADOUT_PATH));
  if (deck && !Array.isArray(deck.cards)) throw Error('默认卡组格式无效');
  return digest(stable({
    card: card ? digest(JSON.stringify(card)) : null,
    deckCard: deck?.cards?.find(item => item.id === cardId) ?? null,
    ...(loadout ? { loadout: digest(loadout) } : {}),
    assets: await Promise.all(assetPaths.map(async path => ({ path, file: await fileHash(join(root, path)), entry: manifest.assets?.find(item => item.path === path) ?? null }))),
  }));
}

export interface GameCandidateServiceOptions {
  dataRoot: string;
  projects: Array<{ id: string; root: string }>;
  content: ContentService;
  workflow: WorkflowService;
  registerPreview?: (candidate: GameCandidateRecord) => Promise<unknown>;
  deckPreviewAdapter?: string;
}

/** A snapshot of one card and the five asset files it needs to run. */
export function createGameCandidateService(options: GameCandidateServiceOptions) {
  const roots = new Map(options.projects.map(project => [project.id, resolve(project.root)]));
  const root = resolve(options.dataRoot, 'game-candidates');
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => { const next = queue.then(operation); queue = next.catch(() => undefined); return next; };
  const registerPreview = async (candidate: GameCandidateRecord): Promise<void> => {
    if (!options.registerPreview) return;
    try {
      await options.registerPreview(candidate);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw Error(`候选 ${candidate.id}（提交 ${candidate.commit}）已保存，但试玩登记失败：${reason}。核对试玩便笺后，用新的请求标识重试同一内容可复用候选。`);
    }
  };
  const project = (projectId: string) => {
    const path = roots.get(projectId);
    if (!path) throw Error(`未登记的游戏项目：${projectId}`);
    return path;
  };
  const candidatePath = (projectId: string, id: string) => resolve(root, safe(projectId), safe(id));

  async function stageCard(input: { projectId: string; productionId: string; cardId: string; featureId: string; baseRevision: number }): Promise<{ candidate: GameCandidateRecord; production: ProductionRecord; reused?: boolean }> {
    const { projectId, productionId, cardId } = input;
    const featureId = input.featureId?.trim();
    if (!featureId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(featureId)) throw Error('制作候选需要已有功能项的 featureId');
    const detail = await options.workflow.query({ projectId, op: 'production', productionId }) as { production: ProductionRecord };
    const production = detail.production;
    if (production.revision !== input.baseRevision) throw Error('制作单已变化，请刷新后重试');
    const batch = production.batch as CardBatch | undefined;
    const card = batch?.kind === 'card-generation' ? batch.cards.find(item => item.definition.id === cardId) : undefined;
    if (!card?.assembly || card.assembly.fingerprint !== faceFingerprint(card) || !card.art || card.art.fingerprint !== artFingerprint(card)) throw Error('卡牌与两套主题尚未完成当前版本组装');
    const collection = cardCollection(card.definition.kind);
    if (production.featureId !== featureId) throw Error('制作单绑定的功能项与候选要求不一致');
    const fingerprint = candidateFingerprint(card, featureId);
    const source = project(projectId);
    const sourceTree = await gameRuntimeSnapshotTree(source);
    const slot = candidateSlot(`card-${digest(stable({ projectId, productionId, cardId, fingerprint, sourceTree })).slice(0, 36)}`, production.gameCandidates);
    const { id, previous } = slot;
    if (previous) { await registerPreview(previous); return { candidate: previous, production, reused: true }; }
    const directory = candidatePath(projectId, id);
    const checkout = join(directory, 'repo');
    await mkdir(dirname(directory), { recursive: true });
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    let persisted = false;
    try {
      await sourceSnapshot(source, checkout);
      if (await runtimeTree(checkout) !== sourceTree) throw Error('游戏源码在建立候选时已变化，请重试');
      const scoped = createContentService({ dataRoot: join(directory, 'content'), projects: [{ id: projectId, root: checkout }] });
      const paths: string[] = [];
      try {
        const adopt = async (sourceId: string, name: string): Promise<string> => {
          const original = await options.content.resolveMedia({ projectId, op: 'media', id: sourceId, variant: 'original' });
          const bytes = await readFile(original.absolutePath);
          const [registered] = await scoped.command('registerCandidates', { projectId, candidates: [{ name: `${cardId}-${name}.png`, mimeType: 'image/png', base64: bytes.toString('base64'), metadata: { purpose: 'card-face', provider: 'codex' } }] }) as Array<{ id: string }>;
          const asset = await scoped.command('adoptVersion', { projectId, candidateId: registered!.id,
            path: `public/assets/card-faces/${cardId}/${card.assembly!.fingerprint.slice(0, 20)}-${name}.png` }) as { path: string };
          paths.push(asset.path);
          return '/' + asset.path.replace(/^public\//, '');
        };
        const variants: Record<string, { texture: string; preview: string; templateVersion: number }> = {};
        for (const [themeId, variant] of Object.entries(card.assembly.variants)) variants[themeId] = {
          texture: await adopt(variant.runtimeId, `${themeId}-runtime`),
          preview: await adopt(variant.previewId, `${themeId}-preview`),
          templateVersion: CARD_FACE_VERSION,
        };
        const cardFace = { schemaVersion: 1, themeId: card.presentation.themeId, artwork: await adopt(card.art.id, 'art'), fingerprint: card.assembly.fingerprint, variants };
        const desired = { ...card.definition, cardFace };
        let existing: CardItem | undefined;
        try { existing = await scoped.query({ projectId, op: 'card', id: cardId }) as CardItem; }
        catch (error) { if ((error as { code?: string }).code !== 'NOT_FOUND') throw error; }
        if ((existing?.revision ?? null) !== (card.sourceRevision ?? null)) throw Error('正式卡牌基线已变化，请重新建立候选');
        await scoped.command('savePipelineCard', { projectId, card: desired, expectedRevision: existing?.revision ?? null });
        if (collection.inDeck) {
          const deckPath = join(checkout, CARD_STARTER_DECK_PATH);
          const deck = JSON.parse(await readFile(deckPath, 'utf8')) as { cards?: Array<{id: string; count: number}> };
          if (!Array.isArray(deck.cards)) throw Error('默认卡组格式无效');
          if (batch?.companion) {
            const paired = await scoped.query({ projectId, op: 'card', id: batch.companion.cardId }) as CardItem;
            if (paired.kind !== 'unit' || paired.revision !== batch.companion.revision) throw Error('配套单位在建立候选前已变化，请重新核对');
            const desiredCounts = [
              { id: paired.id, count: Math.min(3, Number(paired.json?.limitPerDeck ?? 3)) },
              { id: cardId, count: Math.min(3, Number(card.definition.limitPerDeck ?? 3)) },
            ];
            const otherCount = deck.cards.filter(item => !desiredCounts.some(entry => entry.id === item.id)).reduce((sum, item) => sum + item.count, 0);
            if (otherCount + desiredCounts.reduce((sum, item) => sum + item.count, 0) > 30) throw Error('加入配套卡后超过 30 张，请先调整现有起始牌组');
            for (const entry of desiredCounts) {
              const current = deck.cards.find(item => item.id === entry.id);
              if (current) current.count = Math.max(current.count, entry.count); else deck.cards.push(entry);
            }
            await writeFile(deckPath, JSON.stringify(deck, null, 2) + '\n');
          } else if (!deck.cards.some(item => item.id === cardId)) {
            deck.cards.push({ id: cardId, count: 1 });
            await writeFile(deckPath, JSON.stringify(deck, null, 2) + '\n');
          }
        } else {
          const loadoutPath = join(checkout, CARD_BATTLE_LOADOUT_PATH);
          const loadout = JSON.parse(await readFile(loadoutPath, 'utf8')) as Record<string, unknown>;
          const key = card.definition.kind === 'pill' ? 'pillIds' : 'skillIds';
          const ids = loadout[key];
          if (loadout.schemaVersion !== 1 || !Array.isArray(ids) || ids.length > 3 || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw Error('战斗初始配置格式无效');
          if (!ids.includes(cardId)) {
            if (ids.length === 3) throw Error(`${key} 已满，请先在游戏配置中释放槽位`);
            ids.push(cardId);
            await writeFile(loadoutPath, JSON.stringify(loadout, null, 2) + '\n');
          }
        }
      } finally { await scoped.close(); }
      const cardPath = collection.path;
      const manifestPath = CARD_ASSET_MANIFEST_PATH;
      const entryPath = collection.inDeck ? CARD_STARTER_DECK_PATH : CARD_BATTLE_LOADOUT_PATH;
      const dependencies = await Promise.all([...new Set([cardPath, manifestPath, entryPath, ...paths])].map(async path => ({ path, revision: (await fileHash(join(checkout, path)))! })));
      await git(checkout, 'add', '-A');
      if (await git(checkout, 'status', '--porcelain')) await git(checkout, '-c', 'user.name=Worka Candidate', '-c', 'user.email=worka-candidate@local.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', `CardGame candidate ${cardId}`);
      const commit = await git(checkout, 'rev-parse', 'HEAD');
      if (!/^[0-9a-f]{40}$/.test(commit)) throw Error('候选没有确切提交');
      const targetBaseRevision = await cardTargetBaseRevision(source, cardId, paths, card.definition.kind as CardKind);
      const validationManifest = digest(stable({ commit, checks: ['game-shell', 'content-catalog', 'card-definition', 'card-themes', collection.inDeck ? 'playable-deck' : 'playable-loadout'] }));
      const candidateHash = digest(stable({ commit, fingerprint, sourceTree, sourceSnapshotScope: 'runtime', targetBaseRevision, validationManifest, dependencies }));
      const at = new Date().toISOString();
      const candidate: GameCandidateRecord = { id, projectId, productionId, cardId, featureId, fingerprint, sourceSnapshotTree: sourceTree, sourceSnapshotScope: 'runtime', candidateHash, commit, repo: checkout, targetBaseRevision, validationManifest, dependencies, status: 'candidate', createdAt: at, updatedAt: at };
      const recorded = await options.workflow.command('recordGameCandidate', { projectId, productionId, baseRevision: production.revision, candidate }) as { production: ProductionRecord; candidate: GameCandidateRecord };
      persisted = true;
      await registerPreview(recorded.candidate);
      return recorded;
    } catch (error) {
      if (!persisted) await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async function stageDeck(input: { projectId: string; productionId: string; featureId: string; baseRevision: number }) {
    const { projectId, productionId } = input;
    const { production } = await options.workflow.query({ projectId, op: 'production', productionId }) as { production: ProductionRecord };
    if (production.revision !== input.baseRevision) throw Error('制作单已变化，请刷新后重试');
    const batch = production.batch as CardBatch | undefined;
    if (!batch?.deck) throw Error('制作单没有独立牌组方案');
    const plan = batch.deck;
    const report = inspectDeck(batch.cards, plan, production.brief, production.gameCandidates);
    if (!report.legal || !report.confirmed) throw Error('请先补齐并由用户确认当前整套草案；上游修改后需要重新核对');
    if (!input.featureId || input.featureId !== production.featureId) throw Error('整套候选需要制作单对应的功能项');
    const cards = plan.entries.map(entry => batch.cards.find(card => card.definition.id === entry.cardId)!);
    cards.forEach(card => validateCard(card.definition));
    const artMode = cards.some(card => Boolean(card.art || card.artRequest || card.assembly));
    if (artMode && cards.some(card => !card.art || card.art.fingerprint !== artFingerprint(card) || card.assembly?.fingerprint !== faceFingerprint(card))) throw Error('整套插画和两套卡面尚未全部完成当前版本组装');
    const artHashes = artMode ? deckArtFingerprints(batch.cards, plan) : undefined;
    const fingerprint = artMode ? digest(stable({ logic: report.fingerprint, art: artHashes })) : report.fingerprint;
    const adopted = production.gameCandidates?.filter(item => item.kind === 'deck' && item.targetId === plan.id).at(-1);
    if (adopted?.status === 'adopted' && adopted.fingerprint === fingerprint) return { candidate: adopted, production, reused: true };
    const source = project(projectId);
    for (const card of cards) {
      let existing: CardItem | undefined;
      try { existing = await options.content.query({ projectId, op: 'card', id: String(card.definition.id), freshKind: String(card.definition.kind) }) as CardItem; }
      catch (error) { if (!['NOT_FOUND', 'not-found'].includes((error as any).code)) throw error; }
      const revision = artMode ? batch.artBaseline?.cardRevisions[card.definition.id] ?? card.sourceRevision : card.sourceRevision;
      if (revision ? existing?.revision !== revision : Boolean(existing)) throw Error(`卡牌 ${card.definition.id} 的来源已变化或新 ID 已存在`);
    }
    const entryPath = deckPath(plan);
    const collections = [...new Set(cards.map(card => cardCollection(card.definition.kind).path))];
    const assetPaths = artMode ? cards.flatMap(card => ['jade-runtime','jade-preview','scroll-runtime','scroll-preview','art'].map(name => `public/assets/card-faces/${card.definition.id}/${card.assembly!.fingerprint.slice(0,20)}-${name}.png`)) : [];
    const paths = [...collections, entryPath, CARD_STARTER_DECK_PATH, ...(artMode ? [CARD_ASSET_MANIFEST_PATH, ...assetPaths] : [])];
    const baseDependencies = await Promise.all(paths.map(async path => ({ path, revision: await fileHash(join(source, path)) })));
    if (baseDependencies.find(item => item.path === entryPath)?.revision) {
      if (!artMode || !batch.artBaseline) throw Error('独立牌组目标已存在，请在新制作单使用另一个 ID');
      const existingDeck = JSON.parse(await readFile(join(source, entryPath), 'utf8'));
      if (existingDeck.id !== plan.id || stable(existingDeck.cards) !== stable(plan.entries.map(entry => ({ id: entry.cardId, count: entry.count })))) throw Error('正式牌组的副本计划已变化，请先核对');
    }
    const targetBaseRevision = await storyTargetBaseRevision(source, baseDependencies);
    const sourceTree = await gameRuntimeSnapshotTree(source);
    const { id, previous } = candidateSlot(`deck-${digest(stable({ projectId, productionId, fingerprint, sourceTree, targetBaseRevision })).slice(0, 36)}`, production.gameCandidates);
    if (previous) { await registerPreview(previous); return { candidate: previous, production, reused: true }; }
    const directory = candidatePath(projectId, id), checkout = join(directory, 'repo');
    await mkdir(dirname(directory), { recursive: true });
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    let persisted = false;
    try {
      await sourceSnapshot(source, checkout);
      if (await runtimeTree(checkout) !== sourceTree || await storyTargetBaseRevision(checkout, baseDependencies) !== targetBaseRevision) throw Error('游戏或牌组来源在建立候选时变化，请刷新重试');
      const scoped = createContentService({ dataRoot: join(directory, 'content'), projects: [{ id: projectId, root: checkout }] });
      try {
        for (const card of cards) {
          let existing: CardItem | undefined;
          try { existing = await scoped.query({ projectId, op: 'card', id: String(card.definition.id) }) as CardItem; }
          catch (error) { if (!['NOT_FOUND', 'not-found'].includes((error as any).code)) throw error; }
          const { cardFace: _face, ...definition } = card.definition;
          let desired = definition;
          if (artMode) {
            const adopt = async (sourceId: string, name: string) => {
              const original = await options.content.resolveMedia({ projectId, op: 'media', id: sourceId, variant: 'original' });
              const [registered] = await scoped.command('registerCandidates', { projectId, candidates: [{ name: `${card.definition.id}-${name}.png`, mimeType: 'image/png', base64: (await readFile(original.absolutePath)).toString('base64'), metadata: { purpose: 'card-face', provider: 'codex' } }] }) as Array<{id:string}>;
              const asset = await scoped.command('adoptVersion', { projectId, candidateId: registered!.id, path: `public/assets/card-faces/${card.definition.id}/${card.assembly!.fingerprint.slice(0,20)}-${name}.png` }) as {path:string};
              return '/' + asset.path.replace(/^public\//, '');
            };
            const variants: Record<string, any> = {};
            for (const [themeId, variant] of Object.entries(card.assembly!.variants)) variants[themeId] = { texture: await adopt(variant.runtimeId, `${themeId}-runtime`), preview: await adopt(variant.previewId, `${themeId}-preview`), templateVersion: CARD_FACE_VERSION };
            desired = { ...definition, cardFace: { schemaVersion: 1, themeId: card.presentation.themeId, artwork: await adopt(card.art!.id, 'art'), fingerprint: card.assembly!.fingerprint, variants } };
          }
          await scoped.command('savePipelineCard', { projectId, card: desired, expectedRevision: existing?.revision ?? null });
        }
      } finally { await scoped.close(); }
      if (options.deckPreviewAdapter) {
        const path=join(checkout,'knowledge/tools/preview/preview.config.mjs');await mkdir(dirname(path),{recursive:true});await cp(options.deckPreviewAdapter,path);
      }
      const starter = JSON.parse(await readFile(join(checkout, CARD_STARTER_DECK_PATH), 'utf8'));
      const deck = { ...starter, id: plan.id, name: plan.title, description: production.brief,
        cards: plan.entries.map(entry => ({ id: entry.cardId, count: entry.count })) };
      await writeFile(join(checkout, entryPath), JSON.stringify(deck, null, 2) + '\n');
      // Only the isolated preview starts with this deck. Formal adoption excludes it.
      await writeFile(join(checkout, CARD_STARTER_DECK_PATH), JSON.stringify(deck, null, 2) + '\n');
      const dependencies = await Promise.all(paths.map(async path => ({ path, revision: (await fileHash(join(checkout, path)))! })));
      const changedPaths = dependencies.filter(item => item.path !== CARD_STARTER_DECK_PATH && item.revision !== baseDependencies.find(base => base.path === item.path)?.revision).map(item => item.path);
      await git(checkout, 'add', '-A');
      await git(checkout, '-c', 'user.name=Worka Candidate', '-c', 'user.email=worka-candidate@local.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', `CardGame independent deck ${plan.id}`);
      const commit = await git(checkout, 'rev-parse', 'HEAD');
      const at = new Date().toISOString();
      const candidate: GameCandidateRecord = { id, projectId, productionId, cardId: plan.id, kind: 'deck', targetId: plan.id,
        deckPath: entryPath, deckCardIds: plan.entries.map(entry => entry.cardId), deckCardFingerprints: deckCardFingerprints(batch.cards, plan),
        placeholderCardIds: artMode ? [] : plan.entries.map(entry => entry.cardId), ...(artMode ? { deckLogicFingerprint: report.fingerprint, deckArtFingerprints: artHashes } : {}), featureId: input.featureId, fingerprint,
        sourceSnapshotTree: sourceTree, sourceSnapshotScope: 'runtime', candidateHash: '', commit, repo: checkout,
        targetBaseRevision, validationManifest: digest(stable({ commit, checks: ['game-shell', 'content-catalog', 'deck-definition', 'deck-composition', ...(artMode ? ['deck-art'] : [])] })),
        dependencies, baseDependencies, changedPaths, status: 'candidate', createdAt: at, updatedAt: at };
      candidate.candidateHash = deckCandidateHash(candidate);
      const recorded = await options.workflow.command('recordGameCandidate', { projectId, productionId, baseRevision: production.revision, candidate }) as { candidate: GameCandidateRecord; production: ProductionRecord };
      persisted = true;
      await registerPreview(recorded.candidate);
      return recorded;
    } catch (error) {
      if (!persisted) await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async function stageStory(input: {
    projectId: string; featureId: string; storyId: string; entryPath: string; brief: string;
    documents: Array<{ path: string; content: string; expectedRevision?: string | null }>;
    /** Ordinary Markdown index and reference pages; scene files belong in documents. */
    referenceDocuments?: Array<{ path: string; content: string; expectedRevision?: string | null }>;
    assets?: Array<{ candidateId: string; path: string }>;
    npcs?: Array<{ id: string; name: string; description?: string; goal?: string; roles?: string[]; tags?: string[]; abilities?: Record<string, number>; portraitAsset?: string }>;
    items?: Array<{ id: string; name: string; itemType: 'artifact' | 'tool' | 'consumable' | 'material' | 'quest'; grade?: string; type?: string; description?: string; iconAsset?: string; droppable?: boolean; equipSlot?: string; attributeModifiers?: Record<string, number>; useEffect?: { kind: 'heal'; amount: number } }>;
    shops?: StoryShopInput[];
    recipes?: StoryRecipe[];
    quests?: StoryQuest[];
    copyEdits?: StoryCopyEdit[];
    launch?: { hubPath: string; locationId: string; actionId: string; label: string };
  }): Promise<{ candidate: GameCandidateRecord; production: ProductionRecord; reused?: boolean }> {
    const projectId = input.projectId;
    const source = project(projectId);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.featureId ?? '')) throw Error('剧情候选需要已有功能项的 featureId');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.storyId ?? '')) throw Error('剧情 storyId 格式无效');
    if (!validStorySourcePath(input.entryPath)) throw Error('剧情入口必须是 knowledge/ 下的 Markdown 场景');
    if (!input.brief?.trim()) throw Error('剧情候选需要创作目标');
    if (!Array.isArray(input.documents) || input.documents.length > 64) throw Error('场景文档清单无效');
    if (input.referenceDocuments !== undefined && !Array.isArray(input.referenceDocuments)) throw Error('资料文档清单无效');
    const referenceDocuments = input.referenceDocuments ?? [];
    if (input.documents.length + referenceDocuments.length < 1 || input.documents.length + referenceDocuments.length > 64) throw Error('剧情与资料文档每批合计需有 1–64 篇');
    const unique = new Set<string>();
    for (const doc of [...input.documents, ...referenceDocuments]) {
      if (!doc || typeof doc.path !== 'string' || !validStorySourcePath(doc.path) || unique.has(doc.path) || typeof doc.content !== 'string' || doc.content.length > 1_000_000) throw Error(`剧情文档路径、内容或大小无效：${doc?.path}`);
      unique.add(doc.path);
    }
    for (const doc of referenceDocuments) if (frontmatterHasScene(doc.content)) throw Error(`资料文档不能包含 scene: true：${doc.path}`);
    if (input.npcs && (!Array.isArray(input.npcs) || input.npcs.length > 16)) throw Error('剧情候选每批最多新增 16 位人物');
    const npcIds = new Set<string>();
    for (const npc of input.npcs ?? []) {
      if (!npc || !/^npc[._][A-Za-z0-9._-]{1,126}$/u.test(npc.id) || npcIds.has(npc.id)
        || typeof npc.name !== 'string' || !npc.name.trim() || npc.name.length > 80
        || npc.description !== undefined && (typeof npc.description !== 'string' || npc.description.length > 5000)
        || npc.goal !== undefined && (typeof npc.goal !== 'string' || npc.goal.length > 500)
        || npc.portraitAsset !== undefined && (typeof npc.portraitAsset !== 'string' || !validStoryAssetPath(`public/${npc.portraitAsset}`))
        || [npc.roles, npc.tags].some(list => list !== undefined && (!Array.isArray(list) || list.length > 16 || list.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)))
        || npc.abilities !== undefined && (!npc.abilities || typeof npc.abilities !== 'object' || Array.isArray(npc.abilities)
          || Object.entries(npc.abilities).some(([key, value]) => !key.trim() || !Number.isFinite(value)))) throw Error(`新增人物定义无效：${npc?.id}`);
      npcIds.add(npc.id);
    }
    if (input.items && (!Array.isArray(input.items) || input.items.length > 16)) throw Error('剧情候选每批最多新增 16 件道具');
    const newItemIds = new Set<string>();
    for (const item of input.items ?? []) {
      if (!item || !/^[A-Za-z][A-Za-z0-9._-]{1,127}$/u.test(item.id) || newItemIds.has(item.id)
        || !['artifact', 'tool', 'consumable', 'material', 'quest'].includes(item.itemType)
        || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
        || [item.grade, item.type].some(value => value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 80))
        || item.description !== undefined && (typeof item.description !== 'string' || item.description.length > 5000)
        || item.iconAsset !== undefined && (typeof item.iconAsset !== 'string' || !validItemIconAssetPath(`public/${item.iconAsset}`))
        || item.droppable !== undefined && typeof item.droppable !== 'boolean'
        || item.equipSlot !== undefined && (item.itemType !== 'artifact' && item.itemType !== 'tool'
          || typeof item.equipSlot !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(item.equipSlot)
          || ['__proto__', 'constructor', 'prototype'].includes(item.equipSlot))
        || item.attributeModifiers !== undefined && (item.equipSlot === undefined || !item.attributeModifiers
          || typeof item.attributeModifiers !== 'object' || Array.isArray(item.attributeModifiers)
          || Object.keys(item.attributeModifiers).length === 0
          || Object.entries(item.attributeModifiers).some(([attribute, delta]) => !attribute.trim()
            || ['__proto__', 'constructor', 'prototype'].includes(attribute)
            || !Number.isFinite(delta) || Math.abs(delta) > 100))
        || item.useEffect !== undefined && (item.itemType !== 'consumable'
          || !item.useEffect || typeof item.useEffect !== 'object' || Array.isArray(item.useEffect)
          || Object.keys(item.useEffect).length !== 2 || item.useEffect.kind !== 'heal'
          || !Number.isSafeInteger(item.useEffect.amount) || item.useEffect.amount < 1 || item.useEffect.amount > 100)) throw Error(`新增道具定义无效：${item?.id}`);
      newItemIds.add(item.id);
    }
    validateStoryShops(input.shops);
    validateStoryRecipes(input.recipes);
    validateStoryQuests(input.quests);
    validateStoryCopyEdits(input.copyEdits);
    const copyPaths = input.copyEdits?.map(edit => edit.path) ?? [];
    for (const edit of input.copyEdits ?? []) {
      if (await fileHash(await candidateFile(source, edit.path)) !== edit.expectedRevision) {
        throw Error(`剧情文案源文件已变化：${edit.path}`);
      }
    }
    if (input.assets && (!Array.isArray(input.assets) || input.assets.length > 8)) throw Error('剧情素材每批最多 8 个');
    const assetPaths = new Set<string>();
    for (const asset of input.assets ?? []) {
      if (!asset?.candidateId?.trim() || !(validStoryAssetPath(asset.path) || validItemIconAssetPath(asset.path)) || assetPaths.has(asset.path)) throw Error(`剧情素材来源或目标路径无效：${asset?.path}`);
      assetPaths.add(asset.path);
      if (await fileHash(join(source, asset.path))) throw Error(`剧情素材目标路径已存在，请使用新的版本路径：${asset.path}`);
    }
    if (input.launch && (!/^public\/data\/hub\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/u.test(input.launch.hubPath)
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.launch.actionId)
      || !input.launch.locationId?.trim() || !input.launch.label?.trim())) throw Error('剧情 Hub 入口无效');
    const productionId = `story-${digest(stable({ projectId, featureId: input.featureId, storyId: input.storyId })).slice(0, 24)}`;
    const created = await options.workflow.command('createProduction', { projectId, id: productionId, brief: input.brief, featureId: input.featureId }) as { production: ProductionRecord };
    if (created.production.featureId !== input.featureId) throw Error('剧情制作单属于另一个功能项');
    const tempDirectory = candidatePath(projectId, `building-${randomUUID()}`);
    const tempCheckout = join(tempDirectory, 'repo');
    await mkdir(dirname(tempDirectory), { recursive: true });
    let moved = false;
    try {
      await mkdir(tempDirectory, { recursive: true });
      await sourceSnapshot(source, tempCheckout);
      const sourceTree = await runtimeTree(tempCheckout);
      for (const edit of input.copyEdits ?? []) {
        if (await fileHash(await candidateFile(tempCheckout, edit.path)) !== edit.expectedRevision) {
          throw Error(`隔离副本与剧情文案源文件不一致：${edit.path}`);
        }
      }
      if (input.npcs?.length) {
        const path = join(tempCheckout, STORY_NPC_CATALOG_PATH);
        const catalog = JSON.parse(await readFile(path, 'utf8')) as { npcs?: Array<{ id: string; [key: string]: unknown }> };
        if (!Array.isArray(catalog.npcs)) throw Error('游戏人物目录格式无效');
        for (const npc of input.npcs) {
          if (catalog.npcs.some(item => item.id === npc.id)) throw Error(`人物 ID 已存在：${npc.id}`);
          catalog.npcs.push({ id: npc.id, name: npc.name.trim(),
            ...(npc.description ? { description: npc.description } : {}), ...(npc.goal ? { goal: npc.goal } : {}),
            ...(npc.roles ? { roles: [...npc.roles] } : {}), ...(npc.tags ? { tags: [...npc.tags] } : {}),
            ...(npc.abilities ? { abilities: { ...npc.abilities } } : {}),
            ...(npc.portraitAsset ? { portraitAsset: npc.portraitAsset } : {}) });
        }
        await writeFile(path, JSON.stringify(catalog, null, 2) + '\n');
      }
      if (input.items?.length) {
        const path = join(tempCheckout, STORY_ITEM_CATALOG_PATH);
        const catalog = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
        const fields = { artifact: 'artifacts', tool: 'tools', consumable: 'consumables', material: 'materials', quest: 'questItems' } as const;
        const known = new Set<string>();
        for (const field of ['artifacts', 'tools', 'consumables', 'materials', 'quests', 'questItems']) {
          const entries = catalog[field];
          if (entries !== undefined && !Array.isArray(entries)) throw Error('游戏道具目录格式无效');
          for (const entry of (entries ?? []) as Array<{ id?: string }>) {
            if (typeof entry?.id !== 'string' || known.has(entry.id)) throw Error(`游戏道具 ID 重复或无效：${entry?.id}`);
            known.add(entry.id);
          }
        }
        for (const item of input.items) {
          if (known.has(item.id)) throw Error(`道具 ID 已存在：${item.id}`);
          const field = fields[item.itemType];
          const entries = (catalog[field] ??= []) as Array<Record<string, unknown>>;
          entries.push({ id: item.id, name: item.name.trim(),
            ...(item.grade ? { grade: item.grade.trim() } : {}), ...(item.type ? { type: item.type.trim() } : {}),
            ...(item.description ? { description: item.description } : {}),
            ...(item.iconAsset ? { iconAsset: item.iconAsset } : {}),
            ...(item.droppable !== undefined ? { droppable: item.droppable } : {}),
            ...(item.equipSlot ? { equipSlot: item.equipSlot } : {}),
            ...(item.attributeModifiers ? { attributeModifiers: { ...item.attributeModifiers } } : {}) });
          if (item.useEffect) entries[entries.length - 1]!.useEffect = { kind: 'heal', amount: item.useEffect.amount };
          known.add(item.id);
        }
        await writeFile(path, JSON.stringify(catalog, null, 2) + '\n');
      }
      if (input.recipes?.length) {
        const path = await candidateFile(tempCheckout, STORY_ITEM_CATALOG_PATH);
        const catalog = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
        const known = new Map<string, string>();
        for (const [field, kind] of [['artifacts', 'artifact'], ['tools', 'tool'], ['consumables', 'consumable'], ['materials', 'material'], ['quests', 'quest'], ['questItems', 'quest']] as const) {
          const entries = catalog[field];
          if (entries !== undefined && !Array.isArray(entries)) throw Error('游戏道具目录格式无效');
          for (const item of (entries ?? []) as Array<{ id?: string }>) {
            if (!item?.id || known.has(item.id)) throw Error(`游戏道具 ID 重复或无效：${item?.id}`);
            known.set(item.id, kind);
          }
        }
        if (catalog.recipes !== undefined && !Array.isArray(catalog.recipes)) throw Error('游戏制作配方目录格式无效');
        const recipes = (catalog.recipes ??= []) as StoryRecipe[];
        const recipeIds = new Set<string>();
        for (const recipe of recipes) {
          if (!recipe?.id || recipeIds.has(recipe.id)) throw Error(`游戏制作配方 ID 重复或无效：${recipe?.id}`);
          recipeIds.add(recipe.id);
        }
        for (const recipe of input.recipes) {
          for (const item of [...recipe.cost.items, ...recipe.rewards.items]) {
            if (known.get(item.id) !== item.itemType) throw Error(`制作配方引用不存在或类型不符的道具：${item.id}`);
          }
          const next = { ...recipe, name: recipe.name.trim(),
            cost: { spiritStones: recipe.cost.spiritStones, items: recipe.cost.items.map(item => ({ ...item })) },
            rewards: { items: recipe.rewards.items.map(item => ({ ...item })) } };
          const index = recipes.findIndex(item => item.id === recipe.id);
          if (index < 0) recipes.push(next);
          else recipes[index] = next;
        }
        await writeFile(path, JSON.stringify(catalog, null, 2) + '\n');
      }
      if (input.quests?.length) {
        const path = await candidateFile(tempCheckout, STORY_QUEST_CATALOG_PATH);
        const catalog = JSON.parse(await readFile(path, 'utf8')) as { schemaVersion?: number; quests?: StoryQuest[] };
        if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.quests)) throw Error('游戏任务目录格式无效');
        const known = new Set<string>();
        for (const quest of catalog.quests) {
          if (!quest?.id || known.has(quest.id)) throw Error(`游戏任务 ID 重复或无效：${quest?.id}`);
          known.add(quest.id);
        }
        for (const quest of input.quests) {
          const next = { id: quest.id, title: quest.title.trim(), summary: quest.summary.trim(), actorIds: [...quest.actorIds],
            stages: quest.stages.map(stage => ({ ...stage, label: stage.label.trim(), objective: stage.objective.trim() })) };
          const index = catalog.quests.findIndex(item => item.id === quest.id);
          if (index < 0) catalog.quests.push(next);
          else catalog.quests[index] = next;
        }
        await writeFile(path, JSON.stringify(catalog, null, 2) + '\n');
      }
      const scoped = createContentService({ dataRoot: join(tempDirectory, 'content'), projects: [{ id: projectId, root: tempCheckout }] });
      let build: CompileStoryResult;
      let sources: string[];
      try {
        for (const asset of input.assets ?? []) {
          const original = await options.content.resolveMedia({ projectId, op: 'media', id: asset.candidateId, variant: 'original' });
          if (original.mimeType !== 'image/png') throw Error(`剧情素材必须为 PNG：${asset.path}`);
          const bytes = await readFile(original.absolutePath);
          const purpose = validItemIconAssetPath(asset.path) ? 'item-icon'
            : input.npcs?.some(npc => `public/${npc.portraitAsset}` === asset.path) ? 'story-portrait' : 'story-scene';
          const [registered] = await scoped.command('registerCandidates', { projectId, candidates: [{ name: asset.path.split('/').at(-1)!, mimeType: 'image/png', base64: bytes.toString('base64'), metadata: { ...original.metadata, purpose } }] }) as Array<{ id: string }>;
          const adopted = await scoped.command('adoptVersion', { projectId, candidateId: registered!.id, path: asset.path }) as { path: string };
          if (adopted.path !== asset.path || !await fileHash(join(tempCheckout, asset.path))) throw Error(`剧情素材未写入预期路径：${asset.path}`);
        }
        for (const doc of [...input.documents, ...referenceDocuments]) {
          const original = await options.content.query({ projectId, op: 'document', path: doc.path }).catch(error => {
            if ((error as { code?: string }).code === 'NOT_FOUND') return null;
            throw error;
          }) as { revision?: string; content?: string } | null;
          if ((original?.revision ?? null) !== (doc.expectedRevision ?? null)) throw Error(`剧情源文档已变化：${doc.path}`);
          if (referenceDocuments.includes(doc) && original?.content && frontmatterHasScene(original.content)) throw Error(`已有场景不能作为普通资料修改：${doc.path}`);
          const cloneDoc = await scoped.query({ projectId, op: 'document', path: doc.path }).catch(error => {
            if ((error as { code?: string }).code === 'NOT_FOUND') return null;
            throw error;
          }) as { revision?: string } | null;
          if ((cloneDoc?.revision ?? null) !== (doc.expectedRevision ?? null)) throw Error(`隔离副本与剧情源文档不一致：${doc.path}`);
          await scoped.command('saveDocument', { projectId, path: doc.path, content: doc.content, expectedRevision: cloneDoc?.revision ?? null });
        }
        build = await scoped.command('compileStory', { projectId, entry: input.entryPath, storyId: input.storyId }) as CompileStoryResult;
        if (build.diagnostics.some(item => item.severity === 'error')) throw Error(`剧情编译未通过：${build.diagnostics.filter(item => item.severity === 'error').map(item => `${item.path}: ${item.detail}`).join('；')}`);
        const builds = await scoped.query({ projectId, op: 'storyBuilds', limit: 100 }) as Page<StoryBuildItem>;
        sources = builds.items.find(item => item.storyId === input.storyId)?.sourcePaths ?? [];
        if (!sources.length) throw Error('剧情编译没有登记源文件');
        const reachable = new Set(sources);
        const unrelated = input.documents.find(doc => !reachable.has(doc.path));
        if (unrelated) throw Error(`剧情文档不属于本次可达场景：${unrelated.path}`);
      } finally { await scoped.close(); }
      const publicPath = build.outputPath.replace(/^public\//u, '');
      let hubPath: string | undefined;
      let entryHubId: string | undefined;
      let entryActionId: string | undefined;
      const catalog = JSON.parse(await readFile(join(tempCheckout, STORY_CATALOG_PATH), 'utf8')) as {
        resources?: Array<{ resourceId?: string; kind?: string; publicPath?: string }>;
      };
      if (input.launch) {
        hubPath = input.launch.hubPath;
        const path = join(tempCheckout, hubPath);
        const hub = JSON.parse(await readFile(path, 'utf8')) as { hubId?: string; locations?: Array<{ id: string; actions?: Array<Record<string, unknown>> }> };
        if (!hub.hubId || !catalog.resources?.some(item => item.kind === 'hub' && item.resourceId === hub.hubId
          && item.publicPath === hubPath!.slice('public/'.length))) throw Error('剧情 Hub 入口未登记或 ID 不一致');
        entryHubId = hub.hubId;
        entryActionId = input.launch.actionId;
        const location = hub.locations?.find(item => item.id === input.launch!.locationId);
        if (!location || !Array.isArray(location.actions)) throw Error('Hub 中找不到剧情入口地点');
        if (hub.locations?.some(item => item !== location && item.actions?.some(action => action.id === input.launch!.actionId))) throw Error('Hub 行动 ID 已用于其他地点');
        const action = { id: input.launch.actionId, kind: 'startStory', label: input.launch.label, description: input.brief, storyResourceId: input.storyId, storyGraphFile: publicPath, statusText: `已进入${input.launch.label}。` };
        const index = location.actions.findIndex(item => item.id === input.launch!.actionId);
        if (index >= 0) location.actions[index] = action;
        else location.actions.push(action);
        await writeFile(path, JSON.stringify(hub, null, 2) + '\n');
      } else {
        const hubs = (catalog.resources ?? []).filter(item => item.kind === 'hub' && typeof item.resourceId === 'string'
          && typeof item.publicPath === 'string' && /^data\/hub\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/u.test(item.publicPath));
        const reachable = await Promise.all(hubs.map(async item => {
          const hub = JSON.parse(await readFile(join(tempCheckout, 'public', item.publicPath!), 'utf8')) as {
            hubId?: string; locations?: Array<{ actions?: Array<{ id?: string; kind?: string; storyResourceId?: string; storyGraphFile?: string }> }>;
          };
          if (hub.hubId !== item.resourceId) return null;
          const action = hub.locations?.flatMap(location => location.actions ?? []).find(action => action.kind === 'startStory'
            && typeof action.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(action.id)
            && action.storyResourceId === input.storyId && action.storyGraphFile === publicPath);
          return action ? { hubId: item.resourceId!, actionId: action.id!, path: `public/${item.publicPath}` } : null;
        }));
        const entry = reachable.find(item => item !== null);
        if (!entry) throw Error('新剧情没有游戏入口；请指定 launch 的 Hub 地点与行动');
        hubPath = entry.path;
        entryHubId = entry.hubId;
        entryActionId = entry.actionId;
      }
      for (const edit of input.copyEdits ?? []) {
        const path = await candidateFile(tempCheckout, edit.path);
        await writeFile(path, applyStoryCopyEdits(edit.path, await readFile(path, 'utf8'), edit.edits));
      }
      const graph = JSON.parse(await readFile(join(tempCheckout, build.outputPath), 'utf8')) as {
        shareFactsAcrossStories?: boolean;
        initialState?: { questStages?: Record<string, string> };
        nodes?: Array<{ backgroundAsset?: string; dialogues?: Array<{ speakerId: string }>; onEnter?: unknown[] }>;
        choices?: Array<{ visibleWhen?: unknown; enabledWhen?: unknown; effects?: unknown[] }>;
      };
      if (input.quests?.length && graph.shareFactsAcrossStories !== true) {
        throw Error('剧情任务必须启用 shareFactsAcrossStories，才能在据点与大地图查看进度');
      }
      const speakers = new Set((graph.nodes ?? []).flatMap(node => node.dialogues?.map(line => line.speakerId) ?? []));
      const abilityReads: Array<{ actorId: string; ability: string }> = [];
      const portraits = new Set<string>();
      const itemIconPaths = new Set<string>();
      const itemReads = new Set<string>();
      const questRefs = new Map<string, Set<string>>();
      const noteQuest = (id: string, stage: string) => {
        if (!questRefs.has(id)) questRefs.set(id, new Set());
        questRefs.get(id)!.add(stage);
      };
      for (const [id, stage] of Object.entries(graph.initialState?.questStages ?? {})) noteQuest(id, stage);
      const collectAbilityReads = (value: unknown): void => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const condition = value as Record<string, unknown>;
        if (condition.kind === 'actorAbility') abilityReads.push({ actorId: String(condition.actorId), ability: String(condition.ability) });
        else if (condition.kind === 'itemCount') itemReads.add(String(condition.itemId));
        else if (condition.kind === 'questStage') noteQuest(String(condition.questId), String(condition.stage));
        else if (condition.kind === 'all' || condition.kind === 'any') {
          for (const child of Array.isArray(condition.conditions) ? condition.conditions : []) collectAbilityReads(child);
        } else if (condition.kind === 'not') collectAbilityReads(condition.condition);
      };
      for (const choice of graph.choices ?? []) {
        collectAbilityReads(choice.visibleWhen);
        collectAbilityReads(choice.enabledWhen);
      }
      if (speakers.size || input.npcs?.length || abilityReads.length || input.quests?.some(quest => quest.actorIds.length)) {
        const npcCatalog = JSON.parse(await readFile(join(tempCheckout, STORY_NPC_CATALOG_PATH), 'utf8')) as { npcs?: Array<{ id: string; abilities?: Record<string, number>; portraitAsset?: string }> };
        if (!Array.isArray(npcCatalog.npcs)) throw Error('游戏人物目录格式无效');
        const known = new Set(npcCatalog.npcs.map(npc => npc.id));
        for (const id of speakers) if (id !== 'player' && !known.has(id)) throw Error(`剧情对白引用不存在的人物：${id}`);
        for (const npc of npcCatalog.npcs) {
          if (!speakers.has(npc.id) || !npc.portraitAsset) continue;
          const path = `public/${npc.portraitAsset}`;
          if (!validStoryAssetPath(path) || !await fileHash(join(tempCheckout, path))) throw Error(`人物立绘不存在或路径无效：${npc.id}`);
          portraits.add(path);
        }
        for (const read of abilityReads) {
          const value = npcCatalog.npcs.find(npc => npc.id === read.actorId)?.abilities?.[read.ability];
          if (!Number.isFinite(value)) throw Error(`剧情条件引用不存在的人物能力：${read.actorId}.${read.ability}`);
        }
        for (const quest of input.quests ?? []) for (const id of quest.actorIds) if (!known.has(id)) throw Error(`游戏任务引用不存在的人物：${id}`);
        for (const id of npcIds) if (!speakers.has(id)) throw Error(`新增人物未出现在当前剧情对白：${id}`);
      }
      const grants: Array<{ grantId: string; cardId: string; count: number }> = [];
      const itemEffects: Array<{ transactionId: string; itemId: string; itemType: string; count: number; kind: string }> = [];
      const battles: Array<{ battleId: string; encounterResourceId?: string; encounterId: string; encounterFile: string; deckResourceId?: string; deckFile: string }> = [];
      const collectEffects = (effects: unknown[] | undefined) => {
        for (const entry of effects ?? []) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
          const effect = entry as Record<string, unknown>;
          if (effect.kind === 'grantCard') grants.push(effect as { grantId: string; cardId: string; count: number });
          if (effect.kind === 'grantItem' || effect.kind === 'consumeItem') itemEffects.push(effect as { transactionId: string; itemId: string; itemType: string; count: number; kind: string });
          if (effect.kind === 'setQuestStage') noteQuest(String(effect.questId), String(effect.stage));
          if (effect.kind === 'startBattle' && effect.battle && typeof effect.battle === 'object' && !Array.isArray(effect.battle)) {
            battles.push(effect.battle as typeof battles[number]);
          }
          if (effect.kind === 'once' && Array.isArray(effect.effects)) collectEffects(effect.effects);
        }
      };
      for (const node of graph.nodes ?? []) collectEffects(node.onEnter);
      for (const choice of graph.choices ?? []) collectEffects(choice.effects);
      if (input.quests?.length) {
        const catalog = JSON.parse(await readFile(join(tempCheckout, STORY_QUEST_CATALOG_PATH), 'utf8')) as { quests?: StoryQuest[] };
        if (!Array.isArray(catalog.quests)) throw Error('游戏任务目录格式无效');
        for (const [id, stages] of questRefs) {
          const quest = catalog.quests.find(item => item.id === id);
          if (!quest || [...stages].some(stage => !quest.stages.some(item => item.id === stage))) {
            throw Error(`剧情引用不存在的任务或阶段：${id}`);
          }
        }
        for (const quest of input.quests) if (!questRefs.has(quest.id)) throw Error(`新增任务未被当前剧情使用：${quest.id}`);
      }
      if ((grants.length || itemEffects.length) && graph.shareFactsAcrossStories !== true) throw Error('剧情仓库变更必须启用 shareFactsAcrossStories');
      if (itemReads.size || itemEffects.length || input.items?.length || input.recipes?.length) {
        const catalog = JSON.parse(await readFile(join(tempCheckout, STORY_ITEM_CATALOG_PATH), 'utf8')) as {
          artifacts?: Array<{ id: string; iconAsset?: string }>; tools?: Array<{ id: string; iconAsset?: string }>;
          consumables?: Array<{ id: string; iconAsset?: string }>; materials?: Array<{ id: string; iconAsset?: string }>;
          quests?: Array<{ id: string; iconAsset?: string }>; questItems?: Array<{ id: string; iconAsset?: string }>;
        };
        const known = new Map<string, string>();
        const definitions = new Map<string, { id: string; iconAsset?: string }>();
        for (const [field, kind] of [['artifacts', 'artifact'], ['tools', 'tool'], ['consumables', 'consumable'], ['materials', 'material'], ['quests', 'quest'], ['questItems', 'quest']] as const) {
          for (const item of catalog[field] ?? []) {
            if (known.has(item.id)) throw Error(`游戏道具 ID 重复：${item.id}`);
            known.set(item.id, kind);
            definitions.set(item.id, item);
          }
        }
        for (const id of itemReads) if (!known.has(id)) throw Error(`剧情条件引用不存在的道具：${id}`);
        const transactionIds = new Set<string>();
        for (const effect of itemEffects) {
          if (known.get(effect.itemId) !== effect.itemType) throw Error(`剧情效果引用不存在或类型不符的道具：${effect.itemId}`);
          if (transactionIds.has(effect.transactionId)) throw Error(`剧情道具结算 ID 重复：${effect.transactionId}`);
          transactionIds.add(effect.transactionId);
        }
        for (const id of new Set([...itemReads, ...itemEffects.map(effect => effect.itemId), ...(input.items ?? []).map(item => item.id)])) {
          const icon = definitions.get(id)?.iconAsset;
          if (!icon) continue;
          const path = `public/${icon}`;
          if (!validItemIconAssetPath(path) || !await fileHash(join(tempCheckout, path))) throw Error(`道具图标不存在或路径无效：${id}`);
          itemIconPaths.add(path);
        }
        for (const id of newItemIds) {
          const recipeOutput = input.recipes?.some(recipe => recipe.rewards.items.some(item => item.id === id)) ?? false;
          if (!itemReads.has(id) && !itemEffects.some(effect => effect.itemId === id) && !recipeOutput) throw Error(`新增道具未被当前剧情引用：${id}`);
          if (!itemEffects.some(effect => effect.kind === 'grantItem' && effect.itemId === id) && !recipeOutput) throw Error(`新增道具没有当前剧情中的获得途径：${id}`);
        }
      }
      if (grants.length) {
        const units = JSON.parse(await readFile(join(tempCheckout, CARD_UNITS_PATH), 'utf8')) as { units?: Array<{ id?: string }> };
        const ids = new Set(units.units?.map(unit => unit.id) ?? []);
        if (grants.some(grant => !ids.has(grant.cardId))) throw Error(`剧情奖励引用不存在的卡牌：${grants.find(grant => !ids.has(grant.cardId))?.cardId}`);
        const uniqueGrants = new Map<string, string>();
        for (const grant of grants) {
          const value = `${grant.cardId}:${grant.count}`;
          if (uniqueGrants.has(grant.grantId) && uniqueGrants.get(grant.grantId) !== value) throw Error(`剧情奖励 ID 指向不同卡牌：${grant.grantId}`);
          uniqueGrants.set(grant.grantId, value);
        }
      }
      const battlePaths = new Set<string>();
      if (battles.length) {
        const catalog = JSON.parse(await readFile(join(tempCheckout, STORY_CATALOG_PATH), 'utf8')) as { resources?: Array<{ resourceId?: string; kind?: string; publicPath?: string }> };
        for (const battle of battles) {
          for (const [kind, resourceId, path] of [
            ['encounter', battle.encounterResourceId, battle.encounterFile],
            ['deck', battle.deckResourceId, battle.deckFile],
          ] as const) {
            if (!resourceId || typeof path !== 'string' || !validStoryBattlePath(`public/${path}`, kind)
              || !catalog.resources?.some(item => item.kind === kind && item.resourceId === resourceId && item.publicPath === path)) {
              throw Error(`剧情战斗引用未登记的${kind === 'encounter' ? '遭遇' : '卡组'}：${resourceId ?? path}`);
            }
            battlePaths.add(`public/${path}`);
          }
          const encounter = JSON.parse(await readFile(join(tempCheckout, 'public', battle.encounterFile), 'utf8')) as { id?: string };
          if (encounter.id !== battle.encounterId) throw Error(`剧情战斗遭遇 ID 不一致：${battle.battleId}`);
        }
      }
      const shopDependencies = new Set<string>();
      const shopTargets: NonNullable<GameCandidateRecord['shopTargets']> = [];
      if (input.shops?.length) {
        const catalog = JSON.parse(await readFile(join(tempCheckout, STORY_CATALOG_PATH), 'utf8')) as {
          resources?: Array<{ resourceId?: string; kind?: string; publicPath?: string }>;
        };
        const resources = catalog.resources ?? [];
        const itemCatalog = JSON.parse(await readFile(await candidateFile(tempCheckout, STORY_ITEM_CATALOG_PATH), 'utf8')) as Record<string, unknown>;
        const knownItems = new Map<string, string>();
        for (const [field, kind] of [['artifacts', 'artifact'], ['tools', 'tool'], ['consumables', 'consumable'], ['materials', 'material'], ['quests', 'quest'], ['questItems', 'quest']] as const) {
          const entries = itemCatalog[field];
          if (entries !== undefined && !Array.isArray(entries)) throw Error('游戏道具目录格式无效');
          for (const item of (entries ?? []) as Array<{ id?: string }>) {
            if (!item?.id || knownItems.has(item.id)) throw Error(`游戏道具 ID 重复或无效：${item?.id}`);
            knownItems.set(item.id, kind);
          }
        }
        const cardOwners = new Map<string, string>();
        for (const collection of Object.values(CARD_COLLECTIONS)) {
          const sourcePath = await candidateFile(tempCheckout, collection.path).catch(error => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
          });
          if (!sourcePath) continue;
          const definitions = JSON.parse(await readFile(sourcePath, 'utf8')) as Record<string, unknown>;
          const cards = definitions[collection.key];
          if (!Array.isArray(cards)) throw Error(`游戏卡牌目录格式无效：${collection.path}`);
          for (const card of cards as Array<{ id?: string }>) {
            if (!card?.id || cardOwners.has(card.id)) throw Error(`游戏卡牌 ID 重复或无效：${card?.id}`);
            cardOwners.set(card.id, collection.path);
          }
        }
        for (const shop of input.shops) {
          const entry = resources.find(item => item.kind === 'expeditionShop' && item.resourceId === shop.resourceId);
          const shopPath = entry?.publicPath ? `public/${entry.publicPath}` : '';
          if (!entry || !validStoryTargetPath(shopPath) || !shopPath.startsWith('public/data/mijing/')) {
            throw Error(`商店未登记或路径无效：${shop.resourceId}`);
          }
          const shopFile = await candidateFile(tempCheckout, shopPath);
          const collection = JSON.parse(await readFile(shopFile, 'utf8')) as {
            id?: string; shopsByNodeId?: Record<string, { nodeId?: string; offers?: StoryShopOffer[] }>;
          };
          const definition = collection.shopsByNodeId?.[shop.nodeId];
          if (collection.id !== shop.resourceId || !Object.hasOwn(collection.shopsByNodeId ?? {}, shop.nodeId)
            || definition?.nodeId !== shop.nodeId || !Array.isArray(definition.offers)) {
            throw Error(`商店节点不存在或 ID 不一致：${shop.resourceId}.${shop.nodeId}`);
          }
          const mapResourceIds: string[] = [];
          for (const mapEntry of resources.filter(item => item.kind === 'expeditionMap')) {
            const mapPath = mapEntry.publicPath ? `public/${mapEntry.publicPath}` : '';
            if (!mapEntry.resourceId || !validStoryTargetPath(mapPath) || !mapPath.startsWith('public/data/mijing/')) continue;
            const map = JSON.parse(await readFile(await candidateFile(tempCheckout, mapPath), 'utf8')) as {
              entryNodeId?: string;
              nodes?: Array<{ id: string; type: string; outgoingNodeIds?: string[]; payloadRef?: { ref?: string; contentFile?: string } }>;
            };
            if (!Array.isArray(map.nodes)) continue;
            const nodes = new Map(map.nodes.map(node => [node.id, node] as const));
            const reachable = new Set<string>();
            const pending = map.entryNodeId ? [map.entryNodeId] : [];
            while (pending.length) {
              const id = pending.shift()!;
              if (reachable.has(id)) continue;
              reachable.add(id);
              pending.push(...(nodes.get(id)?.outgoingNodeIds ?? []));
            }
            if (map.nodes.some(node => reachable.has(node.id) && node.id === shop.nodeId && node.type === 'shop'
              && node.payloadRef?.ref === shop.nodeId && node.payloadRef.contentFile === entry.publicPath)) {
              mapResourceIds.push(mapEntry.resourceId);
              shopDependencies.add(mapPath);
            }
          }
          if (!mapResourceIds.length) throw Error(`商店节点没有可达的已登记秘境地图：${shop.nodeId}`);
          let changed = false;
          for (const offer of shop.offers) {
            for (const stack of [...(offer.cost.items ?? []), ...offer.rewards.items]) {
              if (knownItems.get(stack.id) !== stack.itemType) throw Error(`商店报价引用不存在或类型不符的道具：${stack.id}`);
            }
            for (const stack of offer.rewards.cards) {
              const path = cardOwners.get(stack.id);
              if (!path) throw Error(`商店报价引用不存在的卡牌：${stack.id}`);
              shopDependencies.add(path);
            }
            const index = definition.offers.findIndex(item => item.id === offer.id);
            if (index < 0) { definition.offers.push(offer); changed = true; }
            else if (stable(definition.offers[index]) !== stable(offer)) { definition.offers[index] = offer; changed = true; }
          }
          shopDependencies.add(shopPath);
          shopTargets.push({ resourceId: shop.resourceId, nodeId: shop.nodeId,
            offerIds: shop.offers.map(offer => offer.id), mapResourceIds });
          if (changed) await writeFile(shopFile, JSON.stringify(collection, null, 2) + '\n');
        }
        if (input.shops.some(shop => shop.offers.some(offer => (offer.cost.items?.length ?? 0) || offer.rewards.items.length))) {
          shopDependencies.add(STORY_ITEM_CATALOG_PATH);
        }
      }
      const backgrounds = (graph.nodes ?? []).flatMap(node => node.backgroundAsset ? [`public/${node.backgroundAsset}`] : []);
      if (backgrounds.some(path => !validStoryAssetPath(path))) throw Error('剧情编译图包含不允许的背景路径');
      if ([...assetPaths].some(path => !backgrounds.includes(path) && !portraits.has(path) && !itemIconPaths.has(path))) throw Error('剧情素材没有被当前场景、对白人物或道具引用');
      const paths = [...new Set([...sources, ...input.documents.map(doc => doc.path), ...referenceDocuments.map(doc => doc.path), build.outputPath, STORY_CATALOG_PATH,
        ...(grants.length ? [CARD_UNITS_PATH] : []),
        ...(itemReads.size || itemEffects.length || input.items?.length || input.recipes?.length ? [STORY_ITEM_CATALOG_PATH] : []),
        ...(speakers.size || abilityReads.length || input.quests?.some(quest => quest.actorIds.length) ? [STORY_NPC_CATALOG_PATH] : []),
        ...(input.quests?.length ? [STORY_QUEST_CATALOG_PATH] : []),
        ...backgrounds, ...portraits, ...itemIconPaths, ...battlePaths, ...shopDependencies, ...copyPaths, ...(input.assets?.length ? [STORY_ASSET_MANIFEST_PATH, ...assetPaths] : []), ...(hubPath ? [hubPath] : [])])];
      if (paths.some(path => !validStoryTargetPath(path))) throw Error('剧情候选包含不允许的文件路径');
      const baseDependencies = await Promise.all(paths.map(async path => ({ path, revision: await fileHash(join(source, path)) })));
      for (const doc of [...input.documents, ...referenceDocuments]) {
        if (baseDependencies.find(item => item.path === doc.path)?.revision !== (doc.expectedRevision ?? null)) {
          throw Error(`剧情源文档在建立候选时已变化：${doc.path}`);
        }
      }
      const dependencies = await Promise.all(paths.map(async path => ({ path, revision: await fileHash(join(tempCheckout, path)) })));
      if (dependencies.some(item => !item.revision)) throw Error('剧情候选依赖文件缺失');
      const changedPaths = paths.filter((path, index) => baseDependencies[index]!.revision !== dependencies[index]!.revision);
      if (!changedPaths.length) throw Error('剧情候选没有文件变化');
      const targetBaseRevision = digest(stable(baseDependencies));
      const fingerprint = digest(stable({ storyId: input.storyId, entryPath: input.entryPath, dependencies, changedPaths }));
      const baseId = `story-${digest(stable({ projectId, productionId, fingerprint, targetBaseRevision, sourceTree })).slice(0, 36)}`;
      const detail = await options.workflow.query({ projectId, op: 'production', productionId }) as { production: ProductionRecord };
      const { id, previous } = candidateSlot(baseId, detail.production.gameCandidates);
      if (previous) { await registerPreview(previous); return { candidate: previous, production: detail.production, reused: true }; }
      await git(tempCheckout, 'add', '-A');
      if (await git(tempCheckout, 'status', '--porcelain')) await git(tempCheckout, '-c', 'user.name=Worka Candidate', '-c', 'user.email=worka-candidate@local.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', `CardGame story candidate ${input.storyId}`);
      const commit = await git(tempCheckout, 'rev-parse', 'HEAD');
      if (!/^[0-9a-f]{40}$/u.test(commit)) throw Error('剧情候选没有确切提交');
      const validationManifest = digest(stable({ commit, checks: [
        'game-shell', 'content-catalog', 'story-resource', 'story-route',
        ...(speakers.size ? ['story-speakers'] : []),
        ...(abilityReads.length ? ['story-abilities'] : []),
        ...(itemReads.size || itemEffects.length || input.items?.length ? ['story-items'] : []),
        ...(input.recipes?.length ? ['story-recipes'] : []),
        ...(input.quests?.length ? ['story-quests'] : []),
        ...(battles.length ? ['story-battles'] : []),
        ...(shopTargets.length ? ['story-shops'] : []),
        ...(backgrounds.length ? ['story-backgrounds'] : []),
        ...(portraits.size ? ['story-portraits'] : []),
        ...(itemIconPaths.size ? ['story-item-icons'] : []),
        ...(copyPaths.length ? ['story-copy'] : []),
      ], storyId: input.storyId }));
      const recipeIds = input.recipes?.map(recipe => recipe.id) ?? [];
      const itemUseIds = input.items?.filter(item => item.useEffect).map(item => item.id) ?? [];
      const questIds = input.quests?.map(quest => quest.id) ?? [];
      const portraitPaths = [...portraits].sort();
      const itemIconPathsSorted = [...itemIconPaths].sort();
      const candidateHash = digest(stable({ kind: 'story', targetId: input.storyId, entryHubId, entryActionId, ...(shopTargets.length ? { shopTargets } : {}), ...(recipeIds.length ? { recipeIds } : {}), ...(itemUseIds.length ? { itemUseIds } : {}), ...(questIds.length ? { questIds } : {}), ...(copyPaths.length ? { copyPaths } : {}), ...(portraitPaths.length ? { portraitPaths } : {}), ...(itemIconPathsSorted.length ? { itemIconPaths: itemIconPathsSorted } : {}), commit, fingerprint, sourceTree, sourceSnapshotScope: 'runtime', targetBaseRevision, validationManifest, dependencies, baseDependencies, changedPaths }));
      const finalDirectory = candidatePath(projectId, id);
      await rm(finalDirectory, { recursive: true, force: true });
      await mkdir(dirname(finalDirectory), { recursive: true });
      const { rename } = await import('node:fs/promises');
      await rename(tempDirectory, finalDirectory);
      moved = true;
      const at = new Date().toISOString();
      const candidate: GameCandidateRecord = { id, projectId, productionId, cardId: 'CR_001', kind: 'story', targetId: input.storyId, entryHubId, entryActionId,
        ...(shopTargets.length ? { shopTargets } : {}), changedPaths, baseDependencies,
        ...(copyPaths.length ? { copyPaths } : {}),
        ...(portraitPaths.length ? { portraitPaths } : {}),
        ...(itemIconPathsSorted.length ? { itemIconPaths: itemIconPathsSorted } : {}),
        ...(recipeIds.length ? { recipeIds } : {}),
        ...(itemUseIds.length ? { itemUseIds } : {}),
        ...(questIds.length ? { questIds } : {}),
        featureId: input.featureId, fingerprint, sourceSnapshotTree: sourceTree, sourceSnapshotScope: 'runtime', candidateHash, commit, repo: join(finalDirectory, 'repo'), targetBaseRevision, validationManifest,
        dependencies: dependencies.map(item => ({ path: item.path, revision: item.revision! })), status: 'candidate', createdAt: at, updatedAt: at };
      const recorded = await options.workflow.command('recordGameCandidate', { projectId, productionId, baseRevision: detail.production.revision, candidate }) as { production: ProductionRecord; candidate: GameCandidateRecord };
      await registerPreview(recorded.candidate);
      return recorded;
    } finally {
      if (!moved) await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  async function stageDocuments(input: {
    projectId: string; featureId: string; brief: string;
    documents: Array<{ path: string; content: string; expectedRevision?: string | null }>;
  }): Promise<{ candidate: GameCandidateRecord; production: ProductionRecord; reused?: boolean }> {
    const projectId = input.projectId;
    const source = project(projectId);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.featureId ?? '')) throw Error('资料候选需要已有功能项的 featureId');
    if (!input.brief?.trim()) throw Error('资料候选需要创作目标');
    if (!Array.isArray(input.documents) || input.documents.length < 1 || input.documents.length > 64) throw Error('资料候选每批需有 1–64 篇文档');
    const unique = new Set<string>();
    for (const doc of input.documents) {
      if (!doc || typeof doc.path !== 'string' || !validStorySourcePath(doc.path) || unique.has(doc.path)
        || typeof doc.content !== 'string' || doc.content.length > 1_000_000) throw Error(`资料文档路径、内容或大小无效：${doc?.path}`);
      if (frontmatterHasScene(doc.content)) throw Error(`资料文档不能包含 scene: true：${doc.path}`);
      unique.add(doc.path);
    }
    const paths = [...unique].sort();
    const productionId = `documents-${digest(stable({ projectId, featureId: input.featureId, paths })).slice(0, 24)}`;
    const created = await options.workflow.command('createProduction', { projectId, id: productionId, brief: input.brief, featureId: input.featureId }) as { production: ProductionRecord };
    if (created.production.featureId !== input.featureId) throw Error('资料制作单属于另一个功能项');
    const tempDirectory = candidatePath(projectId, `building-${randomUUID()}`);
    const tempCheckout = join(tempDirectory, 'repo');
    await mkdir(dirname(tempDirectory), { recursive: true });
    let moved = false;
    try {
      await mkdir(tempDirectory, { recursive: true });
      await sourceSnapshot(source, tempCheckout);
      const sourceTree = await runtimeTree(tempCheckout);
      const scoped = createContentService({ dataRoot: join(tempDirectory, 'content'), projects: [{ id: projectId, root: tempCheckout }] });
      try {
        for (const doc of input.documents) {
          const original = await options.content.query({ projectId, op: 'document', path: doc.path }).catch(error => {
            if ((error as { code?: string }).code === 'NOT_FOUND') return null;
            throw error;
          }) as { revision?: string; content?: string } | null;
          if ((original?.revision ?? null) !== (doc.expectedRevision ?? null)) throw Error(`资料源文档已变化：${doc.path}`);
          if (original?.content && frontmatterHasScene(original.content)) throw Error(`已有场景不能作为普通资料修改：${doc.path}`);
          const cloneDoc = await scoped.query({ projectId, op: 'document', path: doc.path }).catch(error => {
            if ((error as { code?: string }).code === 'NOT_FOUND') return null;
            throw error;
          }) as { revision?: string } | null;
          if ((cloneDoc?.revision ?? null) !== (doc.expectedRevision ?? null)) throw Error(`隔离副本与资料源文档不一致：${doc.path}`);
          await scoped.command('saveDocument', { projectId, path: doc.path, content: doc.content, expectedRevision: cloneDoc?.revision ?? null });
        }
      } finally { await scoped.close(); }
      const baseDependencies = await Promise.all(paths.map(async path => ({ path, revision: await fileHash(join(source, path)) })));
      for (const doc of input.documents) {
        if (baseDependencies.find(item => item.path === doc.path)?.revision !== (doc.expectedRevision ?? null)) {
          throw Error(`资料源文档在建立候选时已变化：${doc.path}`);
        }
      }
      const dependencies = await Promise.all(paths.map(async path => ({ path, revision: await fileHash(join(tempCheckout, path)) })));
      if (dependencies.some(item => !item.revision)) throw Error('资料候选依赖文件缺失');
      const changedPaths = paths.filter((path, index) => baseDependencies[index]!.revision !== dependencies[index]!.revision);
      if (!changedPaths.length) throw Error('资料候选没有文件变化');
      const targetBaseRevision = digest(stable(baseDependencies));
      const fingerprint = digest(stable({ paths, dependencies, changedPaths }));
      const baseId = `documents-${digest(stable({ projectId, productionId, fingerprint, targetBaseRevision, sourceTree })).slice(0, 36)}`;
      const detail = await options.workflow.query({ projectId, op: 'production', productionId }) as { production: ProductionRecord };
      const { id, previous } = candidateSlot(baseId, detail.production.gameCandidates);
      if (previous) { await registerPreview(previous); return { candidate: previous, production: detail.production, reused: true }; }
      await git(tempCheckout, 'add', '-A');
      if (await git(tempCheckout, 'status', '--porcelain')) await git(tempCheckout, '-c', 'user.name=Worka Candidate', '-c', 'user.email=worka-candidate@local.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'CardGame document candidate');
      const commit = await git(tempCheckout, 'rev-parse', 'HEAD');
      if (!/^[0-9a-f]{40}$/u.test(commit)) throw Error('资料候选没有确切提交');
      const validationManifest = digest(stable({ commit, checks: ['game-shell', 'content-catalog', 'knowledge-documents'], paths }));
      const targetId = paths[0]!;
      const candidateHash = digest(stable({ kind: 'documents', targetId, commit, fingerprint, sourceTree, sourceSnapshotScope: 'runtime', targetBaseRevision, validationManifest, dependencies, baseDependencies, changedPaths }));
      const finalDirectory = candidatePath(projectId, id);
      await rm(finalDirectory, { recursive: true, force: true });
      await mkdir(dirname(finalDirectory), { recursive: true });
      const { rename } = await import('node:fs/promises');
      await rename(tempDirectory, finalDirectory);
      moved = true;
      const at = new Date().toISOString();
      const candidate: GameCandidateRecord = { id, projectId, productionId, cardId: '', kind: 'documents', targetId, changedPaths, baseDependencies,
        featureId: input.featureId, fingerprint, sourceSnapshotTree: sourceTree, sourceSnapshotScope: 'runtime', candidateHash, commit,
        repo: join(finalDirectory, 'repo'), targetBaseRevision, validationManifest,
        dependencies: dependencies.map(item => ({ path: item.path, revision: item.revision! })), status: 'candidate', createdAt: at, updatedAt: at };
      const recorded = await options.workflow.command('recordGameCandidate', { projectId, productionId, baseRevision: detail.production.revision, candidate }) as { production: ProductionRecord; candidate: GameCandidateRecord };
      await registerPreview(recorded.candidate);
      return recorded;
    } finally {
      if (!moved) await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  return {
    stageDeck: (input: Parameters<typeof stageDeck>[0]) => serial(() => stageDeck(input)),
    stageCard: (input: Parameters<typeof stageCard>[0]) => serial(() => stageCard(input)),
    stageStory: (input: Parameters<typeof stageStory>[0]) => serial(() => stageStory(input)),
    stageDocuments: (input: Parameters<typeof stageDocuments>[0]) => serial(() => stageDocuments(input)),
    async close() { await queue; },
  };
}
