import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requiredGamePreviewChecks } from '../plugins/cardgame-content/src/registration';

test('story preview URL points to the exact Hub action', async () => {
  const adapterPath = join(import.meta.dir, '../plugins/cardgame-content/preview/preview.config.mjs');
  const adapter = (await import(pathToFileURL(adapterPath).href)).default as {
    plan(context: unknown): { surfaces: Array<{ path: string }> };
  };
  const context = { key: 'candidate.qa', runtimeDir: '/candidate/.preview', repos: { game: { repo: '/candidate/game', dir: '/candidate/game', commit: 'a'.repeat(40) } },
    options: { projectId: 'cardgame', profile: 'default', storyId: 'story.qa', entryHubId: 'hub.qa', entryActionId: 'action.qa' } };
  const url = new URL(adapter.plan(context).surfaces[0]!.path, 'http://preview.local');
  expect(url.searchParams.get('workaHub')).toBe('hub.qa');
  expect(url.searchParams.get('workaAction')).toBe('action.qa');
  expect(url.searchParams.get('workaStory')).toBe('story.qa');
  expect(new URL(adapter.plan({ ...context, options: { projectId: 'cardgame' } }).surfaces[0]!.path, 'http://preview.local')
    .searchParams.has('workaHub')).toBe(false);
});

test('plan offers a cached static build surface for remote sharing', async () => {
  const adapterPath = join(import.meta.dir, '../plugins/cardgame-content/preview/preview.config.mjs');
  const adapter = (await import(pathToFileURL(adapterPath).href)).default as {
    plan(context: unknown): { surfaces: Array<{ name: string; service: string; path: string }>; services: Array<{ name: string; command: string[]; env?: Record<string, string>; ready: { timeoutMs: number } }> };
  };
  const context = { key: 'candidate.qa', runtimeDir: '/candidate/.preview', repos: { game: { repo: '/candidate/game', dir: '/candidate/game', commit: 'a'.repeat(40) } },
    options: { projectId: 'cardgame', profile: 'default' } };
  const plan = adapter.plan(context);
  expect(plan.surfaces.map(surface => surface.name)).toEqual(['web', 'static']);
  const staticSurface = plan.surfaces.find(surface => surface.name === 'static')!;
  expect(staticSurface.path).toContain('workaCandidate=candidate.qa');
  const service = plan.services.find(item => item.name === staticSurface.service)!;
  expect(service.command.join(' ')).toContain('serve-static.mjs');
  expect(service.env?.WORKA_DIST_DIR).toBe(join('/candidate/.preview', 'build-' + 'a'.repeat(40)));
  expect(service.env?.PORT).toBe('{{port:static}}');
  // 首次构建计入就绪期限。
  expect(service.ready.timeoutMs).toBeGreaterThanOrEqual(600_000);
});

test('shop, crafting and item use adoption require their exact preview checks', () => {
  expect(requiredGamePreviewChecks({ kind: 'story', shopTargets: [{ resourceId: 'shop.qa', nodeId: 'shop.qa-node',
    offerIds: ['offer.qa.exchange'], mapResourceIds: ['map.qa'] }] })).toContain('story-shops');
  expect(requiredGamePreviewChecks({ kind: 'story', recipeIds: ['recipe.jade-charm'] })).toContain('story-recipes');
  expect(requiredGamePreviewChecks({ kind: 'story', itemUseIds: ['consumable.salve'] })).toContain('story-items');
  expect(requiredGamePreviewChecks({ kind: 'story', questIds: ['quest.heal-fox'] })).toContain('story-quests');
  expect(requiredGamePreviewChecks({ kind: 'story', copyPaths: ['public/data/world/world-map.json'] })).toContain('story-copy');
  expect(requiredGamePreviewChecks({ kind: 'story', portraitPaths: ['public/assets/story/fog/fox.png'] })).toContain('story-portraits');
  expect(requiredGamePreviewChecks({ kind: 'story', itemIconPaths: ['public/assets/items/herbs/white-leaf-v1.png'] }))
    .toEqual(expect.arrayContaining(['story-items', 'story-item-icons']));
  expect(requiredGamePreviewChecks({ kind: 'story' })).not.toContain('story-shops');
  expect(requiredGamePreviewChecks({ kind: 'story' })).not.toContain('story-recipes');
  expect(requiredGamePreviewChecks({ kind: 'story' })).not.toContain('story-quests');
  expect(requiredGamePreviewChecks({ kind: 'story' })).not.toContain('story-copy');
});

test('a document candidate verifies exact Markdown bytes without requiring a card or story route', async () => {
  const root = await mkdtemp(join(tmpdir(), 'document-preview-'));
  const originalFetch = globalThis.fetch;
  try {
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'public/data'), { recursive: true });
    await mkdir(join(root, 'knowledge'), { recursive: true });
    await writeFile(join(root, 'src/GameApp.tsx'), 'export {};');
    await writeFile(join(root, 'public/data/content-catalog.json'), '{"resources":[]}');
    const content = '# 人物\n\n[狐爷爷](./fox.md)\n';
    await writeFile(join(root, 'knowledge/index.md'), content);
    const revision = createHash('sha256').update(content).digest('hex');
    const adapterPath = join(import.meta.dir, '../plugins/cardgame-content/preview/preview.config.mjs');
    const adapter = (await import(pathToFileURL(adapterPath).href)).default as {
      check(context: unknown): Array<{ name: string; ok: boolean }>;
      verify(context: unknown, surface: string): Promise<Array<{ name: string; ok: boolean }>>;
    };
    const context = { repos: { game: { dir: root } }, urls: { web: 'http://preview.local/' },
      options: { candidateKind: 'documents', documentRevisions: [{ path: 'knowledge/index.md', revision }] } };
    globalThis.fetch = (async (input: string | URL | Request) => String(input).includes('content-catalog.json')
      ? new Response('{"resources":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('<div id="root"></div><script src="/src/main.tsx"></script>', { status: 200 })) as typeof fetch;
    expect(adapter.check(context).every(item => item.ok)).toBe(true);
    expect(adapter.check(context).map(item => item.name)).not.toContain('cards');
    expect((await adapter.verify(context, 'web')).filter(item => !item.ok)).toEqual([]);
    expect(requiredGamePreviewChecks({ kind: 'documents' })).toEqual(['game-shell', 'content-catalog', 'knowledge-documents']);
    await writeFile(join(root, 'knowledge/index.md'), '# 已修改\n');
    expect((await adapter.verify(context, 'web')).find(item => item.name === 'knowledge-documents')?.ok).toBe(false);
    expect(adapter.check({ ...context, options: { candidateKind: 'documents', documentRevisions: [{ path: 'knowledge/../index.md', revision }] } })
      .find(item => item.name === 'knowledge-documents')?.ok).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('pill and skill candidates require the battle loadout used by the runtime catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loadout-preview-'));
  const originalFetch = globalThis.fetch;
  const put = async (path: string, value: unknown) => {
    const target = join(root, 'public', path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value));
  };
  try {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src/GameApp.tsx'), 'export {};');
    const cardFace = { variants: {
      jade: { texture: '/assets/card-faces/jade.png' },
      scroll: { texture: '/assets/card-faces/scroll.png' },
    } };
    await put('data/cards/pills.json', { pills: [{ id: 'PL_NEW', cardFace }] });
    const skill = { id: 'SK_NEW', cardFace, cooldownType: 'perTurn', cooldownValue: 1,
      effects: [{ timing: 'reaction', target: { scope: 'ownerPlayer' }, actions: [{ type: 'drawCards', value: 2 }] }] };
    await put('data/cards/skills.json', { skills: [skill] });
    await put('data/config/battle-loadout.json', { schemaVersion: 1, pillIds: ['PL_NEW'], skillIds: ['SK_NEW'] });
    const catalog = { resources: [{ resourceId: 'config.battle-loadout', kind: 'config', publicPath: 'data/config/battle-loadout.json' }] };
    await put('data/content-catalog.json', catalog);
    for (const theme of ['jade', 'scroll']) {
      const path = join(root, 'public/assets/card-faces', `${theme}.png`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from('89504e470d0a1a0a', 'hex'));
    }
    globalThis.fetch = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname.slice(1);
      if (!path) return new Response('<div id="root"></div><script src="/src/main.tsx"></script>');
      try {
        return new Response(new Uint8Array(await readFile(join(root, 'public', path))), {
          status: 200, headers: { 'content-type': path.endsWith('.png') ? 'image/png' : 'application/json' },
        });
      } catch { return new Response('missing', { status: 404 }); }
    }) as typeof fetch;
    const adapter = (await import(pathToFileURL(join(import.meta.dir, '../plugins/cardgame-content/preview/preview.config.mjs')).href)).default as {
      verify(context: unknown, surface: string): Promise<Array<{ name: string; ok: boolean }>>;
    };
    const playable = async (cardKind: 'pill' | 'skill', cardId: string) => {
      const checks = await adapter.verify({ repos: { game: { dir: root } }, urls: { web: 'http://preview.local/' },
        options: { cardKind, cardId } }, 'web');
      return checks.find(item => item.name === 'playable-loadout')?.ok;
    };
    expect(await playable('pill', 'PL_NEW')).toBe(true);
    expect(await playable('skill', 'SK_NEW')).toBe(true);
    await put('data/cards/skills.json', { skills: [{ ...skill, effects: [{ ...skill.effects[0], actions: [{ type: 'custom', scriptId: 'missing' }] }] }] });
    expect(await playable('skill', 'SK_NEW')).toBe(false);
    await put('data/cards/skills.json', { skills: [{ ...skill, effects: [{ ...skill.effects[0], conditions: { hidden: true } }] }] });
    expect(await playable('skill', 'SK_NEW')).toBe(false);
    await put('data/cards/skills.json', { skills: [{ ...skill, effects: [{ ...skill.effects[0], actions: [{ type: 'drawCards', value: 0 }] }] }] });
    expect(await playable('skill', 'SK_NEW')).toBe(false);
    await put('data/cards/skills.json', { skills: [skill] });
    await put('data/content-catalog.json', { resources: [] });
    expect(await playable('pill', 'PL_NEW')).toBe(false);
    expect(await playable('skill', 'SK_NEW')).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('story preview detects missing shop offers, recipes, and item dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'story-shop-preview-'));
  const put = async (path: string, value: unknown) => {
    const target = join(root, 'public', path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value));
  };
  const originalFetch = globalThis.fetch;
  const overrides = new Map<string, unknown>();
  try {
    await put('data/content-catalog.json', { resources: [
      { kind: 'story', resourceId: 'story.qa', publicPath: 'data/story/qa.json' },
      { kind: 'hub', resourceId: 'hub.qa', publicPath: 'data/hub/qa.json' },
      { kind: 'expeditionShop', resourceId: 'shop.qa', publicPath: 'data/mijing/shop.json' },
      { kind: 'expeditionMap', resourceId: 'map.qa', publicPath: 'data/mijing/map.json' },
    ] });
    await put('data/cards/units.json', { units: [{ id: 'CR_001', cardFace: { variants: {
      jade: { texture: '/assets/card-faces/jade.png' }, scroll: { texture: '/assets/card-faces/scroll.png' },
    } } }] });
    await put('data/decks/starter-deck.json', { cards: [] });
    await put('data/story/qa.json', { storyId: 'story.qa', initialState: { questStages: { 'quest.heal-fox': 'available' } },
      nodes: [{ id: 'scene.qa' }], choices: [{ id: 'choice.qa', effects: [{ kind: 'setQuestStage', questId: 'quest.heal-fox', stage: 'active' }] }] });
    await put('data/hub/qa.json', { hubId: 'hub.qa', locations: [{ actions: [{ id: 'action.qa', kind: 'startStory', storyResourceId: 'story.qa', storyGraphFile: 'data/story/qa.json' }] }] });
    await put('data/world/world-map.json', { id: 'worldmap.qa', description: '青云山麓有几条去路。' });
    const offer = { id: 'offer.qa.exchange', cost: { spiritStones: 0, items: [{ id: 'consumable.salve', itemType: 'consumable', count: 1 }] },
      rewards: { cards: [], items: [{ id: 'artifact.sword', itemType: 'artifact', count: 1 }], spiritStones: 0 } };
    await put('data/mijing/shop.json', { id: 'shop.qa', shopsByNodeId: { 'shop.qa-node': { nodeId: 'shop.qa-node', offers: [offer] } } });
    await put('data/mijing/map.json', { id: 'map.qa', nodes: [{ id: 'shop.qa-node', type: 'shop',
      payloadRef: { ref: 'shop.qa-node', contentFile: 'data/mijing/shop.json' } }] });
    const iconPath = 'assets/items/herbs/white-leaf-v1.png';
    const iconBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000002010001e221bc330000000049454e44ae426082', 'hex');
    await mkdir(dirname(join(root, 'public', iconPath)), { recursive: true });
    await writeFile(join(root, 'public', iconPath), iconBytes);
    const itemCatalog = { artifacts: [{ id: 'artifact.sword' }], consumables: [{ id: 'consumable.salve', iconAsset: iconPath, useEffect: { kind: 'heal', amount: 25 } }],
      materials: [{ id: 'material.jade' }], recipes: [{ id: 'recipe.jade-charm', name: '青玉护符',
        cost: { spiritStones: 2, items: [{ id: 'material.jade', itemType: 'material', count: 2 }] },
        rewards: { items: [{ id: 'artifact.sword', itemType: 'artifact', count: 1 }] } }] };
    await put('data/world/items.artifacts.json', itemCatalog);
    await put('data/world/npcs.json', { npcs: [{ id: 'npc.fox', name: '狐爷爷' }] });
    const questCatalog = { schemaVersion: 1, quests: [{ id: 'quest.heal-fox', title: '救助狐爷爷', summary: '寻找救治办法。', actorIds: ['npc.fox'], stages: [
      { id: 'available', status: 'available', label: '委托出现', objective: '询问伤势。' },
      { id: 'active', status: 'active', label: '寻找药材', objective: '进入雾林采药。' },
    ] }] };
    await put('data/world/quests.json', questCatalog);
    for (const theme of ['jade', 'scroll']) {
      const path = join(root, 'public/assets/card-faces', `${theme}.png`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from('89504e470d0a1a0a', 'hex'));
    }
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/') return new Response('<div id="root"></div><script src="/src/main.tsx"></script>', { status: 200 });
      const path = url.pathname.slice(1);
      try {
        const override = overrides.get(path);
        const value = overrides.has(path) ? Buffer.isBuffer(override) ? override : Buffer.from(JSON.stringify(override)) : await readFile(join(root, 'public', path));
        return new Response(new Uint8Array(value), { status: 200, headers: { 'content-type': path.endsWith('.png') ? 'image/png' : 'application/json' } });
      } catch { return new Response('missing', { status: 404 }); }
    }) as typeof fetch;
    const adapterPath = join(import.meta.dir, '../plugins/cardgame-content/preview/preview.config.mjs');
    const adapter = (await import(pathToFileURL(adapterPath).href)).default as {
      verify(context: unknown, surface: string): Promise<Array<{ name: string; ok: boolean }>>;
    };
    const context = { repos: { game: { dir: root } }, urls: { web: 'http://preview.local/' }, options: {
      storyId: 'story.qa', entryHubId: 'hub.qa', entryActionId: 'action.qa', cardId: 'CR_001', recipeIds: ['recipe.jade-charm'], itemUseIds: ['consumable.salve'], questIds: ['quest.heal-fox'], copyPaths: ['public/data/world/world-map.json'], portraitPaths: [] as string[], itemIconPaths: ['public/assets/items/herbs/white-leaf-v1.png'], shopTargets: [{ resourceId: 'shop.qa', nodeId: 'shop.qa-node',
        offerIds: ['offer.qa.exchange'], mapResourceIds: ['map.qa'] }],
    } };
    const status = async () => (await adapter.verify(context, 'web')).find(item => item.name === 'story-shops')?.ok;
    const recipeStatus = async () => (await adapter.verify(context, 'web')).find(item => item.name === 'story-recipes')?.ok;
    const itemStatus = async () => (await adapter.verify(context, 'web')).find(item => item.name === 'story-items')?.ok;
    const iconStatus = async () => (await adapter.verify(context, 'web')).find(item => item.name === 'story-item-icons')?.ok;
    const questStatus = async () => (await adapter.verify(context, 'web')).find(item => item.name === 'story-quests')?.ok;
    const copyStatus = async () => (await adapter.verify(context, 'web')).find(item => item.name === 'story-copy')?.ok;
    expect(await status()).toBe(true);
    expect(await recipeStatus()).toBe(true);
    expect(await itemStatus()).toBe(true);
    expect(await iconStatus()).toBe(true);
    expect(await questStatus()).toBe(true);
    expect(await copyStatus()).toBe(true);
    const storyChecks = await adapter.verify(context, 'web');
    expect(storyChecks.filter(item => !item.ok)).toEqual([]);
    expect(storyChecks.map(item => item.name)).not.toContain('playable-deck');
    overrides.set('data/hub/qa.json', { hubId: 'hub.qa', locations: [{ actions: [
      { id: 'action.other', kind: 'startStory', storyResourceId: 'story.qa', storyGraphFile: 'data/story/qa.json' },
    ] }] });
    expect((await adapter.verify(context, 'web')).find(item => item.name === 'story-route')?.ok).toBe(false);
    overrides.delete('data/hub/qa.json');
    overrides.set(iconPath, Buffer.from('not the candidate PNG'));
    expect(await iconStatus()).toBe(false);
    overrides.delete(iconPath);
    const invalidIconContext = { ...context, options: { ...context.options, itemIconPaths: ['public/assets/items/../herb.png'] } };
    expect((await adapter.verify(invalidIconContext, 'web')).find(item => item.name === 'story-item-icons')?.ok).toBe(false);
    overrides.set('data/mijing/shop.json', { id: 'shop.qa', shopsByNodeId: { 'shop.qa-node': { nodeId: 'shop.qa-node', offers: [] } } });
    expect(await status()).toBe(false);
    overrides.delete('data/mijing/shop.json');
    overrides.set('data/world/items.artifacts.json', { artifacts: [], consumables: [{ id: 'consumable.salve' }] });
    expect(await status()).toBe(false);
    expect(await recipeStatus()).toBe(false);
    expect(await itemStatus()).toBe(false);
    overrides.set('data/world/items.artifacts.json', { ...itemCatalog, recipes: [] });
    expect(await recipeStatus()).toBe(false);
    overrides.set('data/world/items.artifacts.json', { ...itemCatalog, consumables: [{ id: 'consumable.salve' }] });
    expect(await itemStatus()).toBe(false);
    overrides.delete('data/world/items.artifacts.json');
    overrides.set('data/world/quests.json', { ...questCatalog, quests: [{ ...questCatalog.quests[0], stages: questCatalog.quests[0].stages.slice(0, 1) }] });
    expect(await questStatus()).toBe(false);
    overrides.delete('data/world/quests.json');
    overrides.set('data/world/world-map.json', { id: 'worldmap.qa', description: '服务内容与候选不一致。' });
    expect(await copyStatus()).toBe(false);
    overrides.delete('data/world/world-map.json');
    overrides.set('data/world/npcs.json', { npcs: [] });
    expect(await questStatus()).toBe(false);
    overrides.delete('data/world/npcs.json');
    await put('data/story/qa.json', { storyId: 'story.qa', initialState: { questStages: { 'quest.heal-fox': 'available' } },
      nodes: [{ id: 'scene.qa', dialogues: [{ id: 'line.qa', speakerId: 'npc.fox', text: '雾起了。' }] }],
      choices: [{ id: 'choice.qa', effects: [{ kind: 'setQuestStage', questId: 'quest.heal-fox', stage: 'active' }] }] });
    await put('data/world/npcs.json', { npcs: [{ id: 'npc.fox', name: '狐爷爷', portraitAsset: 'assets/story/fog/fox.png' }] });
    const portraitPath = join(root, 'public/assets/story/fog/fox.png');
    await mkdir(dirname(portraitPath), { recursive: true });
    await writeFile(portraitPath, Buffer.from('89504e470d0a1a0a', 'hex'));
    context.options.portraitPaths = ['public/assets/story/fog/fox.png'];
    const portraitStatus = async () => (await adapter.verify(context, 'web')).find(item => item.name === 'story-portraits')?.ok;
    expect(await portraitStatus()).toBe(true);
    overrides.set('assets/story/fog/fox.png', { changed: true });
    expect(await portraitStatus()).toBe(false);
    overrides.delete('assets/story/fog/fox.png');
    context.options.portraitPaths = ['public/assets/story/fog/other.png'];
    expect(await portraitStatus()).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('whole-deck preview checks the served exact definitions, legal copies and isolated starter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deck-preview-'));
  const originalFetch = globalThis.fetch;
  const overrides = new Map<string, unknown>();
  const put = async (path: string, value: unknown) => {
    const target = join(root, 'public', path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value));
  };
  try {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src/GameApp.tsx'), 'export {};');
    await put('data/content-catalog.json', { resources: [] });
    const units = Array.from({ length: 12 }, (_, i) => ({ id: `D_${i}`, name: `Fixture ${i}`, limitPerDeck: 3 }));
    const deck = { id: 'independent-fixture', cards: units.map(card => ({ id: card.id, count: 2 })) };
    const deckPath = 'public/data/decks/worka-independent-fixture.json';
    await put('data/cards/units.json', { units });
    await put(deckPath.slice(7), deck);
    await put('data/decks/starter-deck.json', deck);
    globalThis.fetch = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname.slice(1);
      if (!path) return new Response('<div id="root"></div><script src="/src/main.tsx"></script>');
      if (overrides.has(path)) return new Response(JSON.stringify(overrides.get(path)), { headers: { 'content-type': 'application/json' } });
      try { return new Response(new Uint8Array(await readFile(join(root, 'public', path))), { headers: { 'content-type': 'application/json' } }); }
      catch { return new Response('missing', { status: 404 }); }
    }) as typeof fetch;
    const adapter = (await import(pathToFileURL(join(import.meta.dir, '../plugins/cardgame-content/preview/preview.config.mjs')).href)).default as {
      verify(context: unknown, surface: string): Promise<Array<{ name: string; ok: boolean }>>;
    };
    const context = { repos: { game: { dir: root } }, urls: { web: 'http://preview.local/' },
      options: { candidateKind: 'deck', deckPath, deckCardIds: units.map(card => card.id) } };
    expect((await adapter.verify(context, 'web')).every(item => item.ok)).toBe(true);
    overrides.set('data/cards/units.json', { units: units.map((card, i) => i ? card : { ...card, name: 'stale served name' }) });
    expect((await adapter.verify(context, 'web')).find(item => item.name === 'deck-definition')?.ok).toBe(false);
    overrides.clear();
    overrides.set('data/decks/starter-deck.json', { id: 'original', cards: [] });
    expect((await adapter.verify(context, 'web')).find(item => item.name === 'deck-composition')?.ok).toBe(false);
    overrides.clear();
    overrides.set(deckPath.slice(7), { ...deck, cards: deck.cards.map((entry, i) => i ? entry : { ...entry, count: 4 }) });
    expect((await adapter.verify(context, 'web')).find(item => item.name === 'deck-composition')?.ok).toBe(false);
    expect((await adapter.verify({ ...context, options: { ...context.options, deckPath: 'public/data/decks/../escape.json' } }, 'web'))[0]?.ok).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
