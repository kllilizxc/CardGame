import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContentService, type ContentService } from '../plugins/cardgame-content/src/content';
import type { CompileStoryResult, ContentDocumentMeta, Page, StoryBuildItem, StoryScenePage } from '../plugins/cardgame-content/src/types';

const SCENE_FIELDS = [
  'chapter: 第一章',
  'location: 青云镇',
  'sublocation: 镇口',
  'locationId: location.qingyun',
  'sublocationId: sublocation.qingyun.gate',
  'timeHint: 清晨',
].join('\n');

function sceneDocument(title: string, body: string, extraFrontmatter = ''): string {
  return `---\ntitle: ${title}\nscene: true\n${SCENE_FIELDS}${extraFrontmatter ? `\n${extraFrontmatter}` : ''}\n---\n# ${title}\n\n${body}\n`;
}

const INTRO = sceneDocument('入口', `你站在青云镇口。

晨雾未散。

## 选项

- [走进小镇](./village.md)
- [前往森林](./forest.md)

## 备注

参见[设定](./notes.md)。`, 'tags: [入口, 主线]');

const VILLAGE = sceneDocument('小镇', '镇上空无一人。\n');

const FOREST = sceneDocument('森林', `森林里很安静。

## 选项

- [返回镇口](./intro.md)

## 备注

参见[设定](./notes.md)。`);

const NOTES = '# 设定\n\n只是资料，不是场景。\n';

const BROKEN = sceneDocument('断链', `前方没有路。

## 选项

- [踏虚空](./missing.md)`);

const NON_SCENE_TARGET = sceneDocument('歧途', `资料被当成了分支。

## 选项

- [翻设定](./notes.md)`);

const INITIAL_CATALOG = '{\n  "schemaVersion": 1,\n  "resources": []\n}\n';

async function fixture(): Promise<{ root: string; dataRoot: string; service: ContentService; close: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'cardgame-compile-root-'));
  const dataRoot = await mkdtemp(join(tmpdir(), 'cardgame-compile-data-'));
  await mkdir(join(root, 'knowledge'), { recursive: true });
  await mkdir(join(root, 'public', 'data'), { recursive: true });
  await writeFile(join(root, 'knowledge', 'intro.md'), INTRO);
  await writeFile(join(root, 'knowledge', 'village.md'), VILLAGE);
  await writeFile(join(root, 'knowledge', 'forest.md'), FOREST);
  await writeFile(join(root, 'knowledge', 'notes.md'), NOTES);
  await writeFile(join(root, 'knowledge', 'broken.md'), BROKEN);
  await writeFile(join(root, 'knowledge', 'astray.md'), NON_SCENE_TARGET);
  await writeFile(join(root, 'public', 'data', 'content-catalog.json'), INITIAL_CATALOG);
  const service = createContentService({ dataRoot, projects: [{ id: 'fixture', root }] });
  return {
    root,
    dataRoot,
    service,
    close: async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
      await rm(dataRoot, { recursive: true, force: true });
    },
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('CardGame story compilation', () => {
  test('keeps compiled prose identical when Markdown uses CRLF line endings', async () => {
    const f = await fixture();
    try {
      const output = join(f.root, 'public/data/story/intro.json');
      const first = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(first.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
      const baseline = JSON.parse(await readFile(output, 'utf8'));
      const current = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', {
        projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: current.revision,
        content: INTRO.replace(/\n/gu, '\r\n'),
      });
      const rebuilt = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(rebuilt.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
      const graph = JSON.parse(await readFile(output, 'utf8'));
      expect(graph).toEqual(baseline);
      expect(graph.nodes[0].detail).toBe('你站在青云镇口。\n\n晨雾未散。');
    } finally { await f.close(); }
  });

  test('rejects a same-size external scene edit before serving indexed dialogue', async () => {
    const f = await fixture();
    try {
      const path = join(f.root, 'knowledge/intro.md');
      const first = await f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: 'knowledge/intro.md' }) as StoryScenePage;
      const before = await stat(path);
      const changed = INTRO.replace('晨雾未散。', '朝雾未散。');
      expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(INTRO));
      await writeFile(path, changed);
      await utimes(path, before.atime, before.mtime);
      await expect(f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: first.path, expectedRevision: first.revision }))
        .rejects.toThrow('changed');
    } finally { await f.close(); }
  });

  test('reads a 750-line scene in bounded pages and rejects stale continuation', async () => {
    const f = await fixture();
    try {
      const lines = Array.from({ length: 750 }, (_, index) =>
        `- 狐爷爷：第 ${index + 1} 句，桥下的水声又近了一点。 <!-- story-line: {"id":"dlg.bridge.${String(index + 1).padStart(4, '0')}","speakerId":"npc.fox"} -->`);
      const content = sceneDocument('石桥长谈', `山风掠过石桥。\n\n## 对话\n\n${lines.join('\n')}\n\n## 选项\n\n- [走进森林](./forest.md)`, 'nodeId: scene.bridge.talk');
      const before = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: before.revision, content });
      const meta = await f.service.query({ projectId: 'fixture', op: 'documentMeta', path: 'knowledge/intro.md' }) as ContentDocumentMeta;
      expect(meta.size > 24 * 1024).toBe(true);
      expect(meta).toMatchObject({ path: 'knowledge/intro.md', isScene: true });
      expect(meta).not.toHaveProperty('content');
      expect((await f.service.query({ projectId: 'fixture', op: 'documentMeta', path: 'knowledge/notes.md' }) as ContentDocumentMeta).isScene).toBe(false);
      const first = await f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: 'knowledge/intro.md', limit: 24 }) as StoryScenePage;
      expect(first.revision).toBe(meta.revision);
      expect(first).toMatchObject({ nodeId: 'scene.bridge.talk', chapter: '第一章', dialogueCount: 750, offset: 0, nextOffset: 24 });
      expect(first.items).toHaveLength(24);
      expect(first.items[0]).toMatchObject({ id: 'dlg.bridge.0001', speakerId: 'npc.fox', line: 18 });
      const middle = await f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: first.path, expectedRevision: first.revision, offset: first.nextOffset, limit: 24 }) as StoryScenePage;
      expect(middle.items[0]?.id).toBe('dlg.bridge.0025');
      const last = await f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: first.path, expectedRevision: first.revision, offset: 744, limit: 24 }) as StoryScenePage;
      expect(last.items.map(item => item.id)).toEqual(['dlg.bridge.0745', 'dlg.bridge.0746', 'dlg.bridge.0747', 'dlg.bridge.0748', 'dlg.bridge.0749', 'dlg.bridge.0750']);
      expect(last.nextOffset).toBeUndefined();
      const built = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(built.diagnostics.some(item => item.severity === 'error')).toBe(false);
      const graph = JSON.parse(await readFile(join(f.root, 'public/data/story/intro.json'), 'utf8')) as { nodes: Array<{ dialogues?: Array<Record<string, unknown>> }> };
      expect(graph.nodes[0]?.dialogues?.[0]).not.toHaveProperty('line');
      await f.service.command('saveDocument', { projectId: 'fixture', path: first.path, expectedRevision: first.revision, content: content.replace('桥下的水声', '桥上的风声') });
      await expect(f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: first.path, expectedRevision: first.revision, offset: 24 })).rejects.toThrow('changed');
      await f.service.close();
      const reopened = createContentService({ dataRoot: f.dataRoot, projects: [{ id: 'fixture', root: f.root }] });
      try {
        const persisted = await reopened.query({ projectId: 'fixture', op: 'storyScenePage', path: first.path, offset: 744, limit: 24 }) as StoryScenePage;
        expect(persisted.dialogueCount).toBe(750);
        expect(persisted.items[0]?.id).toBe('dlg.bridge.0745');
        const persistedFirst = await reopened.query({ projectId: 'fixture', op: 'storyScenePage', path: first.path, limit: 1 }) as StoryScenePage;
        expect(persistedFirst.items[0]).toMatchObject({ id: 'dlg.bridge.0001', text: expect.stringContaining('桥上的风声') });
      } finally { await reopened.close(); }
    } finally { await f.close(); }
  }, 15_000);

  test('compiles stable dialogue lines separately from prose and rejects duplicate line IDs', async () => {
    const f = await fixture();
    try {
      const line = (id: string, text: string) => `- 狐爷爷：${text} <!-- story-line: {"id":"${id}","speakerId":"npc.fox"} -->`;
      const intro = sceneDocument('石桥', `石桥上还留着昨夜的露水。\n\n## 对话\n\n${line('dlg.fox.001', '你来得比雾早。')}\n${line('dlg.fox.002', '药方还在吗？')}\n\n## 选项\n\n- [向前走](./forest.md)`, 'nodeId: scene.bridge');
      await writeFile(join(f.root, 'knowledge/intro.md'), intro);
      const built = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(built.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
      const graph = JSON.parse(await readFile(join(f.root, 'public/data/story/intro.json'), 'utf8'));
      expect(graph.nodes[0].detail).toBe('石桥上还留着昨夜的露水。');
      expect(graph.nodes[0].dialogues).toEqual([
        { id: 'dlg.fox.001', speakerId: 'npc.fox', speakerName: '狐爷爷', text: '你来得比雾早。' },
        { id: 'dlg.fox.002', speakerId: 'npc.fox', speakerName: '狐爷爷', text: '药方还在吗？' },
      ]);
      const forest = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/forest.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/forest.md', expectedRevision: forest.revision,
        content: sceneDocument('森林', `林中有风。\n\n## 对话\n\n${line('dlg.fox.001', '同一个 ID 不能复用。')}`) });
      const duplicate = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true }) as CompileStoryResult;
      expect(duplicate.diagnostics.some(item => item.severity === 'error' && item.detail.includes('对白 ID dlg.fox.001 已用于'))).toBe(true);
      const introRevision = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: introRevision.revision,
        content: intro.replace('## 选项', '## 对话\n\n## 选项') });
      const repeatedSection = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true }) as CompileStoryResult;
      expect(repeatedSection.diagnostics.some(item => item.severity === 'error' && item.detail.includes('只能有一个 ## 对话'))).toBe(true);
    } finally { await f.close(); }
  });

  test('keeps a real scene background and rejects a missing image', async () => {
    const f = await fixture();
    try {
      const imagePath = join(f.root, 'public/assets/story/fog/entry.png');
      await mkdir(join(f.root, 'public/assets/story/fog'), { recursive: true });
      await writeFile(imagePath, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000002010001e221bc330000000049454e44ae426082', 'hex'));
      await writeFile(join(f.root, 'knowledge/intro.md'), sceneDocument('入口', '## 选项\n\n- [进森林](./forest.md)', 'backgroundAsset: assets/story/fog/entry.png'));
      const built = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(built.diagnostics.some(item => item.severity === 'error')).toBe(false);
      const graph = JSON.parse(await readFile(join(f.root, 'public/data/story/intro.json'), 'utf8'));
      expect(graph.nodes[0].backgroundAsset).toBe('assets/story/fog/entry.png');
      await rm(imagePath);
      const missing = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true }) as CompileStoryResult;
      expect(missing.diagnostics.some(item => item.severity === 'error' && item.detail.includes('背景文件不存在'))).toBe(true);
    } finally { await f.close(); }
  });

  test('compiles stable scene and choice IDs with executable conditions and effects', async () => {
    const f = await fixture();
    try {
      const rule = '<!-- story-choice: {"id":"choice.promise","description":"先问清旧药方的来历","visibleWhen":{"kind":"flag","flag":"knows.secret"},"enabledWhen":{"kind":"attribute","attribute":"口才","operator":">=","value":6},"effects":[{"kind":"setFlag","flag":"promised"},{"kind":"adjustRelation","relationId":"npc.fox","delta":10}]} -->';
      const villageRule = '<!-- story-choice: {"id":"choice.visit-village"} -->';
      const intro = sceneDocument('入口', `晨雾未散。\n\n## 选项\n\n- [保守秘密](./forest.md) ${rule}\n- [去镇上](./village.md) ${villageRule}`, 'nodeId: scene.fox.entry\nstoryId: story.fox\nshareFactsAcrossStories: true\ninitialState: {"attributes":{"口才":4},"flags":{"knows.secret":true},"knowledge":{"player":["fox.poisoned"]},"questStages":{"quest.heal-fox":"available"}}\nonEnter: [{"kind":"setFlag","flag":"visited.fox"}]');
      await writeFile(join(f.root, 'knowledge', 'intro.md'), intro);
      await writeFile(join(f.root, 'knowledge', 'forest.md'), sceneDocument('森林', '林中有一只灵狐。', 'nodeId: scene.fox.forest'));
      await writeFile(join(f.root, 'knowledge', 'village.md'), sceneDocument('小镇', '镇上空无一人。', 'nodeId: scene.fox.village'));
      const first = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(first.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
      const output = join(f.root, 'public', 'data', 'story', 'fox.json');
      const graph = JSON.parse(await readFile(output, 'utf8')) as Record<string, any>;
      expect(graph.entryNodeId).toBe('scene.fox.entry');
      expect(graph.initialState).toEqual({ locationId: 'location.qingyun', sublocationId: 'sublocation.qingyun.gate', attributes: { 口才: 4 }, flags: { 'knows.secret': true }, knowledge: { player: ['fox.poisoned'] }, questStages: { 'quest.heal-fox': 'available' } });
      expect(graph.shareFactsAcrossStories).toBe(true);
      expect(graph.nodes.find((node: any) => node.id === 'scene.fox.entry').onEnter).toEqual([{ kind: 'setFlag', flag: 'visited.fox' }]);
      expect(graph.choices[0]).toMatchObject({ id: 'choice.promise', from: 'scene.fox.entry', to: 'scene.fox.forest', description: '先问清旧药方的来历', visibleWhen: { kind: 'flag', flag: 'knows.secret' }, enabledWhen: { kind: 'attribute', attribute: '口才', operator: '>=', value: 6 }, effects: [{ kind: 'setFlag', flag: 'promised' }, { kind: 'adjustRelation', relationId: 'npc.fox', delta: 10 }] });

      const reordered = intro.replace(`- [保守秘密](./forest.md) ${rule}\n- [去镇上](./village.md) ${villageRule}`, `- [去镇上](./village.md) ${villageRule}\n- [保守秘密](./forest.md) ${rule}`);
      const revision = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', content: reordered, expectedRevision: revision.revision });
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' });
      const after = JSON.parse(await readFile(output, 'utf8')) as Record<string, any>;
      expect(after.choices.find((choice: any) => choice.id === 'choice.promise')).toMatchObject({ from: 'scene.fox.entry', to: 'scene.fox.forest' });
    } finally {
      await f.close();
    }
  });

  test('shared story rejects path and ordinal IDs without replacing its playable build', async () => {
    const f = await fixture();
    try {
      const legacy = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true }) as CompileStoryResult;
      expect(legacy.diagnostics.some(item => item.severity === 'error')).toBe(false);

      const marker = '<!-- story-choice: {"id":"choice.bridge.cross"} -->';
      const entry = sceneDocument('石桥', `山路通向雾林。\n\n## 选项\n\n- [越过石桥](./forest.md) ${marker}`,
        'storyId: story.bridge\nnodeId: scene.bridge\nshareFactsAcrossStories: true');
      const entryBefore = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: entryBefore.revision, content: entry });
      const forestBefore = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/forest.md' }) as { revision: string };
      const forest = sceneDocument('雾林', '树间有一条小路。', 'nodeId: scene.forest');
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/forest.md', expectedRevision: forestBefore.revision, content: forest });

      const built = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(built.diagnostics.some(item => item.severity === 'error')).toBe(false);
      const output = join(f.root, 'public/data/story/bridge.json');
      const playable = await readFile(output, 'utf8');
      expect(JSON.parse(playable).choices[0].id).toBe('choice.bridge.cross');

      const noStoryId = entry.replace('storyId: story.bridge\n', '');
      const entryRevision = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: entryRevision.revision,
        content: noStoryId });
      const missingStoryId = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true }) as CompileStoryResult;
      expect(missingStoryId.diagnostics.some(item => item.severity === 'error' && item.detail.includes('稳定 storyId'))).toBe(true);
      const suppliedStoryId = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', storyId: 'story.bridge', dryRun: true }) as CompileStoryResult;
      expect(suppliedStoryId.diagnostics.some(item => item.severity === 'error')).toBe(false);
      expect(await readFile(output, 'utf8')).toBe(playable);

      const restoreRevision = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: restoreRevision.revision,
        content: entry });
      const conflictingStoryId = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', storyId: 'story.other', dryRun: true }) as CompileStoryResult;
      expect(conflictingStoryId.diagnostics.some(item => item.severity === 'error' && item.detail.includes('与编译请求'))).toBe(true);
      expect(await exists(join(f.root, 'public/data/story/other.json'))).toBe(false);
      expect(await readFile(output, 'utf8')).toBe(playable);

      const currentEntry = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: currentEntry.revision,
        content: entry.replace(` ${marker}`, '') });
      const missingChoice = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(missingChoice.diagnostics.some(item => item.severity === 'error' && item.detail.includes('稳定 id'))).toBe(true);
      expect(await readFile(output, 'utf8')).toBe(playable);

      const brokenEntry = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', expectedRevision: brokenEntry.revision,
        content: entry });
      const currentForest = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/forest.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/forest.md', expectedRevision: currentForest.revision,
        content: forest.replace('nodeId: scene.forest\n', '') });
      const missingNode = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(missingNode.diagnostics.some(item => item.severity === 'error' && item.detail.includes('稳定 nodeId'))).toBe(true);
      expect(await readFile(output, 'utf8')).toBe(playable);
    } finally { await f.close(); }
  }, 15_000);

  test('rejects malformed rules and duplicate stable IDs before writing a graph', async () => {
    const f = await fixture();
    try {
      await writeFile(join(f.root, 'knowledge', 'intro.md'), sceneDocument('入口', '## 选项\n\n- [去森林](./forest.md) <!-- story-choice: {"id":"choice.fox","enabledWhen":{"kind":"unknown"}} -->', 'nodeId: scene.same'));
      await writeFile(join(f.root, 'knowledge', 'forest.md'), sceneDocument('森林', '林中有一只灵狐。', 'nodeId: scene.same'));
      const result = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(result.diagnostics.some((entry) => entry.severity === 'error' && entry.detail.includes('不受支持'))).toBe(true);
      expect(await exists(join(f.root, 'public', 'data', 'story', 'intro.json'))).toBe(false);

      const intro = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('saveDocument', { projectId: 'fixture', path: 'knowledge/intro.md', content: sceneDocument('入口', '## 选项\n\n- [去森林](./forest.md) <!-- story-choice: {"id":"choice.fox"} -->', 'nodeId: scene.same'), expectedRevision: intro.revision });
      const duplicate = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(duplicate.diagnostics.some((entry) => entry.severity === 'error' && entry.detail.includes('nodeId scene.same 已用于'))).toBe(true);
      expect(await exists(join(f.root, 'public', 'data', 'story', 'intro.json'))).toBe(false);
    } finally {
      await f.close();
    }
  });

  test('compiles a scene graph into story JSON and updates the catalog idempotently', async () => {
    const f = await fixture();
    try {
      const first = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(first).toMatchObject({
        storyId: 'story.intro',
        outputPath: 'public/data/story/intro.json',
        catalogUpdated: true,
        nodeCount: 3,
        choiceCount: 3,
      });
      expect(first.diagnostics).toEqual([
        { severity: 'warning', path: 'knowledge/village.md', detail: expect.stringContaining('选项') },
      ]);

      const graph = JSON.parse(await readFile(join(f.root, 'public', 'data', 'story', 'intro.json'), 'utf8')) as Record<string, any>;
      expect(graph.storyId).toBe('story.intro');
      expect(graph.title).toBe('入口');
      expect(graph.entryNodeId).toBe('n:intro.md');
      expect(graph.initialState).toEqual({ locationId: 'location.qingyun', sublocationId: 'sublocation.qingyun.gate' });
      expect(graph.nodes).toHaveLength(3);
      const entryNode = graph.nodes.find((node: any) => node.id === 'n:intro.md');
      expect(entryNode).toMatchObject({
        type: 'story',
        title: '入口',
        summary: '你站在青云镇口。',
        detail: '你站在青云镇口。\n\n晨雾未散。',
        tags: ['入口', '主线'],
        chapter: '第一章',
        location: '青云镇',
        sublocation: '镇口',
        locationId: 'location.qingyun',
        sublocationId: 'sublocation.qingyun.gate',
        timeHint: '清晨',
        onEnter: [],
      });
      expect(graph.choices).toEqual([
        { id: 'c:n:intro.md#1', from: 'n:intro.md', to: 'n:village.md', text: '走进小镇', description: '走进小镇', effects: [], flags: [] },
        { id: 'c:n:intro.md#2', from: 'n:intro.md', to: 'n:forest.md', text: '前往森林', description: '前往森林', effects: [], flags: [] },
        { id: 'c:n:forest.md#1', from: 'n:forest.md', to: 'n:intro.md', text: '返回镇口', description: '返回镇口', effects: [], flags: [] },
      ]);

      const catalog = JSON.parse(await readFile(join(f.root, 'public', 'data', 'content-catalog.json'), 'utf8')) as { resources: Array<Record<string, unknown>> };
      expect(catalog.resources).toEqual([
        { resourceId: 'story.intro', kind: 'story', schemaVersion: 1, publicPath: 'data/story/intro.json' },
      ]);

      const storyBytes = await readFile(join(f.root, 'public', 'data', 'story', 'intro.json'));
      const catalogBytes = await readFile(join(f.root, 'public', 'data', 'content-catalog.json'));
      const second = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(second.catalogUpdated).toBe(false);
      expect(second.nodeCount).toBe(3);
      expect(await readFile(join(f.root, 'public', 'data', 'story', 'intro.json'))).toEqual(storyBytes);
      expect(await readFile(join(f.root, 'public', 'data', 'content-catalog.json'))).toEqual(catalogBytes);

      const builds = await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>;
      expect(builds.total).toBe(1);
      expect(builds.items[0]).toMatchObject({
        storyId: 'story.intro',
        outputPath: 'public/data/story/intro.json',
        errorCount: 0,
        warningCount: 1,
        nodeCount: 3,
        choiceCount: 3,
      });
      expect(builds.items[0]!.sourcePaths).toEqual(['knowledge/intro.md', 'knowledge/village.md', 'knowledge/forest.md']);
    } finally {
      await f.close();
    }
  });

  test('dryRun validates without writing files or recording a build', async () => {
    const f = await fixture();
    try {
      const result = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true }) as CompileStoryResult;
      expect(result.nodeCount).toBe(3);
      expect(result.choiceCount).toBe(3);
      expect(result.catalogUpdated).toBe(false);
      expect(await exists(join(f.root, 'public', 'data', 'story', 'intro.json'))).toBe(false);
      expect(await readFile(join(f.root, 'public', 'data', 'content-catalog.json'), 'utf8')).toBe(INITIAL_CATALOG);
      const builds = await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>;
      expect(builds.items).toHaveLength(0);
    } finally {
      await f.close();
    }
  });

  test('reports errors for broken or non-scene option targets and writes nothing', async () => {
    const f = await fixture();
    try {
      const broken = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/broken.md' }) as CompileStoryResult;
      expect(broken.nodeCount).toBe(1);
      expect(broken.choiceCount).toBe(0);
      expect(broken.diagnostics.some((d) => d.severity === 'error' && d.path === 'knowledge/broken.md' && d.detail.includes('./missing.md'))).toBe(true);
      expect(await exists(join(f.root, 'public', 'data', 'story', 'broken.json'))).toBe(false);

      const astray = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/astray.md' }) as CompileStoryResult;
      expect(astray.diagnostics.some((d) => d.severity === 'error' && d.detail.includes('knowledge/notes.md') && d.detail.includes('scene: true'))).toBe(true);
      expect(await exists(join(f.root, 'public', 'data', 'story', 'astray.json'))).toBe(false);

      expect(await readFile(join(f.root, 'public', 'data', 'content-catalog.json'), 'utf8')).toBe(INITIAL_CATALOG);

      const builds = await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>;
      expect(builds.total).toBe(2);
      expect(builds.items.map((item) => [item.storyId, item.errorCount])).toEqual([['story.astray', 1], ['story.broken', 1]]);
    } finally {
      await f.close();
    }
  });

  test('rejects a non-scene entry document without writing', async () => {
    const f = await fixture();
    try {
      const result = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/notes.md' }) as CompileStoryResult;
      expect(result.nodeCount).toBe(0);
      expect(result.diagnostics).toEqual([
        { severity: 'error', path: 'knowledge/notes.md', detail: expect.stringContaining('scene: true') },
      ]);
      expect(await exists(join(f.root, 'public', 'data', 'story', 'notes.json'))).toBe(false);
    } finally {
      await f.close();
    }
  });

  test('honours a storyId override for the output path and catalog entry', async () => {
    const f = await fixture();
    try {
      const result = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', storyId: 'story.custom-intro' }) as CompileStoryResult;
      expect(result.storyId).toBe('story.custom-intro');
      expect(result.outputPath).toBe('public/data/story/custom-intro.json');
      const graph = JSON.parse(await readFile(join(f.root, 'public', 'data', 'story', 'custom-intro.json'), 'utf8')) as { storyId: string };
      expect(graph.storyId).toBe('story.custom-intro');
      const catalog = JSON.parse(await readFile(join(f.root, 'public', 'data', 'content-catalog.json'), 'utf8')) as { resources: Array<Record<string, unknown>> };
      expect(catalog.resources[0]).toMatchObject({ resourceId: 'story.custom-intro', publicPath: 'data/story/custom-intro.json' });
    } finally {
      await f.close();
    }
  });

  test('rejects colliding story output names without changing the owner or poisoning its rebuild', async () => {
    const f = await fixture();
    try {
      const owner = await f.service.command('compileStory', {
        projectId: 'fixture', entry: 'knowledge/intro.md', storyId: 'story.a:b',
      }) as CompileStoryResult;
      expect(owner.diagnostics.some(item => item.severity === 'error')).toBe(false);
      const output = join(f.root, owner.outputPath);
      const originalGraph = await readFile(output);
      const originalCatalog = await readFile(join(f.root, 'public/data/content-catalog.json'));

      for (const dryRun of [true, false]) {
        const collision = await f.service.command('compileStory', {
          projectId: 'fixture', entry: 'knowledge/intro.md', storyId: 'story.a-b', dryRun,
        }) as CompileStoryResult;
        expect(collision.outputPath).toBe(owner.outputPath);
        expect(collision.diagnostics.some(item => item.severity === 'error' && item.detail.includes('已属于 story.a:b'))).toBe(true);
        expect(await readFile(output)).toEqual(originalGraph);
        expect(await readFile(join(f.root, 'public/data/content-catalog.json'))).toEqual(originalCatalog);
      }

      const builds = await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>;
      expect(builds.items.map(item => item.storyId)).toEqual(['story.a:b']);
      const rebuilt = await f.service.command('compileStory', {
        projectId: 'fixture', entry: 'knowledge/intro.md', storyId: 'story.a:b',
      }) as CompileStoryResult;
      expect(rebuilt.diagnostics.some(item => item.severity === 'error')).toBe(false);
    } finally { await f.close(); }
  });

  test('preserves an unregistered story output owned by another story', async () => {
    const f = await fixture();
    try {
      const output = join(f.root, 'public/data/story/intro.json');
      await mkdir(join(f.root, 'public/data/story'), { recursive: true });
      const original = '{"storyId":"story.someone-else"}\n';
      await writeFile(output, original);
      const result = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(result.diagnostics.some(item => item.severity === 'error' && item.detail.includes('story.someone-else'))).toBe(true);
      expect(await readFile(output, 'utf8')).toBe(original);
      expect((await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items).toEqual([]);
    } finally { await f.close(); }
  });

  test('does not claim a story path already assigned to another catalog resource', async () => {
    const f = await fixture();
    try {
      const catalogPath = join(f.root, 'public/data/content-catalog.json');
      const catalog = '{"schemaVersion":1,"resources":[{"resourceId":"story.someone-else","kind":"story","schemaVersion":1,"publicPath":"data/story/intro.json"}]}\n';
      await writeFile(catalogPath, catalog);
      const result = await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }) as CompileStoryResult;
      expect(result.diagnostics.some(item => item.severity === 'error' && item.detail.includes('story.someone-else'))).toBe(true);
      expect(await exists(join(f.root, 'public/data/story/intro.json'))).toBe(false);
      expect(await readFile(catalogPath, 'utf8')).toBe(catalog);
      expect((await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items).toEqual([]);
    } finally { await f.close(); }
  });

  test('does not write a graph or successful build when the content catalog is invalid', async () => {
    const f = await fixture();
    try {
      await writeFile(join(f.root, 'public/data/content-catalog.json'), '{invalid');
      await expect(f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' }))
        .rejects.toThrow('not valid JSON');
      expect(await exists(join(f.root, 'public/data/story/intro.json'))).toBe(false);
      expect((await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items).toEqual([]);
    } finally { await f.close(); }
  });

  test('rebuilds affected stories automatically when a source document is saved', async () => {
    const f = await fixture();
    try {
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' });
      const village = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/village.md' }) as { revision: string };
      await f.service.command('saveDocument', {
        projectId: 'fixture',
        path: 'knowledge/village.md',
        content: sceneDocument('小镇', '镇上张灯结彩。\n'),
        expectedRevision: village.revision,
      });
      // Flush the queued rebuild behind a dry-run compile on the same queue.
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true });
      const graph = JSON.parse(await readFile(join(f.root, 'public', 'data', 'story', 'intro.json'), 'utf8')) as { nodes: Array<{ id: string; detail: string }> };
      expect(graph.nodes.find((node) => node.id === 'n:village.md')?.detail).toBe('镇上张灯结彩。');

      // A document outside every build's sources triggers no rebuild.
      const notes = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/notes.md' }) as { revision: string };
      const before = (await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items[0]!.builtAt;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await f.service.command('saveDocument', {
        projectId: 'fixture',
        path: 'knowledge/notes.md',
        content: '# 设定\n\n补充一句设定。\n',
        expectedRevision: notes.revision,
      });
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true });
      const after = (await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items[0]!.builtAt;
      expect(after).toBe(before);
    } finally {
      await f.close();
    }
  });

  test('keeps the last good output when an automatic rebuild fails, and recovers', async () => {
    const f = await fixture();
    try {
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' });
      const goodBytes = await readFile(join(f.root, 'public', 'data', 'story', 'intro.json'));

      const forest = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/forest.md' }) as { revision: string };
      const brokenForest = sceneDocument('森林', `森林里很安静。\n\n## 选项\n\n- [踏虚空](./missing.md)`);
      await f.service.command('saveDocument', {
        projectId: 'fixture',
        path: 'knowledge/forest.md',
        content: brokenForest,
        expectedRevision: forest.revision,
      });
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true });
      expect(await readFile(join(f.root, 'public', 'data', 'story', 'intro.json'))).toEqual(goodBytes);
      let build = (await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items[0]!;
      expect(build.errorCount).toBe(1);

      const forestAgain = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/forest.md' }) as { revision: string };
      await f.service.command('saveDocument', {
        projectId: 'fixture',
        path: 'knowledge/forest.md',
        content: FOREST,
        expectedRevision: forestAgain.revision,
      });
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md', dryRun: true });
      build = (await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items[0]!;
      expect(build.errorCount).toBe(0);
    } finally {
      await f.close();
    }
  });

  test('keeps storyId stable and rebuilds when the entry document moves', async () => {
    const f = await fixture();
    try {
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/intro.md' });
      const intro = await f.service.query({ projectId: 'fixture', op: 'document', path: 'knowledge/intro.md' }) as { revision: string };
      await f.service.command('moveDocument', {
        projectId: 'fixture',
        path: 'knowledge/intro.md',
        toPath: 'knowledge/chapter/intro.md',
        expectedRevision: intro.revision,
      });
      await f.service.command('compileStory', { projectId: 'fixture', entry: 'knowledge/chapter/intro.md', dryRun: true });
      const movedPage = await f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: 'knowledge/chapter/intro.md' }) as StoryScenePage;
      expect(movedPage).toMatchObject({ path: 'knowledge/chapter/intro.md', dialogueCount: 0 });
      await expect(f.service.query({ projectId: 'fixture', op: 'storyScenePage', path: 'knowledge/intro.md' })).rejects.toThrow('not found');

      const graph = JSON.parse(await readFile(join(f.root, 'public', 'data', 'story', 'intro.json'), 'utf8')) as { storyId: string; entryNodeId: string; choices: Array<{ to: string }> };
      expect(graph.storyId).toBe('story.intro');
      expect(graph.entryNodeId).toBe('n:chapter/intro.md');
      expect(graph.choices.some((choice) => choice.to === 'n:chapter/intro.md')).toBe(true);

      const build = (await f.service.query({ projectId: 'fixture', op: 'storyBuilds' }) as Page<StoryBuildItem>).items[0]!;
      expect(build.entryPath).toBe('knowledge/chapter/intro.md');
      expect(build.errorCount).toBe(0);
      expect(build.sourcePaths).toContain('knowledge/chapter/intro.md');

      const catalog = JSON.parse(await readFile(join(f.root, 'public', 'data', 'content-catalog.json'), 'utf8')) as { resources: Array<Record<string, unknown>> };
      expect(catalog.resources).toEqual([
        { resourceId: 'story.intro', kind: 'story', schemaVersion: 1, publicPath: 'data/story/intro.json' },
      ]);
    } finally {
      await f.close();
    }
  });
});
