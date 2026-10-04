import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { CARD_ASSET_MANIFEST_PATH, CARD_BATTLE_LOADOUT_PATH, CARD_STARTER_DECK_PATH, candidateAssetPaths, candidateCardKind, cardTargetBaseRevision, gameRuntimeSnapshotTree, gameSourceSnapshotTree, storyTargetBaseRevision, validStorySourcePath, validStoryTargetPath } from './game-candidates';
import { deckCandidateHash, validDeckTargetPath, inspectDeck } from './deck-plan';
import { cardCollection } from './card-collections';
import { validStoryCopyPath } from './story-copy-edits';
import type { GameCandidateRecord, ProductionRecord, WorkflowService } from './workflow';

const run = promisify(execFile);
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const eq = (a: unknown, b: unknown) => stable(a) === stable(b);
type Collection = Record<string, any>;
type Manifest = { assets: Array<Record<string, any>>; [key: string]: unknown };
type Deck = { cards: Array<{id: string; count: number}>; [key: string]: unknown };
type Loadout = { schemaVersion: number; pillIds: string[]; skillIds: string[]; [key: string]: unknown };
type Patch = { path: string; before: string | null; after: string | null };
type Journal = { id: string; candidateId: string; projectId: string; productionId: string; status: 'applying' | 'applied' | 'complete' | 'reverting' | 'undone' | 'undoing'; createdAt: string; patches: Patch[] };

const bytes = async (path: string): Promise<Buffer | null> => readFile(path).catch(error => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
  throw error;
});
const json = async <T>(path: string, fallback: T): Promise<T> => {
  const value = await bytes(path);
  return value ? JSON.parse(value.toString('utf8')) as T : fallback;
};
const encode = (value: Buffer | null) => value?.toString('base64') ?? null;
const decode = (value: string | null) => value === null ? null : Buffer.from(value, 'base64');
const format = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const same = (a: Buffer | null, b: Buffer | null) => a === null || b === null ? a === b : a.equals(b);

export interface GameAdoptionOptions {
  dataRoot: string;
  projects: Array<{ id: string; root: string }>;
  workflow: WorkflowService;
  previewEvidence: (candidate: GameCandidateRecord) => Promise<void>;
}

/** Only this service may apply a playable candidate to the registered game root. */
export function createGameAdoptionService(options: GameAdoptionOptions) {
  const roots = new Map(options.projects.map(project => [project.id, resolve(project.root)]));
  const journals = resolve(options.dataRoot, 'game-adoptions');
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => { const next = queue.then(fn); queue = next.catch(() => undefined); return next; };
  const root = (projectId: string) => { const path = roots.get(projectId); if (!path) throw Error('项目未登记'); return path; };
  const journalPath = (journal: Pick<Journal, 'id' | 'projectId'>) => join(journals, journal.projectId, `${journal.id}.json`);
  const writeJournal = async (journal: Journal) => {
    const path = journalPath(journal);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(journal));
    await rename(temp, path);
  };
  const candidate = async (input: Record<string, unknown>) => {
    const projectId = String(input.projectId ?? '');
    const productionId = String(input.productionId ?? '');
    const detail = await options.workflow.query({ projectId, op: 'production', productionId }) as { production: ProductionRecord };
    const item = detail.production.gameCandidates?.find(value => value.id === input.candidateId);
    if (!item) throw Error('找不到制作单对应的确切候选');
    if (item.featureId !== input.featureId || item.candidateHash !== input.candidateHash || item.targetBaseRevision !== input.targetBaseRevision || item.validationManifest !== input.validationManifest) throw Error('确认资料与候选不一致，请刷新功能进展');
    return item;
  };
  const checkSnapshot = async (item: GameCandidateRecord) => {
    if (!/^[0-9a-f]{40}$/.test(item.commit) || !item.repo.startsWith(resolve(options.dataRoot, 'game-candidates') + '/')) throw Error('候选快照无效');
    const actual = (await run('git', ['rev-parse', 'HEAD'], { cwd: item.repo })).stdout.trim();
    if (actual !== item.commit || (await run('git', ['status', '--porcelain'], { cwd: item.repo })).stdout.trim()) throw Error('候选快照已改变');
    const sourceTree = item.sourceSnapshotTree ? { sourceTree: item.sourceSnapshotTree, ...(item.sourceSnapshotScope ? { sourceSnapshotScope: item.sourceSnapshotScope } : {}) } : {};
    const expected = item.kind === 'deck' ? deckCandidateHash(item) : item.kind === 'story'
      ? hash(stable({ kind: 'story', targetId: item.targetId, ...(item.entryHubId && item.entryActionId ? { entryHubId: item.entryHubId, entryActionId: item.entryActionId } : {}), ...(item.shopTargets?.length ? { shopTargets: item.shopTargets } : {}), ...(item.recipeIds?.length ? { recipeIds: item.recipeIds } : {}), ...(item.itemUseIds?.length ? { itemUseIds: item.itemUseIds } : {}), ...(item.questIds?.length ? { questIds: item.questIds } : {}), ...(item.copyPaths?.length ? { copyPaths: item.copyPaths } : {}), ...(item.portraitPaths?.length ? { portraitPaths: item.portraitPaths } : {}), ...(item.itemIconPaths?.length ? { itemIconPaths: item.itemIconPaths } : {}), commit: item.commit, fingerprint: item.fingerprint, ...sourceTree, targetBaseRevision: item.targetBaseRevision, validationManifest: item.validationManifest, dependencies: item.dependencies, baseDependencies: item.baseDependencies, changedPaths: item.changedPaths }))
      : item.kind === 'documents'
      ? hash(stable({ kind: 'documents', targetId: item.targetId, commit: item.commit, fingerprint: item.fingerprint, ...sourceTree, targetBaseRevision: item.targetBaseRevision, validationManifest: item.validationManifest, dependencies: item.dependencies, baseDependencies: item.baseDependencies, changedPaths: item.changedPaths }))
      : hash(stable({ commit: item.commit, fingerprint: item.fingerprint, ...sourceTree, targetBaseRevision: item.targetBaseRevision, validationManifest: item.validationManifest, dependencies: item.dependencies }));
    if (expected !== item.candidateHash) throw Error('候选身份校验失败');
    if (item.kind === 'story' || item.kind === 'documents' || item.kind === 'deck') {
      const validPath = item.kind === 'deck' ? validDeckTargetPath : item.kind === 'documents' ? validStorySourcePath : validStoryTargetPath;
      if (item.kind === 'deck' && (!item.deckPath || !validDeckTargetPath(item.deckPath) || item.deckPath === CARD_STARTER_DECK_PATH || !item.dependencies.some(dep => dep.path === item.deckPath) || !item.changedPaths?.length || item.changedPaths.includes(CARD_STARTER_DECK_PATH))) throw Error('整套牌组候选不能覆盖正式默认牌组');
      if (!item.targetId || !item.changedPaths?.length || !item.baseDependencies?.length || item.changedPaths.some(path => !validPath(path))
        || item.copyPaths?.some(path => !validStoryCopyPath(path) || !item.changedPaths?.includes(path))
        || item.dependencies.some(dep => !validPath(dep.path)) || item.baseDependencies.some(dep => !validPath(dep.path))) throw Error('候选依赖路径无效');
      if (item.kind === 'documents' && (item.copyPaths?.length || item.dependencies.length !== item.baseDependencies.length
        || item.dependencies.length > 64 || item.targetId !== item.dependencies[0]?.path)) throw Error('资料候选依赖清单无效');
      const dependencyPaths = new Set(item.dependencies.map(dep => dep.path));
      if (item.changedPaths.some(path => !dependencyPaths.has(path)) || item.baseDependencies.some(dep => !dependencyPaths.has(dep.path))) throw Error('候选依赖清单不完整');
      for (const dependency of item.dependencies) {
        const path = join(item.repo, dependency.path);
        if ((await lstat(path)).isSymbolicLink() || !(await realpath(path)).startsWith(resolve(item.repo) + '/')) throw Error(`剧情候选依赖越界：${dependency.path}`);
        if (hash(await readFile(path)) !== dependency.revision) throw Error(`候选依赖已改变：${dependency.path}`);
      }
      if (item.kind === 'deck' && item.deckArtFingerprints) {
        const ids = item.deckCardIds ?? [];
        if (!ids.length || item.placeholderCardIds?.length || !item.dependencies.some(dep => dep.path === CARD_ASSET_MANIFEST_PATH)) throw Error('整套插画候选资源清单不完整');
        const declared = item.dependencies.filter(dep => dep.path.startsWith('public/assets/card-faces/')).map(dep => dep.path);
        const referenced: string[] = [];
        const manifest = await json<Manifest>(join(item.repo, CARD_ASSET_MANIFEST_PATH), {assets:[]});
        for (const id of ids) {
          let card: any;
          for (const path of item.dependencies.filter(dep => dep.path.startsWith('public/data/cards/')).map(dep => dep.path)) {
            const collection = await json<Collection>(join(item.repo,path), {});
            card ??= Object.values(collection).filter(Array.isArray).flat().find((entry:any) => entry.id === id);
          }
          const face = card?.cardFace;
          if (face?.schemaVersion !== 1 || !face.artwork || !face.variants?.jade || !face.variants?.scroll) throw Error(`卡牌 ${id} 的两套插画引用不完整`);
          const paths = [face.artwork, ...['jade','scroll'].flatMap(theme => [face.variants[theme].texture,face.variants[theme].preview])].map(path => `public${path}`);
          if (new Set(paths).size !== 5 || paths.some(path => !path.startsWith(`public/assets/card-faces/${id}/`) || !manifest.assets.some(entry => entry.path === path))) throw Error(`卡牌 ${id} 的资源闭包不完整`);
          referenced.push(...paths);
        }
        if (!eq([...referenced].sort(), [...declared].sort())) throw Error('整套插画候选有遗漏或无关资源');
      }
      return item.changedPaths;
    }
    const collection = cardCollection(candidateCardKind(item));
    const entryPath = collection.inDeck ? CARD_STARTER_DECK_PATH : CARD_BATTLE_LOADOUT_PATH;
    if (![collection.path, CARD_ASSET_MANIFEST_PATH, entryPath].every(path => item.dependencies.some(dep => dep.path === path))) throw Error('候选卡牌依赖不完整');
    const paths = candidateAssetPaths(item);
    if (paths.length !== 5 || paths.some(path => !new RegExp(`^public/assets/card-faces/${item.cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[A-Za-z0-9._-]+\\.png$`).test(path))) throw Error('候选素材依赖不完整');
    for (const dependency of item.dependencies) {
      if (hash(await readFile(join(item.repo, dependency.path))) !== dependency.revision) throw Error(`候选依赖已改变：${dependency.path}`);
    }
    return paths;
  };
  const writePatch = async (base: string, patch: Patch, reverse = false) => {
    const path = join(base, patch.path);
    const expected = decode(reverse ? patch.after : patch.before);
    const desired = decode(reverse ? patch.before : patch.after);
    const current = await bytes(path);
    if (same(current, desired)) return;
    if (!same(current, expected)) throw Error(`目标已被外部修改：${patch.path}`);
    if (desired === null) { await rm(path, { force: true }); return; }
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, desired);
    await rename(temp, path);
  };
  const apply = async (base: string, patches: Patch[], reverse = false) => {
    const sequence = reverse ? [...patches].reverse() : patches;
    for (const patch of sequence) await writePatch(base, patch, reverse);
  };
  const merge = async (item: GameCandidateRecord, undo: boolean, adoption?: Journal): Promise<Patch[]> => {
    if (item.kind === 'story' || item.kind === 'documents' || item.kind === 'deck') {
      const patches: Patch[] = [];
      for (const path of item.changedPaths ?? []) {
        const before = await bytes(join(root(item.projectId), path));
        const adopted = await bytes(join(item.repo, path));
        if (!adopted) throw Error(`候选剧情文件缺失：${path}`);
        if (undo && !same(before, adopted)) throw Error(`采用后的剧情文件已有新修改：${path}`);
        const original = adoption?.patches.find(patch => patch.path === path)?.before ?? null;
        patches.push({ path, before: encode(before), after: undo ? original : encode(adopted) });
      }
      return patches;
    }
    const base = root(item.projectId);
    const paths = candidateAssetPaths(item);
    const kind = candidateCardKind(item);
    const collection = cardCollection(kind);
    const cardsPath = join(base, collection.path);
    const manifestPath = join(base, CARD_ASSET_MANIFEST_PATH);
    const entryPath = collection.inDeck ? CARD_STARTER_DECK_PATH : CARD_BATTLE_LOADOUT_PATH;
    const cardsBefore = await bytes(cardsPath);
    const manifestBefore = await bytes(manifestPath);
    const entryBefore = await bytes(join(base, entryPath));
    const adoptionPatches = new Map(adoption?.patches.map(patch => [patch.path, patch]) ?? []);
    if (undo && [collection.path, CARD_ASSET_MANIFEST_PATH, entryPath, ...paths].some(path => !adoptionPatches.has(path))) {
      throw Error('完整采用日志缺少卡牌依赖');
    }
    const mergedJson = (path: string, current: Buffer | null, next: unknown): string | null => {
      const adoptedPatch = adoptionPatches.get(path);
      // If nobody touched this file after adoption, restore its exact original bytes.
      if (undo && adoptedPatch && same(current, decode(adoptedPatch.after))) return adoptedPatch.before;
      return encode(format(next));
    };
    const cards = cardsBefore ? JSON.parse(cardsBefore.toString('utf8')) as Collection : { [collection.key]: [] };
    const manifest = manifestBefore ? JSON.parse(manifestBefore.toString('utf8')) as Manifest : { assets: [] };
    const entry = entryBefore ? JSON.parse(entryBefore.toString('utf8')) as Deck & Loadout : null;
    const candidateCards = await json<Collection>(join(item.repo, collection.path), { [collection.key]: [] });
    const candidateManifest = await json<Manifest>(join(item.repo, CARD_ASSET_MANIFEST_PATH), { assets: [] });
    const candidateEntry = await json<Deck & Loadout | null>(join(item.repo, entryPath), null);
    const currentCards = cards[collection.key] as Array<Record<string, any>>;
    const stagedCards = candidateCards[collection.key] as Array<Record<string, any>>;
    if (!Array.isArray(currentCards) || !Array.isArray(stagedCards) || !Array.isArray(manifest.assets) || !entry || !candidateEntry) throw Error('候选卡牌或目标目录不完整');
    const selected = stagedCards.find(card => card.id === item.cardId);
    if (!selected) throw Error('候选卡牌或目标目录不完整');
    const candidateEntries = paths.map(path => candidateManifest.assets.find(entry => entry.path === path));
    if (candidateEntries.some(entry => !entry)) throw Error('候选素材清单不完整');
    const originalCards = adoption?.patches.find(patch => patch.path === collection.path)?.before;
    const originalManifest = adoption?.patches.find(patch => patch.path === CARD_ASSET_MANIFEST_PATH)?.before;
    const originalEntry = adoption?.patches.find(patch => patch.path === entryPath)?.before;
    const beforeCard = originalCards ? (JSON.parse(Buffer.from(originalCards, 'base64').toString('utf8')) as Collection)[collection.key].find((card: Record<string, any>) => card.id === item.cardId) : undefined;
    const beforeEntries = originalManifest ? (JSON.parse(Buffer.from(originalManifest, 'base64').toString('utf8')) as Manifest).assets : [];
    const originalEntryValue = originalEntry ? JSON.parse(Buffer.from(originalEntry, 'base64').toString('utf8')) as Deck & Loadout : null;
    const currentCard = currentCards.find(card => card.id === item.cardId);
    if (undo && !eq(currentCard, selected)) throw Error('采用后的卡牌已有新修改，无法直接撤销');
    const nextCard = undo ? beforeCard : selected;
    const nextCards = { ...cards, [collection.key]: [...currentCards.filter(card => card.id !== item.cardId), ...(nextCard ? [nextCard] : [])] };
    // Preserve the original position of an existing card; changes to other cards remain intact.
    const index = currentCards.findIndex(card => card.id === item.cardId);
    if (nextCard && index >= 0) nextCards[collection.key].splice(index, 0, nextCards[collection.key].pop()!);
    const nextManifest = { ...manifest, assets: manifest.assets.filter(entry => !paths.includes(String(entry.path))) };
    let nextEntry: Deck | Loadout;
    if (collection.inDeck) {
      const deck = entry as Deck;
      const candidateDeck = candidateEntry as Deck;
      if (!Array.isArray(deck.cards) || !Array.isArray(candidateDeck.cards)) throw Error('候选卡组格式无效');
      const candidateDeckCard = candidateDeck.cards.find(card => card.id === item.cardId);
      if (!candidateDeckCard || undo && !eq(deck.cards.find(card => card.id === item.cardId), candidateDeckCard)) throw Error('候选卡组或采用后的卡组条目已变化');
      const beforeDeckCard = (originalEntryValue as Deck | null)?.cards.find(card => card.id === item.cardId);
      const nextDeck = { ...deck, cards: deck.cards.filter(card => card.id !== item.cardId) };
      const deckCard = undo ? beforeDeckCard : candidateDeckCard;
      if (deckCard) nextDeck.cards.push(deckCard);
      const deckIndex = deck.cards.findIndex(card => card.id === item.cardId);
      if (deckCard && deckIndex >= 0) nextDeck.cards.splice(deckIndex, 0, nextDeck.cards.pop()!);
      nextEntry = nextDeck;
    } else {
      const key = kind === 'pill' ? 'pillIds' : 'skillIds';
      const current = (entry as Loadout)[key];
      const staged = (candidateEntry as Loadout)[key];
      const original = (originalEntryValue as Loadout | null)?.[key];
      if ((entry as Loadout).schemaVersion !== 1 || (candidateEntry as Loadout).schemaVersion !== 1
        || !Array.isArray(current) || !Array.isArray(staged) || !staged.includes(item.cardId)
        || current.length > 3 || staged.length > 3 || new Set(current).size !== current.length || new Set(staged).size !== staged.length
        || current.some(id => typeof id !== 'string') || staged.some(id => typeof id !== 'string')) throw Error('候选战斗初始配置无效');
      if (undo && !current.includes(item.cardId)) throw Error('采用后的战斗初始配置已变化');
      const wanted = undo ? original?.includes(item.cardId) ?? false : true;
      const updated = current.filter(id => id !== item.cardId);
      if (wanted) {
        const position = current.indexOf(item.cardId);
        updated.splice(position >= 0 ? position : updated.length, 0, item.cardId);
      }
      if (updated.length > 3) throw Error('战斗初始配置槽位已满');
      nextEntry = { ...(entry as Loadout), [key]: updated };
    }
    for (const path of paths) {
      const current = manifest.assets.find(entry => entry.path === path);
      const expected = candidateManifest.assets.find(entry => entry.path === path);
      if (undo && !eq(current, expected)) throw Error(`采用后的素材记录已有新修改：${path}`);
      const target = undo ? beforeEntries.find(entry => entry.path === path) : expected;
      if (target) nextManifest.assets.push(target);
    }
    const patches: Patch[] = [
      { path: collection.path, before: encode(cardsBefore), after: mergedJson(collection.path, cardsBefore, nextCards) },
      { path: CARD_ASSET_MANIFEST_PATH, before: encode(manifestBefore), after: mergedJson(CARD_ASSET_MANIFEST_PATH, manifestBefore, nextManifest) },
      { path: entryPath, before: encode(entryBefore), after: mergedJson(entryPath, entryBefore, nextEntry) },
    ];
    for (const path of paths) {
      const prior = await bytes(join(base, path));
      const adopted = await readFile(join(item.repo, path));
      if (undo && !same(prior, adopted)) throw Error(`采用后的素材文件已有新修改：${path}`);
      const original = adoption?.patches.find(patch => patch.path === path)?.before ?? null;
      patches.push({ path, before: encode(prior), after: undo ? original : encode(adopted) });
    }
    return patches;
  };

  async function confirm(input: Record<string, unknown>) {
    const item = await candidate(input);
    if (item.status === 'adopted') return { candidate: item, adoptionId: item.adoptionId, reused: true };
    if (item.status !== 'candidate') throw Error('这个候选已经撤销，需建立新候选');
    if (item.kind === 'deck') {
      const { production } = await options.workflow.query({projectId:item.projectId,op:'production',productionId:item.productionId}) as {production:ProductionRecord};
      const batch = production.batch as import('./card-pipeline').CardBatch | undefined;
      if (!batch?.deck) throw Error('整套牌组方案已不存在');
      const report=inspectDeck(batch.cards,batch.deck,production.brief,production.gameCandidates);
      if (!report.confirmed || report.fingerprint !== (item.deckLogicFingerprint ?? item.fingerprint) || report.candidateId !== item.id) throw Error('整套草案已更新，请确认并试玩当前候选');
    }
    await options.previewEvidence(item);
    await checkSnapshot(item);
    if (item.sourceSnapshotTree && await (item.sourceSnapshotScope === 'runtime' ? gameRuntimeSnapshotTree : gameSourceSnapshotTree)(root(item.projectId)) !== item.sourceSnapshotTree) {
      throw Error('正式项目的游戏源码已改变，请建立并试玩新候选');
    }
    const targetRevision = item.kind === 'story' || item.kind === 'documents' || item.kind === 'deck'
      ? await storyTargetBaseRevision(root(item.projectId), item.baseDependencies ?? [])
      : await cardTargetBaseRevision(root(item.projectId), item.cardId, candidateAssetPaths(item), candidateCardKind(item));
    if (targetRevision !== item.targetBaseRevision) throw Error('正式项目的内容或依赖已改变，请建立新候选');
    const journal: Journal = { id: randomUUID(), candidateId: item.id, projectId: item.projectId, productionId: item.productionId, status: 'applying', createdAt: new Date().toISOString(), patches: await merge(item, false) };
    await writeJournal(journal);
    let adopted = false;
    try {
      await apply(root(item.projectId), journal.patches);
      journal.status = 'applied'; await writeJournal(journal);
      const result = await options.workflow.command('recordGameAdoption', { projectId: item.projectId, productionId: item.productionId, candidateId: item.id, status: 'adopted', adoptionId: journal.id });
      adopted = true;
      journal.status = 'complete'; await writeJournal(journal);
      return { ...result as object, adoptionId: journal.id };
    } catch (error) {
      if (!adopted) {
        const detail = await options.workflow.query({ projectId: item.projectId, op: 'production', productionId: item.productionId }) as { production: ProductionRecord };
        adopted = detail.production.gameCandidates?.some(candidate => candidate.id === item.id && candidate.status === 'adopted' && candidate.adoptionId === journal.id) ?? false;
      }
      if (adopted) throw error;
      journal.status = 'reverting'; await writeJournal(journal);
      await apply(root(item.projectId), journal.patches, true);
      journal.status = 'undone'; await writeJournal(journal);
      throw error;
    }
  }

  async function undo(input: Record<string, unknown>) {
    const item = await candidate(input);
    if (item.status === 'undone') return { candidate: item, reused: true };
    if (item.status !== 'adopted' || !item.adoptionId || item.adoptionId !== input.adoptionId) throw Error('采用记录不匹配');
    const old = await json<Journal | null>(journalPath({ projectId: item.projectId, id: item.adoptionId }), null);
    if (!old || old.status !== 'complete' || old.candidateId !== item.id) throw Error('找不到完整采用日志');
    const journal: Journal = { id: randomUUID(), candidateId: item.id, projectId: item.projectId, productionId: item.productionId, status: 'undoing', createdAt: new Date().toISOString(), patches: await merge(item, true, old) };
    await writeJournal(journal);
    await apply(root(item.projectId), journal.patches);
    const result = await options.workflow.command('recordGameAdoption', { projectId: item.projectId, productionId: item.productionId, candidateId: item.id, status: 'undone' });
    journal.status = 'undone'; await writeJournal(journal);
    return result;
  }

  async function recover() {
    for (const projectId of roots.keys()) {
      const dir = join(journals, projectId);
      const files = await readdir(dir).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; });
      for (const name of files.filter(name => name.endsWith('.json'))) {
        const journal = await json<Journal>(join(dir, name), null as never);
        if (!journal || !['applying', 'applied', 'reverting', 'undoing'].includes(journal.status)) continue;
        const detail = await options.workflow.query({ projectId, op: 'production', productionId: journal.productionId }) as { production: ProductionRecord };
        const item = detail.production.gameCandidates?.find(candidate => candidate.id === journal.candidateId);
        if (!item) throw Error(`采用日志没有对应候选：${journal.id}`);
        if (journal.status === 'undoing') {
          await apply(root(projectId), journal.patches);
          if (item.status === 'adopted') await options.workflow.command('recordGameAdoption', { projectId, productionId: item.productionId, candidateId: item.id, status: 'undone' });
          journal.status = 'undone'; await writeJournal(journal);
        } else if (item.status === 'adopted' && item.adoptionId === journal.id) {
          journal.status = 'complete'; await writeJournal(journal);
        } else {
          journal.status = 'reverting'; await writeJournal(journal);
          await apply(root(projectId), journal.patches, true);
          journal.status = 'undone'; await writeJournal(journal);
        }
      }
    }
  }

  return { confirm: (input: Record<string, unknown>) => serial(() => confirm(input)), undo: (input: Record<string, unknown>) => serial(() => undo(input)), recover: () => serial(recover), close: async () => { await queue; } };
}
