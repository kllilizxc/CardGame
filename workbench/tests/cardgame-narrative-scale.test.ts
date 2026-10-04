import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createContentService } from '../plugins/cardgame-content/src/content';
import type { CompileStoryResult, StoryScenePage } from '../plugins/cardgame-content/src/types';

/** Opt in: this builds a synthetic 20-chapter book in disposable directories. */
test('narrative index, compiler, and revision paging handle the first long-book target', async () => {
  if (process.env.CARDGAME_NARRATIVE_SCALE !== '1') return;

  const root = await mkdtemp(join(tmpdir(), 'cardgame-narrative-scale-root-'));
  const dataRoot = await mkdtemp(join(tmpdir(), 'cardgame-narrative-scale-data-'));
  const projectId = 'narrative-scale';
  const chapterCount = 20;
  const npcCount = 200;
  const questCount = 50;
  const choiceCountPerChapter = 150;
  const stateKeyCount = 5_000;
  let service: ReturnType<typeof createContentService> | undefined;
  const rssMiB = (): number => Math.round(process.memoryUsage().rss / 1_048_576);
  const pad = (value: number, width = 4): string => String(value).padStart(width, '0');
  const chapterPath = (index: number): string => `knowledge/chapter-${pad(index + 1, 2)}.md`;
  const sourcePath = (index: number): string => join(root, chapterPath(index));
  const words = {
    places: ['旧桥', '山门', '药铺', '渡口', '竹林', '石阶', '灯楼', '书库', '河湾', '驿站'],
    clues: ['药方', '铃声', '雨痕', '脚印', '灯火', '封条', '空箱', '墨迹', '草叶', '木牌'],
    actions: ['辨认', '藏起', '交还', '追问', '核对', '记下', '传递', '守住', '拾起', '放下'],
    consequences: ['让同行者改变主意', '使下一道门有了线索', '引来另一位证人', '留下可以核查的痕迹', '让旧承诺有了新的分量'],
  };
  const textFor = (chapter: number, index: number): string => {
    const place = words.places[(chapter + index * 3) % words.places.length]!;
    const clue = words.clues[(chapter * 7 + index) % words.clues.length]!;
    const action = words.actions[(chapter + index * 7) % words.actions.length]!;
    const consequence = words.consequences[(chapter * 3 + index * 11) % words.consequences.length]!;
    return `第${chapter + 1}章第${index + 1}次交谈中，${place}旁的${clue}仍未说明来处；他决定先${action}证词，${consequence}。`;
  };

  try {
    await mkdir(join(root, 'knowledge'), { recursive: true });
    await mkdir(join(root, 'public/data/world'), { recursive: true });
    await writeFile(join(root, 'public/data/content-catalog.json'), '{"schemaVersion":1,"resources":[]}\n');
    const npcs = Array.from({ length: npcCount }, (_, index) => ({
      id: `npc.${pad(index, 3)}`,
      name: `人物${index}`,
      abilities: index < 50 ? { 洞察: 6 } : {},
    }));
    await writeFile(join(root, 'public/data/world/npcs.json'), `${JSON.stringify({ npcs })}\n`);
    const quests = Array.from({ length: questCount }, (_, index) => ({
      id: `quest.${pad(index, 2)}`,
      title: `第${index + 1}份证词`,
      summary: `核查第${index + 1}条跨章线索的来历。`,
      actorIds: [`npc.${pad(index, 3)}`],
      stages: [
        { id: 'available', status: 'available', label: '待核查', objective: '找到相关证人。' },
        { id: 'inProgress', status: 'active', label: '核查中', objective: '把证词带到下一章。' },
      ],
    }));
    await writeFile(join(root, 'public/data/world/quests.json'), `${JSON.stringify({ schemaVersion: 1, quests })}\n`);

    const flags = Object.fromEntries(Array.from({ length: stateKeyCount }, (_, index) => [`fact.${pad(index)}`, true]));
    const questStages = Object.fromEntries(Array.from({ length: questCount }, (_, index) => [`quest.${pad(index, 2)}`, 'available']));
    const relations = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`npc.${pad(index, 3)}`, 20]));
    const knowledge = { player: Array.from({ length: 50 }, (_, index) => `clue.${pad(index, 2)}`) };
    const initialState = JSON.stringify({ attributes: { 口才: 6 }, flags, questStages, relations, knowledge });
    let effectiveHanCharacters = 0;
    const readKeys = new Set<string>();
    const writtenKeys = new Set<string>();

    for (let chapter = 0; chapter < chapterCount; chapter += 1) {
      const lineCount = chapter === 0 ? 1_500 : chapter === 1 ? 500 : 1_000;
      const lines = Array.from({ length: lineCount }, (_, index) => {
        const speaker = (chapter * 37 + index) % npcCount;
        const text = textFor(chapter, index);
        effectiveHanCharacters += [...text].filter(character => /\p{Script=Han}/u.test(character)).length;
        return `- 人物${speaker}：${text} <!-- story-line: ${JSON.stringify({
          id: `dlg.${pad(chapter + 1, 2)}.${pad(index + 1)}`,
          speakerId: `npc.${pad(speaker, 3)}`,
        })} -->`;
      });
      const choices = Array.from({ length: choiceCountPerChapter }, (_, index) => {
        const ordinal = chapter * choiceCountPerChapter + index;
        const readKey = `fact.${pad(ordinal)}`;
        const writeKey = `fact.${pad(2_000 + ordinal)}`;
        readKeys.add(readKey);
        writtenKeys.add(writeKey);
        const quest = Math.floor(ordinal / 60);
        const importantNpc = quest % 50;
        const enabledWhen = index % 5 === 0
          ? { kind: 'all', conditions: [
              { kind: 'questStage', questId: `quest.${pad(quest, 2)}`, stage: 'available' },
              { kind: 'actorAbility', actorId: `npc.${pad(importantNpc, 3)}`, ability: '洞察', operator: '>=', value: 5 },
            ] }
          : index % 5 === 1
            ? { kind: 'relation', relationId: `npc.${pad(importantNpc, 3)}`, operator: '>=', value: 10 }
            : index % 5 === 2
              ? { kind: 'knowledge', actorId: 'player', knowledgeId: `clue.${pad(importantNpc, 2)}` }
              : index % 5 === 3
                ? { kind: 'attribute', attribute: '口才', operator: '>=', value: 5 }
                : { kind: 'always' };
        const effects: Array<Record<string, unknown>> = [{ kind: 'setFlag', flag: writeKey }];
        if (ordinal % 60 === 0) effects.push({ kind: 'setQuestStage', questId: `quest.${pad(quest, 2)}`, stage: 'inProgress' });
        if (ordinal % 60 === 1) effects.push({ kind: 'adjustRelation', relationId: `npc.${pad(importantNpc, 3)}`, delta: 1 });
        const target = index < 100 ? (chapter + 1) % chapterCount
          : index < 130 ? (chapter + 2) % chapterCount
            : (chapter + chapterCount - 1) % chapterCount;
        return `- [循第${index + 1}条线索前往第${target + 1}章](./chapter-${pad(target + 1, 2)}.md) <!-- story-choice: ${JSON.stringify({
          id: `choice.${pad(chapter + 1, 2)}.${pad(index + 1, 3)}`,
          visibleWhen: { kind: 'flag', flag: readKey },
          enabledWhen,
          effects,
        })} -->`;
      });
      const frontmatter = [
        '---', `title: 第${chapter + 1}章`, 'scene: true', `nodeId: scene.${pad(chapter + 1, 2)}`,
        `chapter: 第${chapter + 1}章`, 'location: 雾林', 'sublocation: 旧桥',
        'locationId: location.fog', 'sublocationId: sublocation.bridge', 'timeHint: 清晨',
        ...(chapter === 0 ? ['storyId: story.narrative-scale', 'shareFactsAcrossStories: true', `initialState: ${initialState}`] : []),
        '---', `# 第${chapter + 1}章`, '', `第${chapter + 1}章的线索从旧桥通向下一处证词。`, '', '## 对话', '',
      ];
      await writeFile(sourcePath(chapter), [...frontmatter, ...lines, '', '## 选项', '', ...choices, ''].join('\n'));
    }

    service = createContentService({ dataRoot, projects: [{ id: projectId, root }] });
    expect(readKeys.size).toBe(3_000);
    expect(writtenKeys.size).toBe(3_000);
    expect(new Set([...readKeys, ...writtenKeys]).size).toBe(stateKeyCount);
    expect(effectiveHanCharacters).toBeGreaterThanOrEqual(300_000);
    const rssStart = rssMiB();
    const compileStarted = performance.now();
    const compiled = await service.command('compileStory', { projectId, entry: chapterPath(0) }) as CompileStoryResult;
    // The first command also waits for the initial file/index scan.
    const coldIndexAndCompileMs = performance.now() - compileStarted;
    expect(compiled.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    const graph = JSON.parse(await readFile(join(root, 'public/data/story/narrative-scale.json'), 'utf8')) as {
      nodes: Array<{ id: string; dialogues?: Array<{ id: string; speakerId: string; text: string }> }>;
      choices: Array<{
        id: string;
        visibleWhen?: { flag?: string };
        enabledWhen?: { kind?: string; conditions?: Array<{ kind?: string; actorId?: string; questId?: string }> };
        effects?: Array<{ kind?: string; flag?: string; questId?: string }>;
      }>;
      initialState: { flags: Record<string, boolean>; questStages: Record<string, string> };
    };
    expect(graph.nodes).toHaveLength(chapterCount);
    expect(graph.choices).toHaveLength(chapterCount * choiceCountPerChapter);
    expect(graph.nodes.reduce((total, node) => total + (node.dialogues?.length ?? 0), 0)).toBe(20_000);
    expect(new Set(graph.nodes.flatMap(node => (node.dialogues ?? []).map(line => line.speakerId))).size).toBe(npcCount);
    expect(Object.keys(graph.initialState.flags)).toHaveLength(stateKeyCount);
    expect(Object.keys(graph.initialState.questStages)).toHaveLength(questCount);
    const questCatalog = JSON.parse(await readFile(join(root, 'public/data/world/quests.json'), 'utf8')) as { quests: Array<{ id: string; actorIds: string[]; stages: Array<{ id: string }> }> };
    expect(questCatalog.quests).toHaveLength(questCount);
    expect(questCatalog.quests.every(quest => quest.actorIds.length === 1
      && quest.stages.some(stage => stage.id === graph.initialState.questStages[quest.id]))).toBe(true);
    expect(graph.choices.find(choice => choice.id === 'choice.01.001')?.visibleWhen?.flag).toBe('fact.0000');
    expect(graph.choices.find(choice => choice.id === 'choice.20.150')?.effects?.[0]?.flag).toBe('fact.4999');
    const graphFlagKeys = new Set(graph.choices.flatMap(choice => [
      choice.visibleWhen?.flag,
      ...(choice.effects ?? []).map(effect => effect.flag),
    ]).filter((key): key is string => typeof key === 'string'));
    const actorAbilityIds = new Set(graph.choices.flatMap(choice =>
      choice.enabledWhen?.conditions?.filter(condition => condition.kind === 'actorAbility').map(condition => condition.actorId) ?? [],
    ).filter((id): id is string => typeof id === 'string'));
    const questEffectIds = new Set(graph.choices.flatMap(choice =>
      choice.effects?.filter(effect => effect.kind === 'setQuestStage').map(effect => effect.questId) ?? [],
    ).filter((id): id is string => typeof id === 'string'));
    expect(graphFlagKeys.size).toBe(stateKeyCount);
    expect(actorAbilityIds.size).toBe(50);
    expect(questEffectIds.size).toBe(questCount);

    const first = await service.query({ projectId, op: 'storyScenePage', path: chapterPath(0), limit: 24 }) as StoryScenePage;
    expect(first).toMatchObject({ dialogueCount: 1_500, offset: 0, nextOffset: 24 });
    const last = await service.query({ projectId, op: 'storyScenePage', path: chapterPath(0), expectedRevision: first.revision, offset: 1_488, limit: 24 }) as StoryScenePage;
    expect(last.items).toHaveLength(12);
    expect(last.nextOffset).toBeUndefined();
    expect(last.items[11]?.id).toBe('dlg.01.1500');

    const pageTimings: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const chapter = index % chapterCount;
      const started = performance.now();
      const page = await service.query({ projectId, op: 'storyScenePage', path: chapterPath(chapter), offset: (index * 23) % 480, limit: 24 }) as StoryScenePage;
      pageTimings.push(performance.now() - started);
      expect(page.items).toHaveLength(24);
    }
    const sortedPageTimings = [...pageTimings].sort((a, b) => a - b);
    const searchTimings: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const started = performance.now();
      const result = await service.query({ projectId, op: 'documents', q: words.clues[index % words.clues.length], limit: 20 }) as { items: unknown[] };
      searchTimings.push(performance.now() - started);
      expect(result.items.length).toBeGreaterThan(0);
    }
    const sortedSearchTimings = [...searchTimings].sort((a, b) => a - b);
    const oldSource = await readFile(sourcePath(0), 'utf8');
    const oldText = textFor(0, 0);
    const newText = oldText.replace('证词', '口供');
    expect(oldSource.includes(oldText)).toBe(true);
    const editStarted = performance.now();
    await service.command('saveDocument', {
      projectId, path: chapterPath(0), expectedRevision: first.revision,
      content: oldSource.replace(oldText, newText),
    });
    const saveMs = performance.now() - editStarted;
    await expect(service.query({ projectId, op: 'storyScenePage', path: chapterPath(0), expectedRevision: first.revision, offset: 24 }))
      .rejects.toThrow('changed');
    const revised = await service.query({ projectId, op: 'storyScenePage', path: chapterPath(0), limit: 1 }) as StoryScenePage;
    expect(revised.items[0]?.id).toBe(first.items[0]?.id);
    expect(revised.items[0]?.text).toContain('口供');
    const rebuildStarted = performance.now();
    const rebuilt = await service.command('compileStory', { projectId, entry: chapterPath(0) }) as CompileStoryResult;
    const rebuildMs = performance.now() - rebuildStarted;
    expect(rebuilt.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    const rebuiltGraph = JSON.parse(await readFile(join(root, 'public/data/story/narrative-scale.json'), 'utf8')) as typeof graph;
    expect(rebuiltGraph.nodes.find(node => node.id === 'scene.01')?.dialogues?.[0]?.text).toContain('口供');
    expect(rebuiltGraph.choices.map(choice => choice.id)).toEqual(graph.choices.map(choice => choice.id));

    console.log(JSON.stringify({ narrativeScale: {
      chapters: chapterCount, dialogueLines: 20_000, effectiveHanCharacters, npcs: npcCount,
      conditionalNpcs: actorAbilityIds.size, quests: questEffectIds.size, choices: graph.choices.length,
      declaredFlagKeys: stateKeyCount, referencedFlagKeys: graphFlagKeys.size,
      outputBytes: Buffer.byteLength(JSON.stringify(graph)),
      coldIndexAndCompileMs: Math.round(coldIndexAndCompileMs), saveMs: Math.round(saveMs), rebuildMs: Math.round(rebuildMs),
      page30P95Ms: Math.round(sortedPageTimings[Math.ceil(pageTimings.length * 0.95) - 1]!),
      page30MaxMs: Math.round(sortedPageTimings.at(-1)!), rssMiB: { start: rssStart, after: rssMiB() },
      search30P95Ms: Math.round(sortedSearchTimings[Math.ceil(searchTimings.length * 0.95) - 1]!),
      search30MaxMs: Math.round(sortedSearchTimings.at(-1)!),
    } }));
  } finally {
    await service?.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    await rm(dataRoot, { recursive: true, force: true });
  }
}, 180_000);
