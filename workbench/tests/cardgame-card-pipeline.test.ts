import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createContentService } from '../plugins/cardgame-content/src/content';
import { createWorkflowService } from '../plugins/cardgame-content/src/workflow';
import { cardStage, createCardPipeline } from '../plugins/cardgame-content/src/card-pipeline';
import type { CardImageGenerator } from '../plugins/cardgame-content/src/codex-imagegen';
import { createGameCandidateService } from '../plugins/cardgame-content/src/game-candidates';
import { createGameAdoptionService } from '../plugins/cardgame-content/src/game-adoption';
import { createCardWorkflow } from '../templates/cardgame-library/actions';
import { decodeContentRef } from '../templates/cardgame-library/model';

const unit = { id: 'U_001', name: 'Fox', kind: 'unit', description: 'Spirit fox', rarity: 'common', realmId: 'qi1', race: '兽族', attack: 4, health: 2, linggen: ['木'], gongfaIds: [] };
const git = promisify(execFile);
async function fixture(imageGenerator?: (generatedImagesRoot: string) => CardImageGenerator, existingArtwork = false) {
  const directory = await mkdtemp(join(tmpdir(), 'card-pipeline-'));
  const root = join(directory, 'game'), dataRoot = join(directory, 'worka');
  const generatedImagesRoot = join(directory, 'codex', 'generated_images');
  await mkdir(generatedImagesRoot, { recursive: true });
  await mkdir(join(root, 'public/data/cards'), { recursive: true });
  await writeFile(join(root, 'public/data/cards/units.json'), JSON.stringify({ units: [{ ...unit, ...(existingArtwork ? { cardFace: { artwork: '/assets/card-faces/U_001/original.png' } } : {}) }] }));
  await mkdir(join(root, 'public/data/decks'), { recursive: true });
  await writeFile(join(root, 'public/data/decks/starter-deck.json'), JSON.stringify({ cards: [] }));
  await mkdir(join(root, 'public/assets'), { recursive: true });
  await writeFile(join(root, 'public/assets/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, assets: [] }));
  if (existingArtwork) {
    await mkdir(join(root, 'public/assets/card-faces/U_001'), { recursive: true });
    await writeFile(join(root, 'public/assets/card-faces/U_001/original.png'), await sharp({ create: { width: 512, height: 512, channels: 4, background: '#337751' } }).png().toBuffer());
  }

  await git('git', ['init', '-q', root]);
  await git('git', ['-C', root, 'add', '-A']);
  await git('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline']);
  const options = { dataRoot, projects: [{ id: 'p', root }] };
  const content = createContentService(options), workflow = createWorkflowService(options);
  const candidates = createGameCandidateService({ ...options, content, workflow });
  const adoptions = createGameAdoptionService({ ...options, workflow, previewEvidence: async () => {} });
  const pipeline = createCardPipeline(content, workflow, {}, candidates, { generatedImagesRoot, imageGenerator: imageGenerator?.(generatedImagesRoot) });
  const created = await pipeline.command('createCardBatch', { projectId: 'p', cardIds: ['U_001'], featureId: 'fox-feature', brief: 'Make a fox' });
  const productionId = created.production.id;
  const get = () => pipeline.query({ projectId: 'p', productionId, op: 'cardBatch' }) as Promise<any>;
  const run = async (operation: string, extra: Record<string, any> = {}) => pipeline.command(operation, { projectId: 'p', productionId, cardId: 'U_001', baseRevision: (await get()).production.revision, ...extra });
  const bytes = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#337751' } }).png().toBuffer();
  const art = async () => {
    const request = await run('requestCardArt');
    await run('attachCardArt', { requestId: request.request.id, base64: bytes.toString('base64') });
  };
  return { directory, root, generatedImagesRoot, content, workflow, candidates, adoptions, pipeline, productionId, get, run, bytes, art, close: async () => { await pipeline.close(); await candidates.close(); await adoptions.close(); await Promise.all([content.close(), workflow.close()]); await rm(directory, { recursive: true, force: true }); } };
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = await read();
    if (done(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('等待卡牌工作流状态超时');
}

test('automatic Codex art runs once, then assembles and stages a playable candidate', async () => {
  let generated = 0;
  const f = await fixture(root => ({
    available: async () => true,
    generate: async () => { generated++; return join(root, 'run-1', 'fox.png'); },
  }));
  try {
    await mkdir(join(f.generatedImagesRoot, 'run-1'), { recursive: true });
    await writeFile(join(f.generatedImagesRoot, 'run-1', 'fox.png'), f.bytes);
    const result = await f.run('requestCardArt');
    expect(result.automaticGeneration).toBe(true);
    const completed = await waitFor(f.get, value => value.stages.U_001 === 'done' || value.batch.cards[0].artGeneration?.status === 'failed');
    expect(completed.batch.cards[0].artGeneration?.status).toBe('ready');
    expect(completed.stages.U_001).toBe('done');
    expect(generated).toBe(1);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0]).toEqual(unit);
    expect(completed.production.gameCandidates).toHaveLength(1);
  } finally { await f.close(); }
}, 30_000);

test('late automatic art cannot attach to a revised brief, and a failed request can retry', async () => {
  let release!: (path: string) => void;
  let calls = 0;
  const f = await fixture(() => ({
    available: async () => true,
    generate: async () => {
      calls++;
      if (calls === 1) return new Promise<string>(resolve => { release = resolve; });
      if (calls === 2) throw Error('temporary image failure');
      return join(f.generatedImagesRoot, 'run-3', 'fox.png');
    },
  }));
  try {
    await f.run('requestCardArt');
    const first = (await f.get()).batch.cards[0].artRequest.id;
    await f.run('saveCardDraft', { artBrief: 'A silver fox' });
    await mkdir(join(f.generatedImagesRoot, 'run-3'), { recursive: true });
    await writeFile(join(f.generatedImagesRoot, 'run-3', 'fox.png'), f.bytes);
    release(join(f.generatedImagesRoot, 'run-3', 'fox.png'));
    await f.run('requestCardArt');
    const failed = await waitFor(f.get, value => value.batch.cards[0].artGeneration?.status === 'failed');
    expect(failed.batch.cards[0].artRequest.id).not.toBe(first);
    expect(failed.batch.cards[0].art).toBeUndefined();
    expect(failed.batch.cards[0].artGeneration.error).toContain('temporary image failure');
    const retried = await f.run('requestCardArt');
    expect(retried.automaticGeneration).toBe(true);
    const completed = await waitFor(f.get, value => value.stages.U_001 === 'done' || value.batch.cards[0].artGeneration?.status === 'failed');
    expect(completed.stages.U_001).toBe('done');
    expect(completed.batch.cards[0].artGeneration.status).toBe('ready');
    expect(calls).toBe(3);
  } finally { await f.close(); }
}, 30_000);

test('card workflow builds a separate playable commit, then adopts and undoes that exact card', async () => {
  const f = await fixture();
  try {
    expect((await f.get()).stages.U_001).toBe('review');
    await f.art();
    expect((await f.get()).stages.U_001).toBe('assemble');
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0]).toEqual(unit);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/decks/starter-deck.json'), 'utf8')).cards).toEqual([]);
    await f.run('assembleCardFaces');
    const batch = (await f.get()).batch;
    expect(Object.keys(batch.cards[0].assembly.variants)).toEqual(['jade', 'scroll']);
    expect(batch.cards[0].assembly.variants.jade.previewId).not.toBe(batch.cards[0].assembly.variants.jade.runtimeId);
    const staged = await f.run('integrateCard');
    const identity = { projectId: 'p', productionId: f.productionId, candidateId: staged.candidate.id, featureId: 'fox-feature', candidateHash: staged.candidate.candidateHash, targetBaseRevision: staged.candidate.targetBaseRevision, validationManifest: staged.candidate.validationManifest };
    expect(staged.candidate.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0]).toEqual(unit);
    const candidateRoot = staged.candidate.repo;
    const card = JSON.parse(await readFile(join(candidateRoot, 'public/data/cards/units.json'), 'utf8')).units[0];
    expect(card.attack).toBe(4); expect(card.cardFace.themeId).toBe('jade');
    for (const variant of Object.values(card.cardFace.variants) as any[]) {
      const metadata = await sharp(await readFile(join(candidateRoot, 'public', variant.texture))).metadata();
      expect(metadata.width).toBe(540); expect(metadata.height).toBe(780);
    }
    expect((await f.get()).stages.U_001).toBe('done');
    expect((await f.run('integrateCard')).reused).toBe(true);
    const beforeUnits = await readFile(join(f.root, 'public/data/cards/units.json'));
    const beforeDeck = await readFile(join(f.root, 'public/data/decks/starter-deck.json'));
    const beforeManifest = await readFile(join(f.root, 'public/assets/asset-manifest.json'));
    const adopted = await f.adoptions.confirm(identity);
    expect(adopted.adoptionId).toBeString();
    expect((await f.adoptions.confirm(identity)).reused).toBe(true);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0].cardFace.themeId).toBe('jade');
    expect(JSON.parse(await readFile(join(f.root, 'public/data/decks/starter-deck.json'), 'utf8')).cards).toEqual([{ id: 'U_001', count: 1 }]);
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0]).toEqual(unit);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/decks/starter-deck.json'), 'utf8')).cards).toEqual([]);
    expect(await readFile(join(f.root, 'public/data/cards/units.json'))).toEqual(beforeUnits);
    expect(await readFile(join(f.root, 'public/data/decks/starter-deck.json'))).toEqual(beforeDeck);
    expect(await readFile(join(f.root, 'public/assets/asset-manifest.json'))).toEqual(beforeManifest);
    const restaged = await f.run('integrateCard');
    expect(restaged.candidate.id).not.toBe(staged.candidate.id);
    expect((await f.run('integrateCard')).candidate.id).toBe(restaged.candidate.id);
    await f.run('saveCardDraft', { presentation: { themeId: 'scroll' } });
    const switched = await f.get();
    expect(switched.batch.cards[0].art).toEqual(batch.cards[0].art);
    expect(switched.batch.cards[0].assembly).toEqual(batch.cards[0].assembly);
    expect(switched.stages.U_001).toBe('integrate');
    const second = await f.run('integrateCard');
    expect(second.candidate.commit).not.toBe(staged.candidate.commit);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0]).toEqual(unit);
    const libraryContext = {
      note: { id: 'cards-note' },
      store: { read: async () => ({ value: { projectId: 'p', notes: { production: 'production-note' } }, revision: '1' }) },
      resources: { read: async ({ input }: any) => ({ data: await f.content.query(input) }) },
      extensions: { request: async (_extension: string, method: string, input: any) => ['createCardBatch', 'saveCardDraft'].includes(method) ? f.pipeline.command(method, input) : f.content.command(method as any, input) },
    } as any;
    const followup = await createCardWorkflow({ itemIds: [unit.id], featureId: 'fox-feature' }, libraryContext);
    expect(followup.noteId).toBe('production-note');
    const followupId = decodeContentRef(followup.itemId)?.id;
    expect(followupId).toBeString();
    const followupBatch = await f.pipeline.query({ projectId: 'p', productionId: followupId, op: 'cardBatch' }) as any;
    expect(followupBatch.stages.U_001).toBe('review');
    const sourceRevision = (await f.content.query({ projectId: 'p', op: 'card', id: unit.id }) as any).revision;
    const edited = await createCardWorkflow({ itemIds: [unit.id], featureId: 'fox-feature', draft: { ...unit, attack: 9 }, expectedRevision: sourceRevision }, libraryContext);
    const editedId = decodeContentRef(edited.itemId)?.id;
    expect((await f.pipeline.query({ projectId: 'p', productionId: editedId, op: 'cardBatch' }) as any).batch.cards[0].definition.attack).toBe(9);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0].attack).toBe(4);
    await expect(f.workflow.command('reserveProduction', { projectId: 'p', productionId: f.productionId })).rejects.toThrow('Codex');
    const rows = await f.workflow.query({ projectId: 'p', op: 'productions' }) as any;
    expect(rows.items[0].workflowKind).toBe('card-generation');
  } finally { await f.close(); }
}, 30_000);

test('artifact candidate uses its own collection and preserves unrelated cards during adopt and undo', async () => {
  const f = await fixture();
  const artifact = { id: 'AR_QA', name: 'Jade Sword', kind: 'artifact', description: 'A plain sword', rarity: 'common', gradeId: 'grade-1', equipTarget: 'unit', elements: [] };
  const other = { ...artifact, id: 'AR_OTHER', name: 'Other sword' };
  try {
    const path = join(f.root, 'public/data/cards/artifacts.json');
    await writeFile(path, JSON.stringify({ artifacts: [] }));
    const created = await f.pipeline.command('createCardBatch', { projectId: 'p', cards: [artifact], featureId: 'artifact-feature', brief: 'Make a sword' }) as any;
    const productionId = created.production.id;
    const get = () => f.pipeline.query({ projectId: 'p', productionId, op: 'cardBatch' }) as Promise<any>;
    const run = async (operation: string, extra: Record<string, any> = {}) => f.pipeline.command(operation, { projectId: 'p', productionId, cardId: artifact.id, baseRevision: (await get()).production.revision, ...extra });
    const request = await run('requestCardArt') as any;
    await run('attachCardArt', { requestId: request.request.id, base64: f.bytes.toString('base64') });
    await run('assembleCardFaces');
    const staged = await run('integrateCard') as any;
    expect(staged.candidate.dependencies.some((item: any) => item.path === 'public/data/cards/artifacts.json')).toBe(true);
    expect(staged.candidate.dependencies.some((item: any) => item.path === 'public/data/cards/units.json')).toBe(false);
    expect(JSON.parse(await readFile(path, 'utf8')).artifacts).toEqual([]);
    expect(JSON.parse(await readFile(join(staged.candidate.repo, 'public/data/cards/artifacts.json'), 'utf8')).artifacts[0].cardFace).toBeDefined();
    await writeFile(path, JSON.stringify({ artifacts: [other] }));
    const identity = { projectId: 'p', productionId, candidateId: staged.candidate.id, featureId: 'artifact-feature', candidateHash: staged.candidate.candidateHash, targetBaseRevision: staged.candidate.targetBaseRevision, validationManifest: staged.candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity) as any;
    expect(JSON.parse(await readFile(path, 'utf8')).artifacts.map((item: any) => item.id)).toEqual(['AR_OTHER', 'AR_QA']);
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(JSON.parse(await readFile(path, 'utf8')).artifacts).toEqual([other]);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0]).toEqual(unit);
  } finally { await f.close(); }
}, 30_000);

for (const kind of ['talisman', 'field'] as const) test(`${kind} candidate enters the starter deck; adopt and undo keep unrelated edits`, async () => {
  const f = await fixture();
  const collection = kind === 'talisman' ? 'talismans' : 'fields';
  const prefix = kind === 'talisman' ? 'TL' : 'FD';
  const definition = (id: string) => ({ id, name: id, kind, description: 'Battle card', rarity: 'common',
    ...(kind === 'talisman' ? { isInstant: true, target: 'unit' } : { symmetric: true }), effects: [] });
  const card = definition(`${prefix}_NEW`);
  const other = definition(`${prefix}_OTHER`);
  const cardPath = join(f.root, `public/data/cards/${collection}.json`);
  const deckPath = join(f.root, 'public/data/decks/starter-deck.json');
  try {
    await writeFile(cardPath, JSON.stringify({ [collection]: [] }));
    const created = await f.pipeline.command('createCardBatch', { projectId: 'p', cards: [card], featureId: `${kind}-feature`, brief: `Make ${kind}` }) as any;
    const productionId = created.production.id;
    const get = () => f.pipeline.query({ projectId: 'p', productionId, op: 'cardBatch' }) as Promise<any>;
    const run = async (operation: string, extra: Record<string, any> = {}) => f.pipeline.command(operation,
      { projectId: 'p', productionId, cardId: card.id, baseRevision: (await get()).production.revision, ...extra });
    const request = await run('requestCardArt') as any;
    await run('attachCardArt', { requestId: request.request.id, base64: f.bytes.toString('base64') });
    await run('assembleCardFaces');
    const staged = await run('integrateCard') as any;
    expect(staged.candidate.dependencies.some((item: any) => item.path === `public/data/cards/${collection}.json`)).toBe(true);
    expect(staged.candidate.dependencies.some((item: any) => item.path === 'public/data/decks/starter-deck.json')).toBe(true);
    expect(JSON.parse(await readFile(cardPath, 'utf8'))[collection]).toEqual([]);
    expect(JSON.parse(await readFile(deckPath, 'utf8')).cards).toEqual([]);
    const stagedCards = JSON.parse(await readFile(join(staged.candidate.repo, `public/data/cards/${collection}.json`), 'utf8'))[collection];
    expect(stagedCards[0].cardFace.variants).toHaveProperty('jade');
    expect(stagedCards[0].cardFace.variants).toHaveProperty('scroll');
    expect(JSON.parse(await readFile(join(staged.candidate.repo, 'public/data/decks/starter-deck.json'), 'utf8')).cards)
      .toEqual([{ id: card.id, count: 1 }]);
    await writeFile(cardPath, JSON.stringify({ [collection]: [other] }));
    const identity = { projectId: 'p', productionId, candidateId: staged.candidate.id, featureId: `${kind}-feature`,
      candidateHash: staged.candidate.candidateHash, targetBaseRevision: staged.candidate.targetBaseRevision,
      validationManifest: staged.candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity) as any;
    expect(JSON.parse(await readFile(cardPath, 'utf8'))[collection].map((item: any) => item.id)).toEqual([other.id, card.id]);
    expect(JSON.parse(await readFile(deckPath, 'utf8')).cards).toEqual([{ id: card.id, count: 1 }]);
    await writeFile(deckPath, JSON.stringify({ cards: [{ id: card.id, count: 1 }, { id: other.id, count: 1 }] }));
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(JSON.parse(await readFile(cardPath, 'utf8'))[collection]).toEqual([other]);
    expect(JSON.parse(await readFile(deckPath, 'utf8')).cards).toEqual([{ id: other.id, count: 1 }]);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0]).toEqual(unit);
  } finally { await f.close(); }
}, 30_000);

for (const kind of ['pill', 'skill'] as const) test(`${kind} candidate enters the battle loadout, then undo preserves a later unrelated slot`, async () => {
  const f = await fixture();
  const collection = kind === 'pill' ? 'pills' : 'skills';
  const prefix = kind === 'pill' ? 'PL' : 'SK';
  const key = kind === 'pill' ? 'pillIds' : 'skillIds';
  const definition = (id: string) => ({ id, name: id, kind, description: 'Battle action', rarity: 'common',
    ...(kind === 'pill' ? { grade: 1, isInstant: true, target: 'player' } : { cooldownType: 'perBattle' }), effects: [] });
  const card = definition(`${prefix}_NEW`);
  const existing = definition(`${prefix}_BASE`);
  const later = definition(`${prefix}_LATER`);
  const cardPath = join(f.root, `public/data/cards/${collection}.json`);
  const loadoutPath = join(f.root, 'public/data/config/battle-loadout.json');
  try {
    await writeFile(cardPath, JSON.stringify({ [collection]: [existing, later] }));
    await mkdir(join(f.root, 'public/data/config'), { recursive: true });
    await writeFile(loadoutPath, JSON.stringify({ schemaVersion: 1, pillIds: kind === 'pill' ? [existing.id] : [], skillIds: kind === 'skill' ? [existing.id] : [] }));
    const created = await f.pipeline.command('createCardBatch', { projectId: 'p', cards: [card], featureId: `${kind}-feature`, brief: `Make ${kind}` }) as any;
    const productionId = created.production.id;
    const get = () => f.pipeline.query({ projectId: 'p', productionId, op: 'cardBatch' }) as Promise<any>;
    const run = async (operation: string, extra: Record<string, any> = {}) => f.pipeline.command(operation, { projectId: 'p', productionId, cardId: card.id, baseRevision: (await get()).production.revision, ...extra });
    const request = await run('requestCardArt') as any;
    await run('attachCardArt', { requestId: request.request.id, base64: f.bytes.toString('base64') });
    await run('assembleCardFaces');
    const staged = await run('integrateCard') as any;
    expect(staged.candidate.dependencies.some((item: any) => item.path === `public/data/cards/${collection}.json`)).toBe(true);
    expect(staged.candidate.dependencies.some((item: any) => item.path === 'public/data/config/battle-loadout.json')).toBe(true);
    expect(staged.candidate.dependencies.some((item: any) => item.path === 'public/data/decks/starter-deck.json')).toBe(false);
    expect(JSON.parse(await readFile(loadoutPath, 'utf8'))[key]).toEqual([existing.id]);
    expect(JSON.parse(await readFile(join(staged.candidate.repo, 'public/data/config/battle-loadout.json'), 'utf8'))[key]).toEqual([existing.id, card.id]);
    const identity = { projectId: 'p', productionId, candidateId: staged.candidate.id, featureId: `${kind}-feature`, candidateHash: staged.candidate.candidateHash, targetBaseRevision: staged.candidate.targetBaseRevision, validationManifest: staged.candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity) as any;
    expect(JSON.parse(await readFile(loadoutPath, 'utf8'))[key]).toEqual([existing.id, card.id]);
    const external = JSON.parse(await readFile(loadoutPath, 'utf8'));
    external[key].push(later.id);
    await writeFile(loadoutPath, JSON.stringify(external));
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(JSON.parse(await readFile(loadoutPath, 'utf8'))[key]).toEqual([existing.id, later.id]);
    expect(JSON.parse(await readFile(cardPath, 'utf8'))[collection]).toEqual([existing, later]);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/decks/starter-deck.json'), 'utf8')).cards).toEqual([]);
  } finally { await f.close(); }
}, 30_000);

test('pill adoption undo restores untouched CRLF and compact JSON bytes', async () => {
  const f = await fixture();
  const cardPath = join(f.root, 'public/data/cards/pills.json');
  const loadoutPath = join(f.root, 'public/data/config/battle-loadout.json');
  const manifestPath = join(f.root, 'public/assets/asset-manifest.json');
  const card = { id: 'PL_NEW', name: 'White leaf', kind: 'pill', description: 'Restore health', rarity: 'common',
    grade: 1, isInstant: true, target: 'player', effects: [] };
  try {
    await mkdir(join(f.root, 'public/data/config'), { recursive: true });
    await writeFile(cardPath, '{\r\n  "pills": []\r\n}\r\n');
    await writeFile(loadoutPath, '{"schemaVersion":1,"pillIds":[],"skillIds":[]}\n');
    const before = await Promise.all([cardPath, loadoutPath, manifestPath].map(path => readFile(path)));
    const created = await f.pipeline.command('createCardBatch', { projectId: 'p', cards: [card], featureId: 'pill-feature', brief: 'Make a healing pill' }) as any;
    const productionId = created.production.id;
    const get = () => f.pipeline.query({ projectId: 'p', productionId, op: 'cardBatch' }) as Promise<any>;
    const run = async (operation: string, extra: Record<string, any> = {}) => f.pipeline.command(operation,
      { projectId: 'p', productionId, cardId: card.id, baseRevision: (await get()).production.revision, ...extra });
    const request = await run('requestCardArt') as any;
    await run('attachCardArt', { requestId: request.request.id, base64: f.bytes.toString('base64') });
    await run('assembleCardFaces');
    const staged = await run('integrateCard') as any;
    const identity = { projectId: 'p', productionId, candidateId: staged.candidate.id, featureId: 'pill-feature',
      candidateHash: staged.candidate.candidateHash, targetBaseRevision: staged.candidate.targetBaseRevision,
      validationManifest: staged.candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity) as any;
    expect(JSON.parse(await readFile(loadoutPath, 'utf8')).pillIds).toContain(card.id);
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    const restored = await Promise.all([cardPath, loadoutPath, manifestPath].map(path => readFile(path)));
    expect(restored).toEqual(before);
    expect((await f.workflow.query({ projectId: 'p', op: 'production', productionId }) as any).production.gameCandidates[0].status).toBe('undone');
  } finally { await f.close(); }
}, 90_000);

test('old image deliveries and concurrent edits cannot overwrite a revised draft; numeric edits reuse art', async () => {
  const f = await fixture();
  try {
    await f.art();
    const first = await f.get();
    await f.run('saveCardDraft', { definition: { ...unit, attack: 6 } });
    let current = await f.get();
    expect(current.stages.U_001).toBe('review');
    expect(current.batch.cards[0].art).toEqual(first.batch.cards[0].art);
    await f.run('approveCardDrafts');
    expect((await f.get()).stages.U_001).toBe('assemble');
    await expect(f.run('saveCardDraft', { baseRevision: first.production.revision, definition: unit })).rejects.toThrow('已变化');
    await f.run('saveCardDraft', { artBrief: 'Black fox on snow' });
    expect((await f.get()).batch.cards[0].artRequest).toBeUndefined();
    await expect(f.run('attachCardArt', { requestId: first.batch.cards[0].artRequest.id, base64: f.bytes.toString('base64') })).rejects.toThrow('过期');
    expect((await f.get()).stages.U_001).toBe('art');
    await expect(f.run('setCardDrafts', { cards: [unit] })).rejects.toThrow('整批覆盖');
  } finally { await f.close(); }
});

test('Codex generated image paths attach only from the trusted output directory and current request', async () => {
  const f = await fixture();
  try {
    const request = await f.run('requestCardArt');
    const output = join(f.generatedImagesRoot, 'run-1', 'fox.png');
    await mkdir(join(f.generatedImagesRoot, 'run-1'), { recursive: true });
    await writeFile(output, f.bytes);
    const outside = join(f.directory, 'outside.png');
    await writeFile(outside, f.bytes);
    await symlink(outside, join(f.generatedImagesRoot, 'escaped.png'));
    await expect(f.run('attachCardArt', { requestId: request.request.id, generatedImagePath: outside })).rejects.toThrow('仅接受');
    await expect(f.run('attachCardArt', { requestId: request.request.id, generatedImagePath: join(f.generatedImagesRoot, 'escaped.png') })).rejects.toThrow('仅接受');
    await expect(f.run('attachCardArt', { requestId: request.request.id, generatedImagePath: output, base64: f.bytes.toString('base64') })).rejects.toThrow('只提供');
    await f.run('attachCardArt', { requestId: request.request.id, generatedImagePath: output });
    expect((await f.get()).stages.U_001).toBe('assemble');
    await f.run('saveCardDraft', { artBrief: 'A newly requested image' });
    await expect(f.run('attachCardArt', { requestId: request.request.id, generatedImagePath: output })).rejects.toThrow('过期');
  } finally { await f.close(); }
});

test('integration detects source edits and does not overwrite the game; workflow survives service restart', async () => {
  const f = await fixture();
  try {
    await f.art(); await f.run('assembleCardFaces');
    const source = await f.content.query({ projectId: 'p', op: 'card', id: unit.id }) as any;
    await f.content.command('updateCard', { projectId: 'p', id: unit.id, expectedRevision: source.revision, patch: { health: 99 } });
    await expect(f.run('integrateCard')).rejects.toThrow();
    expect((await f.content.query({ projectId: 'p', op: 'card', id: unit.id }) as any).json.health).toBe(99);
    await f.pipeline.close(); await f.workflow.close();
    const restored = createWorkflowService({ dataRoot: join(f.directory, 'worka'), projects: [{ id: 'p', root: f.root }] });
    try { const data = await restored.query({ projectId: 'p', op: 'production', id: f.productionId }) as any; expect(cardStage(data.production.batch.cards[0])).toBe('integrate'); }
    finally { await restored.close(); }
  } finally { await f.close(); }
}, 30_000);

test('new unit drafts create a game card once and reject collisions', async () => {
  const f = await fixture();
  try {
    const input = { projectId: 'p', card: { ...unit, id: 'U_002' }, expectedRevision: null };
    await f.content.command('savePipelineCard', input);
    await expect(f.content.command('savePipelineCard', input)).rejects.toThrow('already exists');
    const disk = JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8'));
    expect(disk.units.map((card: any) => card.id)).toEqual(['U_001', 'U_002']);
  } finally { await f.close(); }
});

test('adoption preserves unrelated card edits and refuses a changed adopted card on undo', async () => {
  const f = await fixture();
  try {
    await f.art(); await f.run('assembleCardFaces');
    const { candidate } = await f.run('integrateCard');
    const identity = { projectId: 'p', productionId: f.productionId, candidateId: candidate.id, featureId: 'fox-feature', candidateHash: candidate.candidateHash, targetBaseRevision: candidate.targetBaseRevision, validationManifest: candidate.validationManifest };
    const other = { ...unit, id: 'U_002', name: 'Other fox' };
    await writeFile(join(f.root, 'public/data/cards/units.json'), JSON.stringify({ units: [unit, other] }));
    const adopted = await f.adoptions.confirm(identity);
    const after = JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8'));
    expect(after.units.find((card: any) => card.id === 'U_002')).toEqual(other);
    after.units.find((card: any) => card.id === 'U_001').attack = 99;
    await writeFile(join(f.root, 'public/data/cards/units.json'), JSON.stringify(after));
    await expect(f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId })).rejects.toThrow('已有新修改');
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units.find((card: any) => card.id === 'U_001').attack).toBe(99);
  } finally { await f.close(); }
}, 30_000);

test('lost adoption acknowledgement is recovered without rolling back an already recorded adoption', async () => {
  const f = await fixture();
  try {
    await f.art(); await f.run('assembleCardFaces');
    const { candidate } = await f.run('integrateCard');
    const identity = { projectId: 'p', productionId: f.productionId, candidateId: candidate.id, featureId: 'fox-feature', candidateHash: candidate.candidateHash, targetBaseRevision: candidate.targetBaseRevision, validationManifest: candidate.validationManifest };
    const options = { dataRoot: join(f.directory, 'worka'), projects: [{ id: 'p', root: f.root }], previewEvidence: async () => {} };
    const lostAck = createGameAdoptionService({ ...options, workflow: {
      ...f.workflow,
      command: async (method: string, input: any) => {
        const result = await f.workflow.command(method, input);
        if (method === 'recordGameAdoption') throw Error('lost acknowledgement');
        return result;
      },
    } as any });
    await expect(lostAck.confirm(identity)).rejects.toThrow('lost acknowledgement');
    await lostAck.close();
    expect(JSON.parse(await readFile(join(f.root, 'public/data/cards/units.json'), 'utf8')).units[0].cardFace).toBeDefined();
    await f.adoptions.recover();
    expect((await f.adoptions.confirm(identity)).reused).toBe(true);
  } finally { await f.close(); }
}, 30_000);


test('companion creation binds one existing Todo and rejects changed retries', async () => {
  const f = await fixture();
  try {
    const todo = await f.workflow.command('createTodo', { projectId: 'p', title: 'Companion acceptance' }) as any;
    const source = await f.content.query({ projectId: 'p', op: 'card', id: 'U_001' }) as any;
    const spell = { id: 'TL_COMPANION', name: 'Fox rush', kind: 'talisman', description: 'One friendly fox gains 3 attack this turn.', rarity: 'common', labels: ['fox'], limitPerDeck: 3, isInstant: true, duration: 0, target: 'unit', effects: [{ timing: 'reaction', target: { scope: 'singleAlly', requiredLabelsAllOf: ['fox'] }, actions: [{ type: 'modifyAttack', value: 3, duration: 'turn' }], text: 'Attack +3 this turn.', scriptId: 'effect.TL_COMPANION.cast' }] };
    const input = { projectId: 'p', featureId: 'fox-feature', todoId: todo.item.id, brief: 'Companion', requestId: 'companion-request-1', companion: { cardId: source.id, revision: source.revision }, cards: [spell] };
    const first = await f.pipeline.command('createCardBatch', input);
    const retry = await f.pipeline.command('createCardBatch', input);
    expect(retry.production.id).toBe(first.production.id);
    expect(retry.reused).toBe(true);
    const bound = await f.workflow.query({ projectId: 'p', op: 'todo', id: todo.item.id }) as any;
    expect(bound.item.productionId).toBe(first.production.id);
    expect(first.production.todoId).toBe(todo.item.id);
    expect(first.production.featureId).toBe('fox-feature');
    await expect(f.pipeline.command('createCardBatch', { ...input, brief: 'Changed brief' })).rejects.toThrow('这个创建请求已经用于另一份需求');
    await expect(f.pipeline.command('createCardBatch', { ...input, requestId: 'another-request' })).rejects.toThrow('该待办已关联制作单');
    const items = await f.workflow.query({ projectId: 'p', op: 'productions', todoId: todo.item.id }) as any;
    expect(items.items).toHaveLength(1);
  } finally { await f.close(); }
});

test('existing card art reuses exact project media without generating or changing its source', async () => {
  let generated = 0;
  const f = await fixture(() => ({ available: async () => true, generate: async () => { generated++; throw Error('must not generate'); } }), true);
  try {
    const artwork = '/assets/card-faces/U_001/original.png';
    const original = await readFile(join(f.root, 'public/data/cards/units.json'));
    const source = await f.content.query({ projectId: 'p', op: 'card', id: 'U_001' }) as any;
    await expect(f.run('reuseCardArt', { sourceCardId: 'U_001', sourceRevision: 'stale' })).rejects.toThrow('来源卡牌已变化');
    await f.run('reuseCardArt', { sourceCardId: 'U_001', sourceRevision: source.revision });
    const value = await f.get();
    expect(value.stages.U_001).toBe('assemble');
    expect(value.batch.cards[0].art.provider).toBe('existing');
    expect(value.batch.cards[0].art.sourceCardId).toBe('U_001');
    expect(value.batch.cards[0].artRequest).toBeUndefined();
    expect((await f.run('reuseCardArt', { sourceCardId: 'U_001', sourceRevision: source.revision })).reused).toBe(true);
    expect(generated).toBe(0);
    expect(await readFile(join(f.root, 'public/data/cards/units.json'))).toEqual(original);
    expect(await readFile(join(f.root, 'public' + artwork))).toEqual(f.bytes);
    await f.run('saveCardDraft', { definition: { ...value.batch.cards[0].definition, attack: 2 } });
    await f.run('reuseCardArt', { sourceCardId: 'U_001', sourceRevision: source.revision });
    expect((await f.get()).stages.U_001).toBe('assemble');
  } finally { await f.close(); }
});


test('companion candidate adds both cards to the starter deck and leaves source data intact', async () => {
  const f = await fixture(undefined, true);
  try {
    await writeFile(join(f.root, 'public/data/cards/talismans.json'), JSON.stringify({ talismans: [] }));
    const source = await f.content.query({ projectId: 'p', op: 'card', id: 'U_001' }) as any;
    const spell = { id: 'TL_PAIR', name: 'Fox rush', kind: 'talisman', description: 'Attack +3 this turn.', rarity: 'common', limitPerDeck: 3, isInstant: true, duration: 0, target: 'unit', effects: [{ timing: 'reaction', target: { scope: 'singleAlly', requiredLabelsAllOf: ['fox'] }, actions: [{ type: 'modifyAttack', value: 3, duration: 'turn' }], text: 'Attack +3 this turn.' }] };
    const created = await f.pipeline.command('createCardBatch', { projectId: 'p', featureId: 'fox-feature', brief: 'Pair', companion: { cardId: source.id, revision: source.revision }, cards: [spell] });
    const productionId = created.production.id;
    const run = async (method: string, extra: Record<string, unknown> = {}) => {
      const value = await f.pipeline.query({ projectId: 'p', productionId, op: 'cardBatch' });
      if (!value.production) throw Error('Missing production receipt');
      return f.pipeline.command(method, { projectId: 'p', productionId, cardId: 'TL_PAIR', baseRevision: value.production.revision, ...extra });
    };
    const before = await readFile(join(f.root, 'public/data/decks/starter-deck.json'));
    await run('reuseCardArt', { sourceCardId: source.id, sourceRevision: source.revision });
    await run('assembleCardFaces');
    const staged = await run('integrateCard');
    const deck = JSON.parse(await readFile(join(staged.candidate.repo, 'public/data/decks/starter-deck.json'), 'utf8'));
    expect(deck.cards).toEqual([{ id: 'U_001', count: 3 }, { id: 'TL_PAIR', count: 3 }]);
    expect(await readFile(join(f.root, 'public/data/decks/starter-deck.json'))).toEqual(before);
    expect((await run('integrateCard')).reused).toBe(true);
  } finally { await f.close(); }
}, 30_000);
