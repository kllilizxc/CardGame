import { createHash } from 'node:crypto';

export interface DeckPlan {
  id: string;
  title: string;
  targetSize: number;
  entries: Array<{ cardId: string; count: number }>;
  basisBrief: string;
  approvedFingerprint?: string;
}
type Card = { definition: Record<string, any>; sourceRevision?: string; artBrief?: string; art?: unknown; assembly?: unknown; presentation?: unknown };
const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const deckHash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
export const deckPath = (plan: DeckPlan) => `public/data/decks/worka-${plan.id}.json`;
export function validDeckTargetPath(path: string) {
  return /^public\/data\/cards\/(units|artifacts|talismans|fields)\.json$/.test(path)
    || /^public\/data\/decks\/worka-[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.json$/.test(path)
    || path === 'public/data/decks/starter-deck.json'
    || path === 'public/assets/asset-manifest.json'
    || /^public\/assets\/card-faces\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9._-]+\.png$/.test(path);
}
export function deckCandidateHash(item: Record<string, any>) {
  return deckHash({ kind: 'deck', targetId: item.targetId, deckPath: item.deckPath, deckCardIds: item.deckCardIds,
    deckCardFingerprints: item.deckCardFingerprints, placeholderCardIds: item.placeholderCardIds,
    ...(item.deckArtFingerprints ? { deckLogicFingerprint: item.deckLogicFingerprint, deckArtFingerprints: item.deckArtFingerprints } : {}),
    commit: item.commit, fingerprint: item.fingerprint, sourceTree: item.sourceSnapshotTree, sourceSnapshotScope: item.sourceSnapshotScope,
    targetBaseRevision: item.targetBaseRevision, validationManifest: item.validationManifest,
    dependencies: item.dependencies, baseDependencies: item.baseDependencies, changedPaths: item.changedPaths });
}

export function normalizeDeckPlan(value: unknown, brief: string, previous?: DeckPlan): DeckPlan {
  const raw = value as DeckPlan;
  if (!raw || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw.id ?? '') || typeof raw.title !== 'string' || !raw.title.trim()) throw Error('牌组需要安全的独立 ID 和名称');
  if (previous && previous.id !== raw.id) throw Error('已有牌组 ID 不可修改；另建制作单可设计新牌组');
  if (!Number.isInteger(raw.targetSize) || raw.targetSize < 20 || raw.targetSize > 30) throw Error('独立牌组目标需要 20–30 张');
  if (!Array.isArray(raw.entries) || raw.entries.length > 30) throw Error('牌组需要最多 30 种卡牌的数量方案');
  const seen = new Set<string>();
  const entries = raw.entries.map(entry => {
    if (!entry || typeof entry.cardId !== 'string' || !entry.cardId.trim() || seen.has(entry.cardId)) throw Error('牌组条目需要唯一卡牌 ID');
    if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > 3) throw Error('每种卡牌需要 1–3 张副本');
    seen.add(entry.cardId);
    return { cardId: entry.cardId, count: entry.count };
  });
  return { id: raw.id, title: raw.title.trim(), targetSize: raw.targetSize, entries, basisBrief: brief,
    ...(previous?.approvedFingerprint ? { approvedFingerprint: previous.approvedFingerprint } : {}) };
}

export function deckCardFingerprints(cards: Card[], plan: DeckPlan) {
  return Object.fromEntries(plan.entries.map(entry => { const card=cards.find(card=>card.definition.id===entry.cardId); return [entry.cardId,deckHash(card?{definition:card.definition,sourceRevision:card.sourceRevision}:null)]; }));
}
export function deckArtFingerprints(cards: Card[], plan: DeckPlan) {
  return Object.fromEntries(plan.entries.map(entry => {
    const card = cards.find(item => item.definition.id === entry.cardId);
    return [entry.cardId, deckHash(card ? { artBrief: card.artBrief, art: card.art, assembly: card.assembly, presentation: card.presentation } : null)];
  }));
}
export function deckFingerprint(cards: Card[], plan: DeckPlan, brief: string) {
  return deckHash({ id: plan.id, title: plan.title, targetSize: plan.targetSize, entries: [...plan.entries].sort((a, b) => a.cardId.localeCompare(b.cardId)), brief, cards: deckCardFingerprints(cards, plan) });
}

/** Checks deck counts and supported references; no balance or playtest claim. */
export function inspectDeck(cards: Card[], plan: DeckPlan, brief: string, candidates: Array<any> = []) {
  const errors: string[] = [], warnings: string[] = [];
  const totalCopies = plan.entries.reduce((total, entry) => total + entry.count, 0);
  const used = plan.entries.map(entry => cards.find(card => card.definition.id === entry.cardId));
  if (totalCopies !== plan.targetSize) errors.push(`当前 ${totalCopies} 张，目标 ${plan.targetSize} 张`);
  for (const [index, entry] of plan.entries.entries()) {
    const card = used[index]?.definition;
    if (!card) { errors.push(`未找到卡牌 ${entry.cardId} 的草稿`); continue; }
    if (!['unit', 'artifact', 'talisman', 'field'].includes(card.kind)) errors.push(`${card.name} 属于战斗槽位，不能计入牌组`);
    if (entry.count > Math.min(3, card.limitPerDeck ?? 3)) errors.push(`${card.name} 超过单卡副本上限`);
  }
  const units = used.filter(card => card?.definition.kind === 'unit');
  if (!units.length) errors.push('牌组至少需要一张单位卡');
  for (const card of used) for (const effect of card?.definition.effects ?? []) {
    const required = effect.target?.requiredLabelsAllOf;
    if (['singleAlly', 'allAllies'].includes(effect.target?.scope) && Array.isArray(required) && required.length
      && !units.some(unit => required.every(label => unit?.definition.labels?.includes(label)))) warnings.push(`${card!.definition.name} 的己方标签目标在本牌组中不存在：${required.join('、')}`);
  }
  const fingerprint = deckFingerprint(cards, plan, brief);
  const latest = candidates.filter(item => item.kind === 'deck' && item.targetId === plan.id && item.status !== 'undone').at(-1);
  const current = latest?.deckArtFingerprints
    ? latest.deckLogicFingerprint === fingerprint && deckHash(latest.deckArtFingerprints) === deckHash(deckArtFingerprints(cards, plan))
    : latest?.fingerprint === fingerprint;
  const hashes = deckCardFingerprints(cards, plan);
  const changedCardIds = latest ? Object.keys(hashes).filter(id => hashes[id] !== latest.deckCardFingerprints?.[id]) : [];
  const basisChanged = plan.basisBrief !== brief;
  const confirmed = !basisChanged && plan.approvedFingerprint === fingerprint;
  const adopted = current && latest?.status === 'adopted';
  const status = basisChanged ? 'basis-changed' : errors.length ? 'incomplete' : !confirmed ? 'needs-review' : adopted ? 'adopted' : current ? 'candidate' : latest ? 'stale' : 'ready';
  const next = status === 'basis-changed' ? '上游简报已变化：核对草稿并保存牌组方案，再重新确认'
    : errors.length ? '补齐卡牌草稿与数量方案' : !confirmed ? '确认整套卡牌草案' : adopted ? '已加入正式游戏，可在牌组试炼中选择并开局' : current ? '在试玩便笺验证整套候选，再决定调整' : '建立当前整套试玩候选';
  return { totalCopies, distinctCards: plan.entries.length, targetSize: plan.targetSize, errors, warnings, legal: errors.length === 0,
    fingerprint, confirmed, basisChanged, status, next, changedCardIds, candidateId: current ? latest.id : undefined,
    staleCandidateId: latest && !current ? latest.id : undefined, checkScope: '数量、副本与组合目标引用；不代表实战平衡验证' };
}

/** Confirmation is a user fact; generic batch writes cannot forge it. */
export function assertDeckWriteAccess(method: string, input: Record<string, any>, callerKind: string) {
  if (method === 'confirmDeckDraft' && callerKind !== 'user') throw Error('整套卡牌草案需要用户明确确认');
  if (['updateProduction','upsertProduction'].includes(method) && (input.batch?.kind === 'card-generation' || input.patch?.batch?.kind === 'card-generation')) throw Error('卡牌批次内容与确认状态只能通过 cardWorkflow 专用动作更新');
}
