import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createContentService } from '../plugins/cardgame-content/src/content';
import { createWorkflowService } from '../plugins/cardgame-content/src/workflow';
import { createGameCandidateService } from '../plugins/cardgame-content/src/game-candidates';
import { createGameAdoptionService } from '../plugins/cardgame-content/src/game-adoption';
import { candidatePreviewOptions } from '../plugins/cardgame-content/src/registration';

const git = promisify(execFile);
const scene = (id: string, title: string, body: string, extra = '') => `---\ntitle: ${title}\nscene: true\nnodeId: ${id}\nchapter: 第一章\nlocation: 雾林\nsublocation: 药铺\nlocationId: location.fog\nsublocationId: sublocation.apothecary\ntimeHint: 白天\n${extra}---\n# ${title}\n\n${body}\n`;

async function fixture(registerPreview?: Parameters<typeof createGameCandidateService>[0]['registerPreview']) {
  const directory = await mkdtemp(join(tmpdir(), 'story-candidate-'));
  const root = join(directory, 'game');
  const dataRoot = join(directory, 'worka');
  await mkdir(join(root, 'public/data/hub'), { recursive: true });
  await mkdir(join(root, 'knowledge'), { recursive: true });
  const hub = { hubId: 'hub.town', title: '小镇', defaultLocationId: 'location.town', locations: [{ id: 'location.town', title: '镇口', actions: [] }] };
  await writeFile(join(root, 'public/data/hub/town.json'), JSON.stringify(hub, null, 2) + '\n');
  await writeFile(join(root, 'public/data/content-catalog.json'), JSON.stringify({ schemaVersion: 1, resources: [{ resourceId: 'hub.town', kind: 'hub', schemaVersion: 1, publicPath: 'data/hub/town.json' }] }, null, 2) + '\n');
  await writeFile(join(root, 'knowledge/index.md'), '# 资料\n');
  await git('git', ['init', '-q', root]);
  await git('git', ['-C', root, 'add', '-A']);
  await git('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline']);
  const options = { dataRoot, projects: [{ id: 'p', root }] };
  const content = createContentService(options);
  const workflow = createWorkflowService(options);
  const candidates = createGameCandidateService({ ...options, content, workflow, registerPreview });
  const adoptions = createGameAdoptionService({ ...options, workflow, previewEvidence: async () => {} });
  const close = async () => { await candidates.close(); await adoptions.close(); await Promise.allSettled([content.close(), workflow.close()]); await rm(directory, { recursive: true, force: true }); };
  return { directory, root, content, workflow, candidates, adoptions, close };
}

test('reports a saved candidate when preview delivery fails and reuses it on retry', async () => {
  let deliveryFails = true;
  const delivered: string[] = [];
  const f = await fixture(async candidate => {
    delivered.push(candidate.id);
    if (deliveryFails) throw Error('试玩便笺未配置');
  });
  try {
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog',
      entryPath: 'knowledge/fox.md', brief: '雾林遇狐',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null,
        content: scene('scene.fox', '狐爷爷', '老人站在药铺门前。') }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fog-story', label: '进入雾林' },
    };
    let failure: unknown;
    try { await f.candidates.stageStory(input); } catch (error) { failure = error; }
    const stored = await f.workflow.query({ projectId: 'p', op: 'gameCandidates' }) as { items: Array<{ id: string; commit: string }> };
    expect(stored.items).toHaveLength(1);
    expect(String(failure)).toContain(stored.items[0]!.id);
    expect(String(failure)).toContain(stored.items[0]!.commit);
    expect(String(failure)).toContain('已保存，但试玩登记失败：试玩便笺未配置');
    expect(String(failure)).toContain('新的请求标识重试');
    expect(delivered).toEqual([stored.items[0]!.id]);
    deliveryFails = false;
    const retry = await f.candidates.stageStory(input);
    expect(retry.reused).toBe(true);
    expect(retry.candidate.id).toBe(stored.items[0]!.id);
    expect(delivered).toEqual([stored.items[0]!.id, stored.items[0]!.id]);
    await expect(readFile(join(f.root, 'knowledge/fox.md'))).rejects.toThrow();
  } finally { await f.close(); }
}, 60_000);

test('a story is compiled and linked only in its exact candidate, then adopted and undone', async () => {
  const f = await fixture();
  try {
    const [media] = await f.content.command('registerCandidates', { projectId: 'p', candidates: [{ name: 'fog.png', mimeType: 'image/png',
      base64: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000002010001e221bc330000000049454e44ae426082', 'hex').toString('base64'), metadata: { provider: 'codex' } }] }) as Array<{ id: string }>;
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog', entryPath: 'knowledge/fox.md', brief: '雾林遇狐',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷', `老人站在药铺门前。\n\n## 选项\n\n- [询问药方](./forest.md) <!-- story-choice: {"id":"choice.ask-recipe","enabledWhen":{"kind":"knowledge","actorId":"player","knowledgeId":"fox.poisoned"},"effects":[{"kind":"once","eventId":"fox.promise","effects":[{"kind":"setQuestStage","questId":"quest.heal-fox","stage":"active"}]}]} -->`, 'backgroundAsset: assets/story/fog/entry.png\n') },
        { path: 'knowledge/forest.md', expectedRevision: null, content: scene('scene.forest', '雾林', '树林里传来沙沙声。') },
      ],
      assets: [{ candidateId: media!.id, path: 'public/assets/story/fog/entry.png' }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fog-story', label: '进入雾林' },
    };
    const first = await f.candidates.stageStory(input);
    expect(first.candidate.kind).toBe('story');
    expect(first.candidate).toMatchObject({ entryHubId: 'hub.town', entryActionId: 'action.fog-story' });
    expect(candidatePreviewOptions(first.candidate)).toMatchObject({
      storyId: 'story.fog', entryHubId: 'hub.town', entryActionId: 'action.fog-story',
    });
    expect(first.candidate.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(first.candidate.changedPaths).toEqual(expect.arrayContaining(['knowledge/fox.md', 'knowledge/forest.md', 'public/data/story/fog.json', 'public/data/content-catalog.json', 'public/data/hub/town.json', 'public/assets/story/fog/entry.png', 'public/assets/asset-manifest.json']));
    const graph = JSON.parse(await readFile(join(first.candidate.repo, 'public/data/story/fog.json'), 'utf8'));
    expect(graph.choices[0]).toMatchObject({ id: 'choice.ask-recipe', enabledWhen: { kind: 'knowledge', knowledgeId: 'fox.poisoned' } });
    expect(graph.nodes[0].backgroundAsset).toBe('assets/story/fog/entry.png');
    await expect(readFile(join(f.root, 'public/data/story/fog.json'))).rejects.toThrow();
    expect((await f.candidates.stageStory(input)).reused).toBe(true);
    const identity = { projectId: 'p', productionId: first.candidate.productionId, candidateId: first.candidate.id, featureId: 'fog-adventure', candidateHash: first.candidate.candidateHash, targetBaseRevision: first.candidate.targetBaseRevision, validationManifest: first.candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(adopted.adoptionId).toBeString();
    expect(JSON.parse(await readFile(join(f.root, 'public/data/story/fog.json'), 'utf8')).storyId).toBe('story.fog');
    expect(JSON.parse(await readFile(join(f.root, 'public/data/hub/town.json'), 'utf8')).locations[0].actions[0]).toMatchObject({ storyResourceId: 'story.fog', storyGraphFile: 'data/story/fog.json' });
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    await expect(readFile(join(f.root, 'public/data/story/fog.json'))).rejects.toThrow();
    expect(JSON.parse(await readFile(join(f.root, 'public/data/hub/town.json'), 'utf8')).locations[0].actions).toEqual([]);
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe('');
    const restaged = await f.candidates.stageStory(input);
    expect(restaged.reused).toBeUndefined();
    expect(restaged.candidate.id).not.toBe(first.candidate.id);
    expect((await f.candidates.stageStory(input)).candidate.id).toBe(restaged.candidate.id);
    const secondIdentity = { ...identity, candidateId: restaged.candidate.id, candidateHash: restaged.candidate.candidateHash,
      targetBaseRevision: restaged.candidate.targetBaseRevision, validationManifest: restaged.candidate.validationManifest };
    const secondAdoption = await f.adoptions.confirm(secondIdentity);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/story/fog.json'), 'utf8')).storyId).toBe('story.fog');
    await f.adoptions.undo({ ...secondIdentity, adoptionId: secondAdoption.adoptionId });
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe('');
    await expect(f.candidates.stageStory({ ...input, documents: [
      ...input.documents,
      { path: 'knowledge/unrelated.md', expectedRevision: null, content: scene('scene.unrelated', '无关场景', '不属于当前故事。') },
    ] })).rejects.toThrow('不属于本次可达场景');
  } finally { await f.close(); }
}, 90_000);

test('ordinary Markdown index and character notes follow the same story candidate through adoption and undo', async () => {
  const f = await fixture();
  try {
    const index = await f.content.query({ projectId: 'p', op: 'document', path: 'knowledge/index.md' }) as { revision: string; content: string };
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog-notes', entryPath: 'knowledge/fox.md', brief: '雾林资料与剧情',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '雾林', '老人指向林中。[查看狐爷爷资料](./people/fox.md)。') }],
      referenceDocuments: [
        { path: 'knowledge/index.md', expectedRevision: index.revision, content: '# 资料\n\n- [雾林](./fox.md)\n- [狐爷爷](./people/fox.md)\n' },
        { path: 'knowledge/people/fox.md', expectedRevision: null, content: '# 狐爷爷\n\n雾林中的医者。[返回目录](../index.md)。\n' },
      ],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fog-notes', label: '进入雾林' },
    };
    await expect(f.candidates.stageStory({ ...input, referenceDocuments: [{ ...input.referenceDocuments[0]!, expectedRevision: 'stale' }] })).rejects.toThrow('源文档已变化');
    await expect(f.candidates.stageStory({ ...input, referenceDocuments: [{ path: 'knowledge/people/fox.md', expectedRevision: null,
      content: scene('scene.hidden', '伪资料', '这其实是场景。') }] })).rejects.toThrow('不能包含 scene: true');
    await expect(f.candidates.stageStory({ ...input, referenceDocuments: [{ ...input.documents[0]! }] })).rejects.toThrow('路径、内容或大小无效');
    const candidate = (await f.candidates.stageStory(input)).candidate;
    expect(candidate.changedPaths).toEqual(expect.arrayContaining(['knowledge/fox.md', 'knowledge/index.md', 'knowledge/people/fox.md']));
    expect((candidate.dependencies ?? []).map(item => item.path)).toEqual(expect.arrayContaining(['knowledge/index.md', 'knowledge/people/fox.md']));
    const graph = JSON.parse(await readFile(join(candidate.repo, 'public/data/story/fog-notes.json'), 'utf8'));
    expect(graph.nodes).toHaveLength(1);
    const candidateContent = createContentService({ dataRoot: join(f.directory, 'candidate-index'), projects: [{ id: 'candidate', root: candidate.repo }] });
    try {
      const indexPage = await candidateContent.query({ projectId: 'candidate', op: 'document', path: 'knowledge/index.md' }) as { links: Array<{ targetPath: string; targetKind: string }> };
      expect(indexPage.links.map(link => link.targetPath)).toEqual(['knowledge/fox.md', 'knowledge/people/fox.md']);
      expect(indexPage.links.map(link => link.targetKind)).toEqual(['document', 'document']);
      const backlinks = await candidateContent.query({ projectId: 'candidate', op: 'backlinks', path: 'knowledge/people/fox.md' }) as { items: Array<{ sourcePath: string }> };
      expect(backlinks.items.map(item => item.sourcePath)).toEqual(['knowledge/fox.md', 'knowledge/index.md']);
    } finally { await candidateContent.close(); }
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toBe(index.content);
    await expect(readFile(join(f.root, 'knowledge/people/fox.md'))).rejects.toThrow();
    const identity = { projectId: 'p', productionId: candidate.productionId, candidateId: candidate.id,
      featureId: candidate.featureId, candidateHash: candidate.candidateHash,
      targetBaseRevision: candidate.targetBaseRevision, validationManifest: candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toContain('[狐爷爷](./people/fox.md)');
    expect(await readFile(join(f.root, 'knowledge/people/fox.md'), 'utf8')).toContain('[返回目录](../index.md)');
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toBe(index.content);
    await expect(readFile(join(f.root, 'knowledge/people/fox.md'))).rejects.toThrow();
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe('');
  } finally { await f.close(); }
}, 90_000);

test('ordinary Markdown documents can be staged, linked, adopted and undone without a story', async () => {
  const f = await fixture();
  try {
    const original = await f.content.query({ projectId: 'p', op: 'document', path: 'knowledge/index.md' }) as { revision: string; content: string };
    const input = { projectId: 'p', featureId: 'world-lore', brief: '补全人物资料', documents: [
      { path: 'knowledge/index.md', expectedRevision: original.revision, content: '# 资料\n\n- [狐爷爷](./people/fox.md)\n' },
      { path: 'knowledge/people/fox.md', expectedRevision: null, content: '# 狐爷爷\n\n[返回目录](../index.md)。\n' },
    ] };
    await expect(f.candidates.stageDocuments({ ...input, documents: [{ ...input.documents[0]!, expectedRevision: 'stale' }] })).rejects.toThrow('源文档已变化');
    await expect(f.candidates.stageDocuments({ ...input, documents: [{ ...input.documents[1]!, content: scene('scene.fox', '狐爷爷', '场景') }] })).rejects.toThrow('不能包含 scene: true');
    await expect(f.candidates.stageDocuments({ ...input, documents: [{ path: 'knowledge/index.md', expectedRevision: original.revision, content: original.content }] })).rejects.toThrow('没有文件变化');
    const candidate = (await f.candidates.stageDocuments(input)).candidate;
    expect(candidate.kind).toBe('documents');
    expect(candidate.changedPaths).toEqual(['knowledge/index.md', 'knowledge/people/fox.md']);
    expect((await f.candidates.stageDocuments(input)).reused).toBe(true);
    const candidateContent = createContentService({ dataRoot: join(f.directory, 'documents-index'), projects: [{ id: 'candidate', root: candidate.repo }] });
    try {
      const index = await candidateContent.query({ projectId: 'candidate', op: 'document', path: 'knowledge/index.md' }) as { links: Array<{ targetPath: string; targetKind: string }> };
      expect(index.links).toEqual([expect.objectContaining({ targetPath: 'knowledge/people/fox.md', targetKind: 'document' })]);
      const backlinks = await candidateContent.query({ projectId: 'candidate', op: 'backlinks', path: 'knowledge/people/fox.md' }) as { items: Array<{ sourcePath: string }> };
      expect(backlinks.items.map(item => item.sourcePath)).toEqual(['knowledge/index.md']);
    } finally { await candidateContent.close(); }
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toBe(original.content);
    await expect(readFile(join(f.root, 'knowledge/people/fox.md'))).rejects.toThrow();
    const identity = { projectId: 'p', productionId: candidate.productionId, candidateId: candidate.id,
      featureId: candidate.featureId, candidateHash: candidate.candidateHash,
      targetBaseRevision: candidate.targetBaseRevision, validationManifest: candidate.validationManifest };
    await writeFile(join(f.root, 'knowledge/index.md'), '# 资料\n\n外部修改。\n');
    await expect(f.adoptions.confirm(identity)).rejects.toThrow('内容或依赖已改变');
    await writeFile(join(f.root, 'knowledge/index.md'), original.content);
    const adopted = await f.adoptions.confirm(identity);
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toContain('[狐爷爷](./people/fox.md)');
    expect(await readFile(join(f.root, 'knowledge/people/fox.md'), 'utf8')).toContain('[返回目录](../index.md)');
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toBe(original.content);
    await expect(readFile(join(f.root, 'knowledge/people/fox.md'))).rejects.toThrow();
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe('');
  } finally { await f.close(); }
}, 90_000);

test('an existing playable story can stage a reference-only Markdown revision', async () => {
  const f = await fixture();
  try {
    const first = (await f.candidates.stageStory({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog', entryPath: 'knowledge/fox.md', brief: '雾林遇狐',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷', '老人站在药铺门前。') }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fog-story', label: '进入雾林' },
    })).candidate;
    const identity = (candidate: typeof first) => ({ projectId: 'p', productionId: candidate.productionId, candidateId: candidate.id,
      featureId: candidate.featureId, candidateHash: candidate.candidateHash,
      targetBaseRevision: candidate.targetBaseRevision, validationManifest: candidate.validationManifest });
    const firstAdoption = await f.adoptions.confirm(identity(first));
    const index = await f.content.query({ projectId: 'p', op: 'document', path: 'knowledge/index.md' }) as { revision: string; content: string };
    await expect(f.candidates.stageStory({ projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog',
      entryPath: 'knowledge/fox.md', brief: '空修改', documents: [] })).rejects.toThrow('需有 1–64 篇');
    const second = (await f.candidates.stageStory({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog', entryPath: 'knowledge/fox.md', brief: '补全人物资料目录',
      documents: [], referenceDocuments: [{ path: 'knowledge/index.md', expectedRevision: index.revision,
        content: '# 资料\n\n[雾林的狐爷爷](./fox.md)\n' }],
    })).candidate;
    expect(second.changedPaths).toEqual(['knowledge/index.md']);
    expect(second).toMatchObject({ entryHubId: 'hub.town', entryActionId: 'action.fog-story' });
    expect(second.dependencies.map(item => item.path)).toContain('public/data/hub/town.json');
    const secondAdoption = await f.adoptions.confirm(identity(second));
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toContain('[雾林的狐爷爷](./fox.md)');
    await f.adoptions.undo({ ...identity(second), adoptionId: secondAdoption.adoptionId });
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toBe(index.content);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/story/fog.json'), 'utf8')).storyId).toBe('story.fog');
    await f.adoptions.undo({ ...identity(first), adoptionId: firstAdoption.adoptionId });
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe('');
  } finally { await f.close(); }
}, 90_000);

test('player-facing Hub and world-map copy stays in the story candidate and rolls back with it', async () => {
  const f = await fixture();
  try {
    const hubPath = 'public/data/hub/town.json';
    const mapPath = 'public/data/world/world-map.json';
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    const hub = { hubId: 'hub.town', title: '小镇', description: '这里是开发说明。', defaultLocationId: 'location.town',
      locations: [{ id: 'location.town', title: '镇口', summary: '旧摘要', detail: '旧详情', actions: [
        { id: 'action.old', kind: 'navigate', label: '旧行动', description: '旧行动说明', targetLocationId: 'location.town', statusText: '旧状态' },
      ] }] };
    const map = { id: 'worldmap.qa', title: '青云山麓', description: '旧地图说明', destinations: [
      { id: 'destination.town', kind: 'hub', label: '小镇', description: '旧目的地说明', statusText: '旧路由状态' },
    ] };
    const originalHub = JSON.stringify(hub, null, 2) + '\n';
    const originalMap = JSON.stringify(map, null, 2) + '\n';
    await writeFile(join(f.root, hubPath), originalHub);
    await writeFile(join(f.root, mapPath), originalMap);
    await git('git', ['-C', f.root, 'add', '-A']);
    await git('git', ['-C', f.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'copy baseline']);
    const revision = (value: string) => createHash('sha256').update(value).digest('hex');
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog-copy', entryPath: 'knowledge/fox.md', brief: '雾林遇狐',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷', '老人站在药铺门前。') }],
      launch: { hubPath, locationId: 'location.town', actionId: 'action.fog-story', label: '进入雾林' },
      copyEdits: [
        { path: hubPath, expectedRevision: revision(originalHub), edits: [
          { targetId: 'hub.town', field: 'description' as const, value: '山脚小镇里，散修正等待试炼。' },
          { targetId: 'location.town', field: 'detail' as const, value: '镇口茶香四溢，远处山门隐在云里。' },
          { targetId: 'action.old', field: 'description' as const, value: '到茶棚听听今日的消息。' },
        ] },
        { path: mapPath, expectedRevision: revision(originalMap), edits: [
          { targetId: 'worldmap.qa', field: 'description' as const, value: '山风吹过青云山麓。' },
          { targetId: 'destination.town', field: 'description' as const, value: '先去山脚小镇歇脚。' },
        ] },
      ],
    };
    await expect(f.candidates.stageStory({ ...input, copyEdits: [{ ...input.copyEdits[0]!, expectedRevision: '0'.repeat(64) }] })).rejects.toThrow('源文件已变化');
    await expect(f.candidates.stageStory({ ...input, copyEdits: [{ ...input.copyEdits[0]!, edits: [
      { targetId: 'hub.town', field: 'detail' as const, value: '不允许改根详情' },
    ] }] })).rejects.toThrow('不可修改');
    const candidate = (await f.candidates.stageStory(input)).candidate;
    expect(candidate.copyPaths).toEqual([hubPath, mapPath]);
    expect(candidate.changedPaths).toEqual(expect.arrayContaining([hubPath, mapPath]));
    expect(await readFile(join(f.root, hubPath), 'utf8')).toBe(originalHub);
    expect(await readFile(join(f.root, mapPath), 'utf8')).toBe(originalMap);
    const stagedHub = JSON.parse(await readFile(join(candidate.repo, hubPath), 'utf8'));
    const stagedMap = JSON.parse(await readFile(join(candidate.repo, mapPath), 'utf8'));
    expect(stagedHub.description).toBe('山脚小镇里，散修正等待试炼。');
    expect(stagedHub.locations[0].actions.map((action: { id: string }) => action.id)).toEqual(['action.old', 'action.fog-story']);
    expect(stagedMap.destinations[0].description).toBe('先去山脚小镇歇脚。');
    const identity = { projectId: 'p', productionId: candidate.productionId, candidateId: candidate.id,
      featureId: candidate.featureId, candidateHash: candidate.candidateHash,
      targetBaseRevision: candidate.targetBaseRevision, validationManifest: candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(JSON.parse(await readFile(join(f.root, mapPath), 'utf8')).description).toBe('山风吹过青云山麓。');
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(join(f.root, hubPath), 'utf8')).toBe(originalHub);
    expect(await readFile(join(f.root, mapPath), 'utf8')).toBe(originalMap);
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe('');
  } finally { await f.close(); }
}, 90_000);

test('story adoption rejects an edited dependency and preserves the registered project', async () => {
  const f = await fixture();
  try {
    const staged = await f.candidates.stageStory({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog', entryPath: 'knowledge/fox.md', brief: '雾林遇狐',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷', '老人站在药铺门前。') }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fog-story', label: '进入雾林' },
    });
    const catalogPath = join(f.root, 'public/data/content-catalog.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    catalog.resources.push({ resourceId: 'other', kind: 'story', schemaVersion: 1, publicPath: 'data/story/other.json' });
    await writeFile(catalogPath, JSON.stringify(catalog));
    const c = staged.candidate;
    await expect(f.adoptions.confirm({ projectId: 'p', productionId: c.productionId, candidateId: c.id, featureId: c.featureId, candidateHash: c.candidateHash, targetBaseRevision: c.targetBaseRevision, validationManifest: c.validationManifest })).rejects.toThrow('已改变');
    expect(JSON.parse(await readFile(catalogPath, 'utf8')).resources).toHaveLength(2);
    await expect(readFile(join(f.root, 'knowledge/fox.md'))).rejects.toThrow();
  } finally { await f.close(); }
}, 30_000);

test('unrelated knowledge edits do not invalidate a pinned story candidate', async () => {
  const f = await fixture();
  try {
    const candidate = (await f.candidates.stageStory({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog', entryPath: 'knowledge/fox.md', brief: '雾林遇狐',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷', '老人站在药铺门前。') }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fog-story', label: '进入雾林' },
    })).candidate;
    await writeFile(join(f.root, 'knowledge/index.md'), '# 资料\n\n另一篇无关笔记。\n');
    const identity = { projectId: 'p', productionId: candidate.productionId, candidateId: candidate.id,
      featureId: candidate.featureId, candidateHash: candidate.candidateHash,
      targetBaseRevision: candidate.targetBaseRevision, validationManifest: candidate.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(adopted.adoptionId).toBeString();
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toContain('另一篇无关笔记');
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(join(f.root, 'knowledge/index.md'), 'utf8')).toContain('另一篇无关笔记');
  } finally { await f.close(); }
}, 30_000);

test('runtime source changes invalidate adoption and produce a distinct playable candidate', async () => {
  const f = await fixture();
  try {
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fog', entryPath: 'knowledge/fox.md', brief: '雾林遇狐',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷', '老人站在药铺门前。') }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fog-story', label: '进入雾林' },
    };
    const first = (await f.candidates.stageStory(input)).candidate;
    await mkdir(join(f.root, 'src/game'), { recursive: true });
    await writeFile(join(f.root, 'src/game/runtime.ts'), 'export const version = 2;\n');
    await expect(f.adoptions.confirm({ projectId: 'p', productionId: first.productionId, candidateId: first.id,
      featureId: first.featureId, candidateHash: first.candidateHash, targetBaseRevision: first.targetBaseRevision,
      validationManifest: first.validationManifest })).rejects.toThrow('游戏源码已改变');
    const second = (await f.candidates.stageStory(input)).candidate;
    expect(second.id).not.toBe(first.id);
    expect(second.sourceSnapshotTree).not.toBe(first.sourceSnapshotTree);
    expect(await readFile(join(second.repo, 'src/game/runtime.ts'), 'utf8')).toBe('export const version = 2;\n');
  } finally { await f.close(); }
}, 30_000);

test('a story card reward requires shared facts and an existing card, with the card catalog pinned as a dependency', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/cards'), { recursive: true });
    await writeFile(join(f.root, 'public/data/cards/units.json'), JSON.stringify({ units: [{ id: 'CR_001' }] }));
    const entry = (cardId: string, shared: boolean) => scene('scene.fox', '狐爷爷', `老人递来一张灵狐卡。\n\n## 选项\n\n- [接过卡牌](./end.md) <!-- story-choice: {"id":"choice.fox.card","effects":[{"kind":"grantCard","grantId":"quest.fox.card","cardId":"${cardId}","count":1}]} -->`,
      shared ? 'shareFactsAcrossStories: true\n' : '');
    const input = (cardId: string, shared: boolean) => ({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fox-reward', entryPath: 'knowledge/fox.md', brief: '狐爷爷奖励卡牌',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: entry(cardId, shared) },
        { path: 'knowledge/end.md', expectedRevision: null, content: scene('scene.end', '结束', '你收好了灵狐卡。') },
      ],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fox-reward', label: '领取卡牌' },
    });
    await expect(f.candidates.stageStory(input('CR_001', false))).rejects.toThrow('shareFactsAcrossStories');
    await expect(f.candidates.stageStory(input('UNKNOWN', true))).rejects.toThrow('不存在的卡牌');
    const staged = await f.candidates.stageStory(input('CR_001', true));
    expect(staged.candidate.dependencies.some(item => item.path === 'public/data/cards/units.json')).toBe(true);
    expect(staged.candidate.changedPaths).not.toContain('public/data/cards/units.json');
    const graph = JSON.parse(await readFile(join(staged.candidate.repo, 'public/data/story/fox-reward.json'), 'utf8'));
    expect(graph.choices[0].effects).toEqual([{ kind: 'grantCard', grantId: 'quest.fox.card', cardId: 'CR_001', count: 1 }]);
  } finally { await f.close(); }
}, 30_000);

test('dialogue speakers resolve to the candidate NPC catalog and adopt with the story', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    await writeFile(join(f.root, 'public/data/world/npcs.json'), JSON.stringify({ npcs: [{ id: 'npc.elder', name: '长老' }] }));
    const initialStatus = (await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim();
    const [media] = await f.content.command('registerCandidates', { projectId: 'p', candidates: [{ name: 'fox.png', mimeType: 'image/png',
      base64: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000002010001e221bc330000000049454e44ae426082', 'hex').toString('base64') }] }) as Array<{ id: string }>;
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fox-dialogue', entryPath: 'knowledge/fox.md', brief: '狐爷爷对白',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷',
        '石桥上有雾。\n\n## 对话\n\n- 狐爷爷：雾里有人。 <!-- story-line: {"id":"dlg.fox.001","speakerId":"npc.fox"} -->') }],
      assets: [{ candidateId: media!.id, path: 'public/assets/story/fog/fox.png' }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fox-dialogue', label: '听灵狐说话' },
    };
    await expect(f.candidates.stageStory(input)).rejects.toThrow('不存在的人物');
    await expect(f.candidates.stageStory({ ...input, npcs: [{ id: 'npc.fox', name: '狐爷爷', portraitAsset: '../fox.png' }] })).rejects.toThrow('新增人物定义无效');
    const staged = (await f.candidates.stageStory({ ...input, npcs: [{ id: 'npc.fox', name: '狐爷爷',
      description: '雾林药师，担心旧药方失落。', goal: '救治病人', abilities: { 医术: 8 },
      portraitAsset: 'assets/story/fog/fox.png' }] })).candidate;
    expect(staged.changedPaths).toContain('public/data/world/npcs.json');
    expect(staged.changedPaths).toContain('public/assets/story/fog/fox.png');
    expect(staged.portraitPaths).toEqual(['public/assets/story/fog/fox.png']);
    expect(staged.dependencies.some(item => item.path === 'public/data/world/npcs.json')).toBe(true);
    expect(staged.dependencies.some(item => item.path === 'public/assets/story/fog/fox.png')).toBe(true);
    expect(JSON.parse(await readFile(join(staged.repo, 'public/data/world/npcs.json'), 'utf8')).npcs[1].portraitAsset).toBe('assets/story/fog/fox.png');
    expect(JSON.parse(await readFile(join(f.root, 'public/data/world/npcs.json'), 'utf8')).npcs).toHaveLength(1);
    const identity = { projectId: 'p', productionId: staged.productionId, candidateId: staged.id,
      featureId: staged.featureId, candidateHash: staged.candidateHash, targetBaseRevision: staged.targetBaseRevision,
      validationManifest: staged.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(JSON.parse(await readFile(join(f.root, 'public/data/world/npcs.json'), 'utf8')).npcs).toHaveLength(2);
    expect(await readFile(join(f.root, 'public/assets/story/fog/fox.png'))).toEqual(await readFile(join(staged.repo, 'public/assets/story/fog/fox.png')));
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    await expect(readFile(join(f.root, 'public/assets/story/fog/fox.png'))).rejects.toThrow();
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe(initialStatus);
  } finally { await f.close(); }
}, 30_000);

test('an item icon stays in the playable candidate and its exact adoption closure', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    await writeFile(join(f.root, 'public/data/world/items.artifacts.json'), '{"artifacts":[],"tools":[],"consumables":[]}');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000002010001e221bc330000000049454e44ae426082', 'hex');
    const [media] = await f.content.command('registerCandidates', { projectId: 'p', candidates: [{ name: 'herb.png', mimeType: 'image/png', base64: png.toString('base64') }] }) as Array<{ id: string }>;
    const item = { id: 'consumable.white-leaf-herb', name: '白叶草', itemType: 'consumable' as const,
      iconAsset: 'assets/items/herbs/white-leaf-v1.png' };
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.herb-icon', entryPath: 'knowledge/fox.md', brief: '白叶草道具图标',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '草药',
          '石桥边有白叶草。\n\n## 选项\n\n- [拾起白叶草](./end.md) <!-- story-choice: {"id":"choice.herb.take","effects":[{"kind":"once","eventId":"event.herb.take","effects":[{"kind":"grantItem","transactionId":"item.herb.take","itemId":"consumable.white-leaf-herb","itemType":"consumable","count":1}]}]} -->',
          'shareFactsAcrossStories: true\n') },
        { path: 'knowledge/end.md', expectedRevision: null, content: scene('scene.end', '结束', '你收好药草。') },
      ],
      items: [item], assets: [{ candidateId: media!.id, path: 'public/assets/items/herbs/white-leaf-v1.png' }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.herb-icon', label: '采集白叶草' },
    };
    await expect(f.candidates.stageStory({ ...input, items: [{ ...item, iconAsset: '../herb.png' }] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, assets: [] })).rejects.toThrow('道具图标不存在');
    const before = (await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim();
    const staged = (await f.candidates.stageStory(input)).candidate;
    expect(staged.itemIconPaths).toEqual(['public/assets/items/herbs/white-leaf-v1.png']);
    expect(staged.changedPaths).toEqual(expect.arrayContaining(['public/data/world/items.artifacts.json', 'public/assets/items/herbs/white-leaf-v1.png']));
    expect((staged.dependencies ?? []).map(dep => dep.path)).toContain('public/assets/items/herbs/white-leaf-v1.png');
    expect(await readFile(join(staged.repo, 'public/assets/items/herbs/white-leaf-v1.png'))).toEqual(png);
    expect(JSON.parse(await readFile(join(staged.repo, 'public/data/world/items.artifacts.json'), 'utf8')).consumables.at(-1).iconAsset).toBe(item.iconAsset);
    await expect(readFile(join(f.root, 'public/assets/items/herbs/white-leaf-v1.png'))).rejects.toThrow();
    const identity = { projectId: 'p', productionId: staged.productionId, candidateId: staged.id,
      featureId: staged.featureId, candidateHash: staged.candidateHash, targetBaseRevision: staged.targetBaseRevision,
      validationManifest: staged.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(await readFile(join(f.root, 'public/assets/items/herbs/white-leaf-v1.png'))).toEqual(png);
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    await expect(readFile(join(f.root, 'public/assets/items/herbs/white-leaf-v1.png'))).rejects.toThrow();
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe(before);
  } finally { await f.close(); }
}, 60_000);

test('an NPC ability gate compiles only when the candidate catalog defines that ability', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    await writeFile(join(f.root, 'public/data/world/npcs.json'), JSON.stringify({ npcs: [] }));
    const entry = (ability: string) => scene('scene.fox', '狐爷爷',
      `石桥上有雾。\n\n## 对话\n\n- 狐爷爷：让我看看伤口。 <!-- story-line: {"id":"dlg.fox.001","speakerId":"npc.fox"} -->\n\n## 选项\n\n- [请狐爷爷救治](./end.md) <!-- story-choice: {"id":"choice.fox.heal","enabledWhen":{"kind":"actorAbility","actorId":"npc.fox","ability":"${ability}","operator":">=","value":7}} -->`);
    const input = (ability: string) => ({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fox-heal', entryPath: 'knowledge/fox.md', brief: '医术影响救治',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: entry(ability) },
        { path: 'knowledge/end.md', expectedRevision: null, content: scene('scene.end', '救治', '狐爷爷开始施针。') },
      ],
      npcs: [{ id: 'npc.fox', name: '狐爷爷', abilities: { 医术: 8 } }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fox-heal', label: '寻求救治' },
    });
    await expect(f.candidates.stageStory(input('潜行'))).rejects.toThrow('不存在的人物能力');
    const staged = (await f.candidates.stageStory(input('医术'))).candidate;
    expect(staged.dependencies.some(item => item.path === 'public/data/world/npcs.json')).toBe(true);
    const graph = JSON.parse(await readFile(join(staged.repo, 'public/data/story/fox-heal.json'), 'utf8'));
    expect(graph.choices[0].enabledWhen).toEqual({ kind: 'actorAbility', actorId: 'npc.fox', ability: '医术', operator: '>=', value: 7 });
  } finally { await f.close(); }
}, 30_000);

test('a playable quest definition follows story stages and adopts with its exact catalog', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    await writeFile(join(f.root, 'public/data/world/npcs.json'), JSON.stringify({ npcs: [{ id: 'npc.fox', name: '狐爷爷' }] }));
    const questPath = join(f.root, 'public/data/world/quests.json');
    await writeFile(questPath, JSON.stringify({ schemaVersion: 1, quests: [] }));
    const before = await readFile(questPath);
    const initialStatus = (await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout;
    const quest = { id: 'quest.heal-fox', title: '救助狐爷爷', summary: '寻找救治办法。', actorIds: ['npc.fox'], stages: [
      { id: 'available', status: 'available' as const, label: '委托出现', objective: '问清狐爷爷的伤势。' },
      { id: 'active', status: 'active' as const, label: '寻找药材', objective: '进入雾林寻找药材。' },
    ] };
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fox-quest', entryPath: 'knowledge/fox.md', brief: '救助狐爷爷任务',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '狐爷爷',
          '狐爷爷扶着门框。\n\n## 对话\n\n- 狐爷爷：帮我找一味草药。 <!-- story-line: {"id":"line.fox.001","speakerId":"npc.fox"} -->\n\n## 选项\n\n- [答应采药](./forest.md) <!-- story-choice: {"id":"choice.fox.accept","enabledWhen":{"kind":"questStage","questId":"quest.heal-fox","stage":"available"},"effects":[{"kind":"setQuestStage","questId":"quest.heal-fox","stage":"active"}]} -->',
          'shareFactsAcrossStories: true\ninitialState: {"questStages":{"quest.heal-fox":"available"}}\n') },
        { path: 'knowledge/forest.md', expectedRevision: null, content: scene('scene.forest', '雾林', '开始寻找药材。') },
      ],
      quests: [quest],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fox-quest', label: '帮狐爷爷采药' },
    };
    await expect(f.candidates.stageStory({ ...input, documents: [
      { ...input.documents[0]!, content: input.documents[0]!.content.replace('shareFactsAcrossStories: true\n', '') },
      input.documents[1]!,
    ] })).rejects.toThrow('剧情任务必须启用 shareFactsAcrossStories');
    const staged = (await f.candidates.stageStory(input)).candidate;
    expect(staged.questIds).toEqual(['quest.heal-fox']);
    expect(staged.changedPaths).toContain('public/data/world/quests.json');
    expect(staged.dependencies.map(item => item.path)).toContain('public/data/world/npcs.json');
    expect(JSON.parse(await readFile(join(staged.repo, 'public/data/world/quests.json'), 'utf8')).quests[0]).toMatchObject(quest);
    const identity = { projectId: 'p', productionId: staged.productionId, candidateId: staged.id,
      featureId: staged.featureId, candidateHash: staged.candidateHash,
      targetBaseRevision: staged.targetBaseRevision, validationManifest: staged.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(JSON.parse(await readFile(questPath, 'utf8')).quests[0].title).toBe('救助狐爷爷');
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(questPath)).toEqual(before);
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout).toBe(initialStatus);
    await expect(f.candidates.stageStory({ ...input, quests: [{ ...quest, stages: quest.stages.slice(0, 1) }] }))
      .rejects.toThrow('不存在的任务或阶段');
  } finally { await f.close(); }
}, 90_000);

test('story item gates and consumption pin the real item catalog', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    await writeFile(join(f.root, 'public/data/world/items.artifacts.json'), JSON.stringify({
      artifacts: [], tools: [{ id: 'tool.return-rope', name: '归返绳' }],
      consumables: [{ id: 'consumable.spirit-salve', name: '凝气膏' }],
    }));
    const entry = (itemId: string, shared: boolean) => scene('scene.fox', '雾林救治',
      `灵狐需要凝气膏。\n\n## 选项\n\n- [用药膏救治](./end.md) <!-- story-choice: {"id":"choice.fox.treat","enabledWhen":{"kind":"all","conditions":[{"kind":"itemCount","itemId":"tool.return-rope","operator":">=","value":1},{"kind":"itemCount","itemId":"${itemId}","operator":">=","value":1}]},"effects":[{"kind":"once","eventId":"quest.fox.treat","effects":[{"kind":"consumeItem","transactionId":"quest.fox.salve","itemId":"consumable.spirit-salve","itemType":"consumable","count":1},{"kind":"setQuestStage","questId":"quest.fox","stage":"completed"}]}]} -->`,
      shared ? 'shareFactsAcrossStories: true\n' : '');
    const input = (itemId: string, shared: boolean) => ({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fox-items', entryPath: 'knowledge/fox.md', brief: '雾林真实道具条件',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: entry(itemId, shared) },
        { path: 'knowledge/end.md', expectedRevision: null, content: scene('scene.end', '完成', '灵狐恢复了。') },
      ],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fox-items', label: '救治灵狐' },
    });
    await expect(f.candidates.stageStory(input('consumable.spirit-salve', false))).rejects.toThrow('shareFactsAcrossStories');
    await expect(f.candidates.stageStory(input('consumable.missing', true))).rejects.toThrow('不存在的道具');
    const staged = (await f.candidates.stageStory(input('consumable.spirit-salve', true))).candidate;
    expect(staged.dependencies.some(item => item.path === 'public/data/world/items.artifacts.json')).toBe(true);
    expect(staged.changedPaths).not.toContain('public/data/world/items.artifacts.json');
    const graph = JSON.parse(await readFile(join(staged.repo, 'public/data/story/fox-items.json'), 'utf8'));
    expect(graph.choices[0].enabledWhen.conditions[1]).toMatchObject({ kind: 'itemCount', itemId: 'consumable.spirit-salve' });
    expect(graph.choices[0].effects[0].effects[0]).toMatchObject({ kind: 'consumeItem', transactionId: 'quest.fox.salve' });
  } finally { await f.close(); }
}, 30_000);

test('story battle pins registered encounter and deck files as read-only dependencies', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/encounters'), { recursive: true });
    await mkdir(join(f.root, 'public/data/decks'), { recursive: true });
    await writeFile(join(f.root, 'public/data/encounters/fox.json'), JSON.stringify({ id: 'encounter.fox', enemies: [] }));
    await writeFile(join(f.root, 'public/data/decks/starter.json'), JSON.stringify({ id: 'deck.starter', cards: [] }));
    const catalogPath = join(f.root, 'public/data/content-catalog.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    catalog.resources.push({ resourceId: 'encounter.fox', kind: 'encounter', publicPath: 'data/encounters/fox.json' },
      { resourceId: 'deck.starter', kind: 'deck', publicPath: 'data/decks/starter.json' });
    await writeFile(catalogPath, JSON.stringify(catalog));
    const battle = {
      battleId: 'battle.fox', encounterResourceId: 'encounter.fox', encounterId: 'encounter.fox', encounterFile: 'data/encounters/fox.json',
      deckResourceId: 'deck.starter', deckFile: 'data/decks/starter.json', onVictoryNodeId: 'scene.win', onDefeatNodeId: 'scene.lose',
    };
    const input = (trigger: typeof battle) => ({
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fox-battle', entryPath: 'knowledge/fox.md', brief: '雾林遭遇',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '桥上雾影',
          `雾影逼近。\n\n## 选项\n\n- [迎战雾影](./pending.md) <!-- story-choice: ${JSON.stringify({ id: 'choice.fight', effects: [{ kind: 'startBattle', battle: trigger }] })} -->`) },
        { path: 'knowledge/pending.md', expectedRevision: null, content: scene('scene.pending', '交战',
          '胜负将改变接下来的路。\n\n## 选项\n\n- [胜利](./win.md)\n- [失败](./lose.md)') },
        { path: 'knowledge/win.md', expectedRevision: null, content: scene('scene.win', '胜利', '雾影退去。') },
        { path: 'knowledge/lose.md', expectedRevision: null, content: scene('scene.lose', '失利', '你退回桥边。') },
      ],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fox-battle', label: '迎战雾影' },
    });
    await expect(f.candidates.stageStory(input({ ...battle, encounterResourceId: 'missing' }))).rejects.toThrow('未登记的遭遇');
    await expect(f.candidates.stageStory(input({ ...battle, encounterId: 'other' }))).rejects.toThrow('遭遇 ID 不一致');
    const staged = (await f.candidates.stageStory(input(battle))).candidate;
    expect(staged.dependencies.map(item => item.path)).toEqual(expect.arrayContaining([
      'public/data/encounters/fox.json', 'public/data/decks/starter.json',
    ]));
    expect(staged.changedPaths).not.toContain('public/data/encounters/fox.json');
    expect(staged.changedPaths).not.toContain('public/data/decks/starter.json');
    const graph = JSON.parse(await readFile(join(staged.repo, 'public/data/story/fox-battle.json'), 'utf8'));
    expect(graph.choices.find((choice: { id: string }) => choice.id === 'choice.fight').effects[0].battle).toMatchObject(battle);
  } finally { await f.close(); }
}, 30_000);

test('new story tools and herbs stay in the candidate until adoption and undo together', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    const catalogPath = join(f.root, 'public/data/world/items.artifacts.json');
    const originalCatalog = JSON.stringify({ artifacts: [], tools: [], consumables: [] }, null, 2) + '\n';
    await writeFile(catalogPath, originalCatalog);
    const initialStatus = (await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim();
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.fox-herbs', entryPath: 'knowledge/fox.md', brief: '银针和白叶草救治',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '药铺',
          '狐爷爷把银针和白叶草交给你。\n\n## 选项\n\n- [接过道具](./bridge.md) <!-- story-choice: {"id":"choice.fox.take-items","effects":[{"kind":"once","eventId":"quest.fox.take-items","effects":[{"kind":"grantItem","transactionId":"quest.fox.needle","itemId":"tool.fox-silver-needle","itemType":"tool","count":1},{"kind":"grantItem","transactionId":"quest.fox.herb","itemId":"consumable.white-leaf-herb","itemType":"consumable","count":2}]}]} -->',
          'shareFactsAcrossStories: true\n') },
        { path: 'knowledge/bridge.md', expectedRevision: null, content: scene('scene.bridge', '石桥',
          '桥边有人受伤。\n\n## 选项\n\n- [用银针和白叶草救人](./end.md) <!-- story-choice: {"id":"choice.fox.heal","enabledWhen":{"kind":"all","conditions":[{"kind":"itemCount","itemId":"tool.fox-silver-needle","operator":">=","value":1},{"kind":"itemCount","itemId":"consumable.white-leaf-herb","operator":">=","value":1}]},"effects":[{"kind":"once","eventId":"quest.fox.heal","effects":[{"kind":"consumeItem","transactionId":"quest.fox.healing-herb","itemId":"consumable.white-leaf-herb","itemType":"consumable","count":1}]}]} -->') },
        { path: 'knowledge/end.md', expectedRevision: null, content: scene('scene.end', '救治', '病人慢慢恢复了。') },
      ],
      items: [
        { id: 'tool.fox-silver-needle', name: '银针', itemType: 'tool' as const, type: '救治工具', description: '检查时不消耗。', droppable: false,
          equipSlot: 'medical', attributeModifiers: { 心性: 2 } },
        { id: 'consumable.white-leaf-herb', name: '白叶草', itemType: 'consumable' as const, type: '药草', droppable: true,
          useEffect: { kind: 'heal' as const, amount: 25 } },
      ],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.fox-herbs', label: '前往药铺' },
    };
    await expect(f.candidates.stageStory({ ...input, items: [input.items[0]!, input.items[0]!] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, items: [{ ...input.items[0]!, droppable: 'yes' as unknown as boolean }, input.items[1]!] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, items: [{ ...input.items[0]!, equipSlot: 'bad slot' }, input.items[1]!] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, items: [{ ...input.items[0]!, equipSlot: '__proto__' }, input.items[1]!] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, items: [{ ...input.items[0]!, attributeModifiers: { 心性: Infinity } }, input.items[1]!] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, items: [input.items[0]!, { ...input.items[1]!, useEffect: { kind: 'heal' as const, amount: 0 } }] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, items: [{ ...input.items[0]!, useEffect: { kind: 'heal' as const, amount: 25 } }, input.items[1]!] })).rejects.toThrow('新增道具定义无效');
    await expect(f.candidates.stageStory({ ...input, items: [...input.items, { id: 'tool.unused', name: '闲置工具', itemType: 'tool' as const }] })).rejects.toThrow('新增道具未被当前剧情引用');
    await expect(f.candidates.stageStory({ ...input,
      items: [...input.items, { id: 'tool.unavailable', name: '无法获得的工具', itemType: 'tool' as const }],
      documents: input.documents.map(doc => doc.path === 'knowledge/bridge.md' ? { ...doc,
        content: doc.content.replace('"itemId":"tool.fox-silver-needle","operator"', '"itemId":"tool.unavailable","operator"') } : doc),
    })).rejects.toThrow('新增道具没有当前剧情中的获得途径');
    const staged = (await f.candidates.stageStory(input)).candidate;
    expect(staged.itemUseIds).toEqual(['consumable.white-leaf-herb']);
    expect(staged.changedPaths).toContain('public/data/world/items.artifacts.json');
    expect(staged.dependencies.some(item => item.path === 'public/data/world/items.artifacts.json')).toBe(true);
    expect(await readFile(catalogPath, 'utf8')).toBe(originalCatalog);
    const catalog = JSON.parse(await readFile(join(staged.repo, 'public/data/world/items.artifacts.json'), 'utf8'));
    expect(catalog.tools[0]).toMatchObject({ id: 'tool.fox-silver-needle', name: '银针', droppable: false,
      equipSlot: 'medical', attributeModifiers: { 心性: 2 } });
    expect(catalog.consumables[0]).toMatchObject({ id: 'consumable.white-leaf-herb', name: '白叶草', droppable: true,
      useEffect: { kind: 'heal', amount: 25 } });
    const identity = { projectId: 'p', productionId: staged.productionId, candidateId: staged.id,
      featureId: staged.featureId, candidateHash: staged.candidateHash, targetBaseRevision: staged.targetBaseRevision,
      validationManifest: staged.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(JSON.parse(await readFile(catalogPath, 'utf8')).tools[0]).toMatchObject({ name: '银针',
      equipSlot: 'medical', attributeModifiers: { 心性: 2 } });
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(catalogPath, 'utf8')).toBe(originalCatalog);
    expect((await git('git', ['-C', f.root, 'status', '--porcelain'])).stdout.trim()).toBe(initialStatus);
  } finally { await f.close(); }
}, 90_000);

test('story shop exchange stays in the exact candidate and adoption restores the original shop bytes', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/mijing'), { recursive: true });
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    const catalogPath = join(f.root, 'public/data/content-catalog.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    catalog.resources.push(
      { resourceId: 'phase01-prototype-shop', kind: 'expeditionShop', schemaVersion: 1, publicPath: 'data/mijing/prototype-shop.json' },
      { resourceId: 'phase01-prototype-map', kind: 'expeditionMap', schemaVersion: 1, publicPath: 'data/mijing/prototype-map.json' },
    );
    await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
    const shopPath = join(f.root, 'public/data/mijing/prototype-shop.json');
    const originalShop = JSON.stringify({ id: 'phase01-prototype-shop', shopsByNodeId: {
      'shop.wandering-peddler': { nodeId: 'shop.wandering-peddler', title: '云游小贩', description: '山道商人', offers: [] },
    } }, null, 2) + '\n';
    await writeFile(shopPath, originalShop);
    await writeFile(join(f.root, 'public/data/mijing/prototype-map.json'), JSON.stringify({
      id: 'phase01-prototype-map', name: '外山试炼', entryNodeId: 'entrance.mountain-gate', nodes: [
        { id: 'entrance.mountain-gate', type: 'entrance', outgoingNodeIds: ['shop.wandering-peddler'], payloadRef: { kind: 'entrance', ref: 'stash' } },
        { id: 'shop.wandering-peddler', type: 'shop', outgoingNodeIds: [], payloadRef: { kind: 'shop', ref: 'shop.wandering-peddler', contentFile: 'data/mijing/prototype-shop.json' } },
      ],
    }, null, 2) + '\n');
    await writeFile(join(f.root, 'public/data/world/items.artifacts.json'), JSON.stringify({
      artifacts: [{ id: 'artifact_fly_sword_basic', name: '青云飞剑' }],
      consumables: [{ id: 'consumable.spirit-salve', name: '凝气膏' }],
    }, null, 2) + '\n');
    const offer = {
      id: 'offer.qa.material-exchange', label: '凝气膏换飞剑', description: '交出一份凝气膏，换一件飞剑挂坠。',
      cost: { spiritStones: 0, items: [{ id: 'consumable.spirit-salve', itemType: 'consumable' as const, count: 1 }] },
      rewards: { cards: [], items: [{ id: 'artifact_fly_sword_basic', itemType: 'artifact' as const, count: 1 }], spiritStones: 0 },
    };
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.shop-exchange', entryPath: 'knowledge/fox.md', brief: '雾林以药换剑',
      documents: [{ path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '山道小贩', '小贩在山道等待。') }],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.shop-exchange', label: '前往山道' },
      shops: [{ resourceId: 'phase01-prototype-shop', nodeId: 'shop.wandering-peddler', offers: [offer] }],
    };
    await expect(f.candidates.stageStory({ ...input, shops: [{ ...input.shops[0]!, offers: [{ ...offer,
      cost: { ...offer.cost, items: [{ ...offer.cost.items[0]!, count: -1 }] } }] }] })).rejects.toThrow('商店报价定义无效');
    await expect(f.candidates.stageStory({ ...input, shops: [{ ...input.shops[0]!, offers: [{ ...offer,
      cost: { ...offer.cost, items: [{ ...offer.cost.items[0]!, id: 'consumable.missing' }] } }] }] })).rejects.toThrow('不存在或类型不符的道具');
    const staged = (await f.candidates.stageStory(input)).candidate;
    expect(staged.shopTargets).toEqual([{ resourceId: 'phase01-prototype-shop', nodeId: 'shop.wandering-peddler',
      offerIds: [offer.id], mapResourceIds: ['phase01-prototype-map'] }]);
    expect(staged.changedPaths).toContain('public/data/mijing/prototype-shop.json');
    expect(staged.dependencies.map(item => item.path)).toEqual(expect.arrayContaining([
      'public/data/mijing/prototype-shop.json', 'public/data/mijing/prototype-map.json',
      'public/data/world/items.artifacts.json',
    ]));
    expect(staged.changedPaths).not.toContain('public/data/mijing/prototype-map.json');
    expect(await readFile(shopPath, 'utf8')).toBe(originalShop);
    const candidateShop = JSON.parse(await readFile(join(staged.repo, 'public/data/mijing/prototype-shop.json'), 'utf8'));
    expect(candidateShop.shopsByNodeId['shop.wandering-peddler'].offers[0]).toEqual(offer);
    const identity = { projectId: 'p', productionId: staged.productionId, candidateId: staged.id,
      featureId: staged.featureId, candidateHash: staged.candidateHash, targetBaseRevision: staged.targetBaseRevision,
      validationManifest: staged.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(JSON.parse(await readFile(shopPath, 'utf8')).shopsByNodeId['shop.wandering-peddler'].offers[0]).toEqual(offer);
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(shopPath, 'utf8')).toBe(originalShop);
  } finally { await f.close(); }
}, 90_000);

test('story crafting recipe and its material stay in one exact candidate and undo restores the catalog', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'public/data/world'), { recursive: true });
    const path = join(f.root, 'public/data/world/items.artifacts.json');
    const original = JSON.stringify({ artifacts: [], materials: [] }, null, 2) + '\n';
    await writeFile(path, original);
    const recipe = {
      id: 'recipe.jade-charm', name: '青玉护符',
      cost: { spiritStones: 4, items: [{ id: 'material.jade-fragment', itemType: 'material' as const, count: 2 }] },
      rewards: { items: [{ id: 'artifact.jade-charm', itemType: 'artifact' as const, count: 1 }] },
    };
    const input = {
      projectId: 'p', featureId: 'fog-adventure', storyId: 'story.jade-crafting',
      entryPath: 'knowledge/fox.md', brief: '采集青玉并制作护符',
      documents: [
        { path: 'knowledge/fox.md', expectedRevision: null, content: scene('scene.fox', '青玉矿脉',
          '地上散落两块青玉碎屑。\n\n## 选项\n\n- [拾起碎屑](./end.md) <!-- story-choice: {"id":"choice.jade.collect","effects":[{"kind":"once","eventId":"quest.jade.collect","effects":[{"kind":"grantItem","transactionId":"quest.jade.fragments","itemId":"material.jade-fragment","itemType":"material","count":2}]}]} -->',
          'shareFactsAcrossStories: true\n') },
        { path: 'knowledge/end.md', expectedRevision: null, content: scene('scene.end', '返程', '可以制作护符了。') },
      ],
      items: [
        { id: 'material.jade-fragment', name: '青玉碎屑', itemType: 'material' as const },
        { id: 'artifact.jade-charm', name: '青玉护符', itemType: 'artifact' as const, equipSlot: 'charm', attributeModifiers: { 心性: 5 } },
      ],
      recipes: [recipe],
      launch: { hubPath: 'public/data/hub/town.json', locationId: 'location.town', actionId: 'action.jade-crafting', label: '采集青玉' },
    };
    await expect(f.candidates.stageStory({ ...input, recipes: [{ ...recipe, cost: { ...recipe.cost,
      items: [{ ...recipe.cost.items[0]!, count: -1 }] } }] })).rejects.toThrow('制作配方定义无效');
    await expect(f.candidates.stageStory({ ...input, recipes: [{ ...recipe, cost: { ...recipe.cost,
      items: [{ ...recipe.cost.items[0]!, id: 'material.missing' }] } }] })).rejects.toThrow('制作配方引用不存在');
    const staged = (await f.candidates.stageStory(input)).candidate;
    expect(staged.recipeIds).toEqual([recipe.id]);
    expect(staged.changedPaths).toContain('public/data/world/items.artifacts.json');
    expect(await readFile(path, 'utf8')).toBe(original);
    const candidateCatalog = JSON.parse(await readFile(join(staged.repo, 'public/data/world/items.artifacts.json'), 'utf8'));
    expect(candidateCatalog.materials[0].id).toBe('material.jade-fragment');
    expect(candidateCatalog.artifacts[0].equipSlot).toBe('charm');
    expect(candidateCatalog.recipes).toEqual([recipe]);
    const identity = { projectId: 'p', productionId: staged.productionId, candidateId: staged.id,
      featureId: staged.featureId, candidateHash: staged.candidateHash, targetBaseRevision: staged.targetBaseRevision,
      validationManifest: staged.validationManifest };
    const adopted = await f.adoptions.confirm(identity);
    expect(JSON.parse(await readFile(path, 'utf8')).recipes).toEqual([recipe]);
    await f.adoptions.undo({ ...identity, adoptionId: adopted.adoptionId });
    expect(await readFile(path, 'utf8')).toBe(original);
  } finally { await f.close(); }
}, 90_000);
