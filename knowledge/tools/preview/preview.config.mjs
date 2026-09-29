import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const check = (name, ok, detail) => ({ name, ok, detail, owner: 'project' });
const cardCollections = {
  unit: ['units', 'units.json'], artifact: ['artifacts', 'artifacts.json'],
  talisman: ['talismans', 'talismans.json'], field: ['fields', 'fields.json'],
  skill: ['skills', 'skills.json'], pill: ['pills', 'pills.json'],
};
const cardCollection = kind => cardCollections[kind] ?? null;
const documentRevisionsValid = (root, revisions) => {
  if (!Array.isArray(revisions) || revisions.length < 1 || revisions.length > 64) return false;
  const seen = new Set();
  return revisions.every(item => {
    const path = item?.path;
    if (typeof path !== 'string' || !/^knowledge\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(path)
      || path.split('/').some(part => part === '.' || part === '..') || seen.has(path)
      || typeof item.revision !== 'string' || !/^[0-9a-f]{64}$/.test(item.revision)) return false;
    seen.add(path);
    try {
      const absolute = join(root, path);
      return !lstatSync(absolute).isSymbolicLink() && realpathSync(absolute).startsWith(resolve(root) + '/')
        && createHash('sha256').update(readFileSync(absolute)).digest('hex') === item.revision;
    } catch { return false; }
  });
};

/** CardGame's v2 project description. Worka owns the checkout, port and process. */
export default {
  name: 'CardGame',
  primary: 'game',
  repos: { game: { required: true, description: '确切的游戏候选提交' } },
  portRange: { base: 6810, size: 300 },
  plan(context) {
    const game = context.repos.game;
    const query = new URLSearchParams({
      workaProject: String(context.options.projectId || createHash('sha256').update(game.repo).digest('hex').slice(0, 16)),
      workaCandidate: context.key,
      workaCommit: game.commit,
      workaProfile: String(context.options.profile || 'default'),
    });
    if (typeof context.options.storyId === 'string'
      && typeof context.options.entryHubId === 'string'
      && typeof context.options.entryActionId === 'string') {
      query.set('workaHub', context.options.entryHubId);
      query.set('workaAction', context.options.entryActionId);
      query.set('workaStory', context.options.storyId);
    }
    return {
      surfaces: [{ name: 'web', title: '游戏', service: 'web', path: `/?${query}` }],
      prepare: [{ name: 'install-dependencies', cwd: game.dir, command: ['bun', 'install', '--frozen-lockfile'], unless: 'node_modules/vite/bin/vite.js', timeoutMs: 180_000 }],
      services: [{
        name: 'web', cwd: game.dir,
        command: ['bun', 'node_modules/vite/bin/vite.js', '--config', 'vite/config.dev.mjs', '--host', '127.0.0.1', '--port', '{{port:web}}', '--strictPort'],
        ready: { http: '/', timeoutMs: 120_000 },
      }],
    };
  },
  check(context) {
    const root = context.repos.game.dir;
    const storyId = typeof context.options.storyId === 'string' ? context.options.storyId : '';
    const collection = cardCollection(context.options.cardKind || 'unit');
    return [
      check('game-entry', existsSync(join(root, 'src/GameApp.tsx')), 'React / Phaser 游戏入口存在'),
      check('catalog', existsSync(join(root, 'public/data/content-catalog.json')), '游戏内容目录存在'),
      ...(!storyId && context.options.candidateKind !== 'documents' ? [check('cards', Boolean(collection && existsSync(join(root, 'public/data/cards', collection[1]))), '目标卡牌定义存在')] : []),
      ...(context.options.candidateKind === 'documents' ? [check('knowledge-documents', documentRevisionsValid(root, context.options.documentRevisions), '普通资料文件与确切候选一致')] : []),
    ];
  },
  async verify(context, surface) {
    if (surface !== 'web') return [check('surface', false, '未知游戏入口')];
    const root = context.repos.game.dir;
    const base = context.urls.web;
    const response = await fetch(base, { signal: AbortSignal.timeout(12_000) });
    const html = await response.text();
    const catalogResponse = await fetch(new URL('/data/content-catalog.json', base), { signal: AbortSignal.timeout(12_000) });
    const servedCatalog = catalogResponse.ok ? await catalogResponse.json() : null;
    const storyId = typeof context.options.storyId === 'string' ? context.options.storyId : '';
    if (context.options.candidateKind === 'documents') return [
      check('game-shell', response.ok && html.includes('src/main.tsx') && html.includes('root'), '游戏页面指向实际入口'),
      check('content-catalog', catalogResponse.ok, '候选内容目录可读取'),
      check('knowledge-documents', documentRevisionsValid(root, context.options.documentRevisions), '普通资料文件与确切候选一致'),
    ];
    const collection = cardCollection(context.options.cardKind || 'unit');
    if (!storyId && !collection) return [check('card-kind', false, '未知卡牌类别')];
    const cardsResponse = storyId ? null : await fetch(new URL(`/data/cards/${collection[1]}`, base), { signal: AbortSignal.timeout(12_000) });
    const loadoutCard = context.options.cardKind === 'pill' || context.options.cardKind === 'skill';
    const entryPath = loadoutCard ? '/data/config/battle-loadout.json' : '/data/decks/starter-deck.json';
    const entryResponse = storyId ? null : await fetch(new URL(entryPath, base), { signal: AbortSignal.timeout(12_000) });
    const served = cardsResponse?.ok ? await cardsResponse.json() : null;
    const servedEntry = entryResponse?.ok ? await entryResponse.json() : null;
    const source = storyId ? null : json(join(root, 'public/data/cards', collection[1]));
    const sourceEntry = storyId ? null : json(join(root, 'public', entryPath));
    const cardId = String(context.options.cardId || 'CR_001');
    const expected = source?.[collection[0]]?.find(card => card.id === cardId);
    const actual = served?.[collection[0]]?.find(card => card.id === cardId);
    const variants = actual?.cardFace?.variants;
    const assetChecks = variants ? await Promise.all(['jade', 'scroll'].map(async theme => {
      const path = variants[theme]?.texture;
      if (typeof path !== 'string' || !path.startsWith('/assets/card-faces/')) return false;
      const image = await fetch(new URL(path, base), { signal: AbortSignal.timeout(12_000) });
      return image.ok && image.headers.get('content-type')?.startsWith('image/') === true;
    })) : [];
    const storyEntry = storyId ? servedCatalog?.resources?.find(item => item.kind === 'story' && item.resourceId === storyId) : null;
    const storyPath = typeof storyEntry?.publicPath === 'string' && /^data\/story\/[A-Za-z0-9._/-]+\.json$/.test(storyEntry.publicPath) && !storyEntry.publicPath.split('/').includes('..') ? storyEntry.publicPath : null;
    const servedStoryResponse = storyPath ? await fetch(new URL('/' + storyPath, base), { signal: AbortSignal.timeout(12_000) }) : null;
    const servedStory = servedStoryResponse?.ok ? await servedStoryResponse.json() : null;
    const sourceStory = storyPath ? json(join(root, 'public', storyPath)) : null;
    const speakers = [...new Set((sourceStory?.nodes ?? []).flatMap(node =>
      (node.dialogues ?? []).map(line => line.speakerId).filter(id => id !== 'player')))];
    const abilityReads = [];
    const itemReads = [];
    const collectAbilityReads = condition => {
      if (!condition || typeof condition !== 'object') return;
      if (condition.kind === 'actorAbility') abilityReads.push(condition);
      else if (condition.kind === 'itemCount') itemReads.push({ itemId: condition.itemId });
      else if (condition.kind === 'all' || condition.kind === 'any') (condition.conditions ?? []).forEach(collectAbilityReads);
      else if (condition.kind === 'not') collectAbilityReads(condition.condition);
    };
    for (const choice of sourceStory?.choices ?? []) {
      collectAbilityReads(choice.visibleWhen);
      collectAbilityReads(choice.enabledWhen);
    }
    const collectItemEffects = effects => {
      for (const effect of effects ?? []) {
        if (effect.kind === 'grantItem' || effect.kind === 'consumeItem') itemReads.push(effect);
        if (effect.kind === 'once') collectItemEffects(effect.effects);
      }
    };
    for (const node of sourceStory?.nodes ?? []) collectItemEffects(node.onEnter);
    for (const choice of sourceStory?.choices ?? []) collectItemEffects(choice.effects);
    const battles = [];
    const collectBattles = effects => {
      for (const effect of effects ?? []) {
        if (effect.kind === 'startBattle') battles.push(effect.battle);
        if (effect.kind === 'once') collectBattles(effect.effects);
      }
    };
    for (const node of sourceStory?.nodes ?? []) collectBattles(node.onEnter);
    for (const choice of sourceStory?.choices ?? []) collectBattles(choice.effects);
    const battleChecks = await Promise.all(battles.map(async battle => {
      if (!battle || typeof battle !== 'object') return false;
      for (const [kind, resourceId, path] of [
        ['encounter', battle.encounterResourceId, battle.encounterFile],
        ['deck', battle.deckResourceId, battle.deckFile],
      ]) {
        const folder = kind === 'encounter' ? 'encounters' : 'decks';
        if (!resourceId || typeof path !== 'string' || !new RegExp(`^data/${folder}/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+\\.json$`).test(path)
          || path.split('/').includes('..')
          || !servedCatalog?.resources?.some(item => item.kind === kind && item.resourceId === resourceId && item.publicPath === path)) return false;
        const sourceFile = join(root, 'public', path);
        if (!existsSync(sourceFile)) return false;
        const servedFile = await fetch(new URL('/' + path, base), { signal: AbortSignal.timeout(12_000) });
        if (!servedFile.ok || JSON.stringify(await servedFile.json()) !== JSON.stringify(json(sourceFile))) return false;
      }
      return json(join(root, 'public', battle.encounterFile)).id === battle.encounterId;
    }));
    const shopTargets = Array.isArray(context.options.shopTargets) ? context.options.shopTargets : [];
    const recipeIds = Array.isArray(context.options.recipeIds) ? context.options.recipeIds : [];
    const itemUseIds = Array.isArray(context.options.itemUseIds) ? context.options.itemUseIds : [];
    const expectedItemIconPaths = Array.isArray(context.options.itemIconPaths) ? context.options.itemIconPaths : [];
    const questIds = Array.isArray(context.options.questIds) ? context.options.questIds : [];
    const copyPaths = Array.isArray(context.options.copyPaths) ? context.options.copyPaths : [];
    const shopChecks = await Promise.all(shopTargets.map(async target => {
      if (!target || typeof target.resourceId !== 'string' || typeof target.nodeId !== 'string'
        || !Array.isArray(target.offerIds) || !target.offerIds.length
        || !Array.isArray(target.mapResourceIds) || !target.mapResourceIds.length) return false;
      const entry = servedCatalog?.resources?.find(item => item.kind === 'expeditionShop' && item.resourceId === target.resourceId);
      const path = entry?.publicPath;
      if (typeof path !== 'string' || !/^data\/mijing\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/.test(path)) return false;
      const sourcePath = join(root, 'public', path);
      if (!existsSync(sourcePath)) return false;
      const response = await fetch(new URL('/' + path, base), { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) return false;
      const sourceShop = json(sourcePath), servedShop = await response.json();
      const offers = servedShop?.shopsByNodeId?.[target.nodeId]?.offers;
      if (JSON.stringify(sourceShop) !== JSON.stringify(servedShop) || servedShop.id !== target.resourceId
        || !Array.isArray(offers) || !target.offerIds.every(id => offers.some(offer => offer.id === id))) return false;
      const chosen = offers.filter(offer => target.offerIds.includes(offer.id));
      const itemStacks = chosen.flatMap(offer => [...(offer.cost?.items ?? []), ...(offer.rewards?.items ?? [])]);
      if (itemStacks.length) {
        const itemPath = 'data/world/items.artifacts.json';
        const sourceItemPath = join(root, 'public', itemPath);
        if (!existsSync(sourceItemPath)) return false;
        const itemsResponse = await fetch(new URL('/' + itemPath, base), { signal: AbortSignal.timeout(12_000) });
        if (!itemsResponse.ok) return false;
        const items = await itemsResponse.json();
        if (JSON.stringify(items) !== JSON.stringify(json(sourceItemPath))) return false;
        const known = new Map();
        for (const [field, kind] of [['artifacts', 'artifact'], ['tools', 'tool'], ['consumables', 'consumable'], ['materials', 'material'], ['quests', 'quest'], ['questItems', 'quest']]) {
          for (const item of items[field] ?? []) known.set(item.id, kind);
        }
        if (!itemStacks.every(stack => known.get(stack.id) === stack.itemType)) return false;
      }
      const cardIds = chosen.flatMap(offer => (offer.rewards?.cards ?? []).map(card => card.id));
      if (cardIds.length) {
        const known = new Set();
        for (const [field, file] of Object.values(cardCollections)) {
          const cardPath = `data/cards/${file}`;
          const sourceCardPath = join(root, 'public', cardPath);
          if (!existsSync(sourceCardPath)) continue;
          const cardsResponse = await fetch(new URL('/' + cardPath, base), { signal: AbortSignal.timeout(12_000) });
          if (!cardsResponse.ok) return false;
          const cards = await cardsResponse.json();
          if (JSON.stringify(cards) !== JSON.stringify(json(sourceCardPath))) return false;
          for (const card of cards[field] ?? []) known.add(card.id);
        }
        if (!cardIds.every(id => known.has(id))) return false;
      }
      for (const resourceId of target.mapResourceIds) {
        const mapEntry = servedCatalog?.resources?.find(item => item.kind === 'expeditionMap' && item.resourceId === resourceId);
        const mapPath = mapEntry?.publicPath;
        if (typeof mapPath !== 'string' || !/^data\/mijing\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/.test(mapPath)) return false;
        const sourceMapPath = join(root, 'public', mapPath);
        if (!existsSync(sourceMapPath)) return false;
        const mapResponse = await fetch(new URL('/' + mapPath, base), { signal: AbortSignal.timeout(12_000) });
        if (!mapResponse.ok) return false;
        const map = await mapResponse.json();
        if (JSON.stringify(map) !== JSON.stringify(json(sourceMapPath))
          || !map.nodes?.some(node => node.id === target.nodeId && node.type === 'shop'
            && node.payloadRef?.ref === target.nodeId && node.payloadRef.contentFile === path)) return false;
      }
      return true;
    }));
    const npcCatalogResponse = speakers.length || abilityReads.length || questIds.length
      ? await fetch(new URL('/data/world/npcs.json', base), { signal: AbortSignal.timeout(12_000) })
      : null;
    const servedNpcs = npcCatalogResponse?.ok ? await npcCatalogResponse.json() : null;
    const sourceNpcs = speakers.length || abilityReads.length || questIds.length ? json(join(root, 'public/data/world/npcs.json')) : null;
    const knownSpeakers = new Set(servedNpcs?.npcs?.map(npc => npc.id) ?? []);
    const questCatalogResponse = questIds.length
      ? await fetch(new URL('/data/world/quests.json', base), { signal: AbortSignal.timeout(12_000) }) : null;
    const servedQuests = questCatalogResponse?.ok ? await questCatalogResponse.json() : null;
    const sourceQuests = questIds.length ? json(join(root, 'public/data/world/quests.json')) : null;
    const questRefs = new Map();
    const noteQuest = (id, stage) => {
      if (!questRefs.has(id)) questRefs.set(id, new Set());
      questRefs.get(id).add(stage);
    };
    for (const [id, stage] of Object.entries(sourceStory?.initialState?.questStages ?? {})) noteQuest(id, stage);
    const collectQuestCondition = condition => {
      if (!condition || typeof condition !== 'object') return;
      if (condition.kind === 'questStage') noteQuest(condition.questId, condition.stage);
      else if (condition.kind === 'all' || condition.kind === 'any') (condition.conditions ?? []).forEach(collectQuestCondition);
      else if (condition.kind === 'not') collectQuestCondition(condition.condition);
    };
    const collectQuestEffects = effects => {
      for (const effect of effects ?? []) {
        if (effect.kind === 'setQuestStage') noteQuest(effect.questId, effect.stage);
        else if (effect.kind === 'once') collectQuestEffects(effect.effects);
      }
    };
    for (const node of sourceStory?.nodes ?? []) collectQuestEffects(node.onEnter);
    for (const choice of sourceStory?.choices ?? []) {
      collectQuestCondition(choice.visibleWhen);
      collectQuestCondition(choice.enabledWhen);
      collectQuestEffects(choice.effects);
    }
    const questChecks = questIds.length > 0 && questIds.every(id => {
      const quest = servedQuests?.quests?.find(item => item?.id === id);
      const refs = questRefs.get(id);
      return quest && refs?.size && typeof quest.title === 'string' && quest.title.trim()
        && Array.isArray(quest.stages) && [...refs].every(stage => quest.stages.some(item => item.id === stage))
        && Array.isArray(quest.actorIds) && quest.actorIds.every(actorId => knownSpeakers.has(actorId));
    }) && [...questRefs].every(([id, stages]) => {
      const quest = servedQuests?.quests?.find(item => item?.id === id);
      return quest && [...stages].every(stage => quest.stages?.some(item => item.id === stage));
    });
    const itemCatalogResponse = itemReads.length || recipeIds.length || itemUseIds.length || expectedItemIconPaths.length
      ? await fetch(new URL('/data/world/items.artifacts.json', base), { signal: AbortSignal.timeout(12_000) })
      : null;
    const servedItems = itemCatalogResponse?.ok ? await itemCatalogResponse.json() : null;
    const sourceItems = itemReads.length || recipeIds.length || itemUseIds.length || expectedItemIconPaths.length ? json(join(root, 'public/data/world/items.artifacts.json')) : null;
    const knownItems = new Map();
    for (const [field, kind] of [['artifacts', 'artifact'], ['tools', 'tool'], ['consumables', 'consumable'], ['materials', 'material'], ['quests', 'quest'], ['questItems', 'quest']]) {
      for (const item of servedItems?.[field] ?? []) knownItems.set(item.id, kind);
    }
    const itemUseChecks = itemUseIds.length > 0 && itemUseIds.every(id => {
      if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{1,127}$/.test(id)) return false;
      const item = servedItems?.consumables?.find(entry => entry?.id === id);
      return knownItems.get(id) === 'consumable' && item?.useEffect?.kind === 'heal'
        && Number.isSafeInteger(item.useEffect.amount) && item.useEffect.amount >= 1 && item.useEffect.amount <= 100;
    });
    const recipeChecks = recipeIds.length > 0 && recipeIds.every(id => {
      if (typeof id !== 'string' || !/^recipe[._][A-Za-z0-9._-]{1,126}$/.test(id)) return false;
      const recipe = Array.isArray(servedItems?.recipes) ? servedItems.recipes.find(item => item?.id === id) : null;
      const validStacks = (stacks, nonempty) => Array.isArray(stacks) && (!nonempty || stacks.length > 0)
        && stacks.length <= 8 && stacks.every(item => item && knownItems.get(item.id) === item.itemType
          && Number.isSafeInteger(item.count) && item.count > 0);
      return recipe && Number.isSafeInteger(recipe.cost?.spiritStones) && recipe.cost.spiritStones >= 0
        && validStacks(recipe.cost?.items, recipe.cost.spiritStones === 0)
        && validStacks(recipe.rewards?.items, true);
    });
    const verifyStoryPng = async path => {
      if (typeof path !== 'string' || !/^assets\/story\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/.test(path)) return false;
      const sourceFile = join(root, 'public', path);
      if (!existsSync(sourceFile)) return false;
      const servedFile = await fetch(new URL('/' + path, base), { signal: AbortSignal.timeout(12_000) });
      if (!servedFile.ok || !servedFile.headers.get('content-type')?.startsWith('image/png')) return false;
      const servedHash = createHash('sha256').update(Buffer.from(await servedFile.arrayBuffer())).digest('hex');
      const sourceHash = createHash('sha256').update(readFileSync(sourceFile)).digest('hex');
      return servedHash === sourceHash;
    };
    const backgrounds = [...new Set((sourceStory?.nodes ?? []).map(node => node.backgroundAsset).filter(Boolean))];
    const backgroundChecks = await Promise.all(backgrounds.map(verifyStoryPng));
    const portraits = [...new Set((sourceNpcs?.npcs ?? []).filter(npc => speakers.includes(npc.id)).map(npc => npc.portraitAsset).filter(Boolean))];
    const expectedPortraitPaths = context.options?.portraitPaths;
    const portraitContract = Array.isArray(expectedPortraitPaths)
      && JSON.stringify([...expectedPortraitPaths].sort()) === JSON.stringify(portraits.map(path => `public/${path}`).sort());
    const portraitChecks = await Promise.all(portraits.map(verifyStoryPng));
    const catalogIconPaths = new Set();
    for (const field of ['artifacts', 'tools', 'consumables', 'materials', 'quests', 'questItems']) {
      for (const item of sourceItems?.[field] ?? []) if (typeof item?.iconAsset === 'string') catalogIconPaths.add(`public/${item.iconAsset}`);
    }
    const itemIconContract = expectedItemIconPaths.length > 0
      && new Set(expectedItemIconPaths).size === expectedItemIconPaths.length
      && expectedItemIconPaths.every(path => typeof path === 'string'
        && /^public\/assets\/items\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/.test(path)
        && catalogIconPaths.has(path));
    const itemIconChecks = itemIconContract ? await Promise.all(expectedItemIconPaths.map(async path => {
      const sourceFile = join(root, path);
      if (!existsSync(sourceFile)) return false;
      const servedFile = await fetch(new URL('/' + path.slice('public/'.length), base), { signal: AbortSignal.timeout(12_000) });
      if (!servedFile.ok || !servedFile.headers.get('content-type')?.startsWith('image/png')) return false;
      return createHash('sha256').update(Buffer.from(await servedFile.arrayBuffer())).digest('hex')
        === createHash('sha256').update(readFileSync(sourceFile)).digest('hex');
    })) : [];
    const copyChecks = await Promise.all(copyPaths.map(async path => {
      if (typeof path !== 'string' || !/^public\/data\/(?:hub\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json|world\/world-map\.json)$/.test(path)
        || path.split('/').some(part => part === '.' || part === '..')) return false;
      const sourceFile = join(root, path);
      if (!existsSync(sourceFile)) return false;
      try {
        const response = await fetch(new URL('/' + path.replace(/^public\//, ''), base), { signal: AbortSignal.timeout(12_000) });
        return response.ok && JSON.stringify(await response.json()) === JSON.stringify(json(sourceFile));
      } catch { return false; }
    }));
    const hubs = storyId ? (servedCatalog?.resources ?? []).filter(item => item.kind === 'hub' && typeof item.publicPath === 'string' && /^data\/hub\/[A-Za-z0-9._/-]+\.json$/.test(item.publicPath) && !item.publicPath.split('/').includes('..')) : [];
    const routeChecks = await Promise.all(hubs.map(async item => {
      if (context.options.entryHubId && item.resourceId !== context.options.entryHubId) return false;
      const response = await fetch(new URL('/' + item.publicPath, base), { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) return false;
      const hub = await response.json();
      return hub.locations?.some(location => location.actions?.some(action => action.kind === 'startStory'
        && (!context.options.entryActionId || action.id === context.options.entryActionId)
        && action.storyResourceId === storyId && action.storyGraphFile === storyPath)) === true;
    }));
    return [
      check('game-shell', response.ok && html.includes('src/main.tsx') && html.includes('root'), '游戏页面指向实际入口'),
      check('content-catalog', catalogResponse.ok, '候选内容目录可读取'),
      ...(!storyId ? [
        check('card-definition', Boolean(expected && actual && JSON.stringify(expected) === JSON.stringify(actual)), `${cardId} 定义与确切候选工作区一致`),
        check('card-themes', assetChecks.length === 2 && assetChecks.every(Boolean), '青玉、宣纸运行贴图可读取'),
        loadoutCard
          ? check('playable-loadout', Boolean(entryResponse?.ok && servedEntry?.schemaVersion === 1
            && servedCatalog?.resources?.some(item => item.resourceId === 'config.battle-loadout'
              && item.kind === 'config' && item.publicPath === 'data/config/battle-loadout.json')
            && servedEntry?.[context.options.cardKind === 'pill' ? 'pillIds' : 'skillIds']?.includes(cardId)
            && JSON.stringify(servedEntry) === JSON.stringify(sourceEntry)), `${cardId} 已进入候选战斗槽位`)
          : check('playable-deck', Boolean(entryResponse?.ok && servedEntry?.cards?.some(card => card.id === cardId && card.count > 0) && JSON.stringify(servedEntry) === JSON.stringify(sourceEntry)), `${cardId} 已进入候选默认卡组`),
      ] : []),
      ...(storyId ? [
        check('story-resource', Boolean(storyPath && servedStoryResponse?.ok && sourceStory && JSON.stringify(servedStory) === JSON.stringify(sourceStory) && servedStory?.storyId === storyId && servedStory?.nodes?.length > 0 && servedStory?.choices?.length > 0), `${storyId} 编译图与候选源码一致`),
        check('story-route', routeChecks.some(Boolean), `${storyId} 已接入游戏 Hub 行动`),
        ...(speakers.length ? [check('story-speakers', Boolean(npcCatalogResponse?.ok && sourceNpcs && JSON.stringify(servedNpcs) === JSON.stringify(sourceNpcs) && speakers.every(id => knownSpeakers.has(id))), `${storyId} 对白人物引用与候选人物目录一致`)] : []),
        ...(abilityReads.length ? [check('story-abilities', Boolean(npcCatalogResponse?.ok && sourceNpcs && JSON.stringify(servedNpcs) === JSON.stringify(sourceNpcs) && abilityReads.every(read => Number.isFinite(servedNpcs?.npcs?.find(npc => npc.id === read.actorId)?.abilities?.[read.ability]))), `${storyId} 人物能力条件与候选目录一致`)] : []),
        ...(itemReads.length || itemUseIds.length || expectedItemIconPaths.length ? [check('story-items', Boolean(itemCatalogResponse?.ok && sourceItems && JSON.stringify(servedItems) === JSON.stringify(sourceItems) && itemReads.every(read => knownItems.has(read.itemId) && (!read.itemType || knownItems.get(read.itemId) === read.itemType)) && (!itemUseIds.length || itemUseChecks)), `${storyId} 道具条件、结果与使用效果引用候选目录`)] : []),
        ...(recipeIds.length ? [check('story-recipes', Boolean(itemCatalogResponse?.ok && sourceItems && JSON.stringify(servedItems) === JSON.stringify(sourceItems) && recipeChecks), `${storyId} 制作配方与材料引用确切候选目录`)] : []),
        ...(questIds.length ? [check('story-quests', Boolean(questCatalogResponse?.ok && sourceQuests && JSON.stringify(servedQuests) === JSON.stringify(sourceQuests)
          && npcCatalogResponse?.ok && sourceNpcs && JSON.stringify(servedNpcs) === JSON.stringify(sourceNpcs) && questChecks), `${storyId} 任务阶段、人物与确切候选目录一致`)] : []),
        ...(battles.length ? [check('story-battles', battleChecks.every(Boolean), `${storyId} 战斗遭遇与卡组引用确切候选`)] : []),
        ...(shopTargets.length ? [check('story-shops', shopChecks.every(Boolean), `${storyId} 商店报价、地图与道具引用确切候选`)] : []),
        ...(backgrounds.length ? [check('story-backgrounds', backgroundChecks.every(Boolean), `${storyId} 场景背景与候选源码一致`)] : []),
        ...(portraits.length || expectedPortraitPaths?.length ? [check('story-portraits', portraitContract && portraitChecks.every(Boolean), `${storyId} 对白人物立绘与候选源码一致`)] : []),
        ...(expectedItemIconPaths.length ? [check('story-item-icons', itemIconContract && itemIconChecks.every(Boolean), `${storyId} 道具图标引用与候选 PNG 字节一致`)] : []),
        ...(copyPaths.length ? [check('story-copy', copyChecks.every(Boolean), `${storyId} 地图与据点文案和确切候选一致`)] : []),
      ] : []),
    ];
  },
};
