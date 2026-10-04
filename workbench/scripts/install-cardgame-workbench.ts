import { validateRpcCall, type RpcCallArguments } from '../src/rpc-methods';
/**
 * Explicit, resumable installation into an existing desktop.
 * bun scripts/install-cardgame-workbench.ts --prepare --project /path/CardGame
 * Restart the built host, then run with --install (the default).
 * Existing official notes keep their activated source; only instance config is linked.
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { cardgameSkillRelations, type CardgameNotes } from '../plugins/cardgame-content/connections';
import { cardgameSchedules } from '../plugins/cardgame-content/schedules';
import { officialSourceHash } from '../src/runtime/official-artifacts';
import { SkillConnectionSources } from '../src/skill-connection-source';
import type { SkillConnectionView } from '../src/skill-connection-model';
import { cardgameEventNames, seedCardgameSkill, selectCardgameGrants } from '../plugins/cardgame-content/src/skill-recipes';

const repo = resolve(import.meta.dir, '..');
const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const index = argv.indexOf('--' + name);
  return index < 0 ? fallback : argv[index + 1] || fallback;
};
const dataRoot = resolve(flag('data-root', resolve(repo, '.workbench')));
const projectRoot = resolve(flag('project', resolve(repo, '../CardGame')));
const projectId = flag('project-id', 'cardgame');
const desktopId = flag('desktop', '2059d2dc-6102-4456-8821-28808d88f277');
const registryPath = resolve(dataRoot, 'cardgame-workbench.json');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type OfficialRole = { template: string; actions: string[] };
type NoteSource = {
  codePath?: string;
  officialTemplate?: { key?: string; hash?: string };
  code?: { files?: Array<{ path: string; content: string }> };
};

/** Fresh official notes have a durable marker but may not have a source receipt file. */
export async function isOfficialRoleSource(note: NoteSource, expected: OfficialRole | undefined, title: string): Promise<boolean> {
  const receiptFile = note.code?.files?.find(file => file.path === 'worka-source.json');
  const receipt = receiptFile ? JSON.parse(receiptFile.content) as { kind?: string; template?: string } : null;
  const marker = note.officialTemplate;
  const hasReceipt = receipt?.kind === 'official-note';
  if (hasReceipt) {
    if (!expected || receipt.template !== expected.template || marker?.key && marker.key !== expected.template) {
      throw Error(`便笺 ${title} 的官方来源与角色不符，已备份但未覆盖`);
    }
    return true;
  }
  if (marker?.key && expected && marker.key !== expected.template && marker.key !== 'data-note') {
    throw Error(`便笺 ${title} 的官方来源与角色不符，已备份但未覆盖`);
  }
  if (!expected || marker?.key !== expected.template) return false;
  if (typeof marker.hash !== 'string' || !/^[a-f0-9]{64}$/.test(marker.hash) || typeof note.codePath !== 'string' || await officialSourceHash(note.codePath) !== marker.hash) {
    throw Error(`便笺 ${title} 的官方源码与记录不一致，已备份但未覆盖`);
  }
  return true;
}
async function jsonFile(path: string, fallback: any) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
async function writeJSON(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.tmp-' + randomUUID();
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, path);
}
async function createText(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  try { await writeFile(path, content, { flag: 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}

async function prepare() {
  await readFile(resolve(projectRoot, 'package.json'));
  const path = resolve(dataRoot, 'cardgame-projects.json');
  const registered = await jsonFile(path, { projects: [] });
  const projects: any[] = Array.isArray(registered) ? registered : registered.projects;
  const existing = projects.find(item => item.id === projectId);
  if (existing && resolve(existing.root) !== projectRoot) throw Error('项目 ID 已绑定另一个目录');
  if (!existing) projects.push({ id: projectId, root: projectRoot, title: 'CardGame' });
  await writeJSON(path, { projects });
  const knowledge = resolve(projectRoot, 'knowledge');
  await createText(resolve(knowledge, 'index.md'), '# CardGame 知识库\n\n这里保存自由 Markdown 剧情、设定和制作规范。目录按章节、人物或主题组织，文件之间使用普通 Markdown 链接，图片使用普通图片引用。\n\n- [工作台使用说明](./workbench.md)\n- [预览运行说明](./preview.md)\n- [现有剧情编写指南](../public/data/docs/story-authoring-guide.md)\n- [项目开发约定](../AGENTS.md)\n\n目前游戏继续读取现有运行数据。Markdown 编译为可玩分支的约定留待后续确定。\n');
  await createText(resolve(knowledge, 'workbench.md'), '# 工作台使用说明\n\n## 内容归属\n\n知识库保存剧情、设定、规范与内容引用。卡牌库编辑现有 JSON；资源库管理文件及版本，使用位置在知识库反向链接中查看。\n\nTodo 保存需求、反馈和验收要求。AI 资源生产保存制作要求、参考版本和候选；所有模型运行由执行台承接。试玩只用于运行和体验游戏。\n\n## 明确交办\n\n保存文件只更新索引。Todo 的交办和制作单的生成按钮才启动工作。同一个制作请求的新轮次复用原执行任务；传输重试复用原请求标识。\n\n素材先登记为未采用候选。单卡制作形成确切 Git 试玩版本；用户在原试玩便笺体验，再到所属功能进展项确认后才进入正式项目。像素美术与 spritesheet 的生产、加工和导出由 AI 完成。\n\n## 写作和版本\n\n普通 Markdown 链接都可阅读导航，暂不把所有链接解释为游戏选项。章节、人物和设定继续用索引页与普通链接组织。\n\n知识库原生对话负责资料和剧情改稿。先从已登记的 CardGame 内容查询读取目标文档及 revision，再从功能进展读取所属 featureId。在该知识库会话调用工作台 extension.invoke：扩展为 cardgame-content；普通资料调用 stageDocumentsCandidate，可玩剧情调用 stageStoryCandidate。输入绑定当前 projectId、featureId、修改说明、文档全文与 expectedRevision，剧情另带稳定 storyId 和入口。不要用正式文件保存动作绕过候选。\n\n候选进入原试玩便笺，实际体验确切版本后仅在功能进展确认采用或撤销。外部改动冲突时重新读取版本并建立新候选。\n\n新增便笺视图可保存筛选，继续使用同一索引。二进制文件与全文不放进便笺状态或连线载荷。\n');
  await createText(resolve(knowledge, 'preview.md'), '# CardGame 预览运行说明\n\n默认入口：web（开发服务器，本机迭代用）；另有 static 构建版入口，按候选 commit 缓存构建产物，供 Tailscale 等远程分享。权威 v2 项目描述为 [preview.config.mjs](./tools/preview/preview.config.mjs)。候选必须提供 game 仓库的确切 Git 提交；Worka 管理独立工作树、端口、依赖准备、进程与状态。\n\n单卡候选由制作服务自动登记到原试玩便笺。URL 按 project、candidate、commit、profile 隔离存档。自动 verify 检查游戏入口、目录、目标卡定义、两主题贴图和默认可玩卡组；实际剧情与战斗体验仍需在试玩便笺核对。正式源码采用只在对应功能进展项中确认。\n\n[preview.mjs](./tools/preview/preview.mjs) 仅兼容旧 v1 候选，不作为新候选交付方式。\n');
  const target = resolve(knowledge, 'tools/preview');
  await mkdir(target, { recursive: true });
  for (const name of ['preview.config.mjs', 'preview.mjs', 'serve.mjs', 'serve-static.mjs']) {
    await createText(resolve(target, name), await readFile(resolve(repo, 'plugins/cardgame-content/preview', name), 'utf8'));
  }
  for (const name of ['lifecycle.mjs', 'ports.mjs']) {
    await createText(resolve(target, name), await readFile(resolve(repo, 'plugins/cardgame-content/preview', name), 'utf8'));
  }
  console.log('Prepared project registration and knowledge files: ' + projectRoot);
}

async function install() {
  const connection = await jsonFile(resolve(dataRoot, 'connection.json'), null);
  if (!connection) throw Error('请先启动 Worka 宿主');
  const call = async (...[method, input = {}]: RpcCallArguments): Promise<any> => {
    input = validateRpcCall(method, input, 'user');
    const response = await fetch(connection.url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-workbench-token': connection.token },
      body: JSON.stringify({ method, input, protocolVersion: connection.protocolVersion }),
    });
    const result = await response.json() as any;
    if (!result.ok) throw Error(method + ': ' + (result.error?.message || JSON.stringify(result.error)));
    return result.data;
  };
  const help = await call('workbench.help');
  if (!help.extensions.includes('cardgame-content')) throw Error('请先构建并重启宿主，启用 cardgame-content 扩展');
  const registry = await jsonFile(registryPath, { projectId, projectRoot, desktopId, notes: {}, hashes: {} });
  if (registry.projectId !== projectId || registry.desktopId !== desktopId || registry.projectRoot !== projectRoot) throw Error('安装记录属于另一个项目或桌面');
  const found = await call('note.find', { desktopId });
  const roles = [
    ['knowledge', '知识库', 'cardgame-library'], ['cards', '卡牌库', 'cardgame-library'],
    ['assets', '资源库', 'cardgame-library'], ['production', 'AI 资源生产', 'cardgame-production'],
    ['todo', '待办', 'cardgame-todo'], ['execution', '执行台', 'execution-note'], ['preview', '试玩', 'candidate-preview'],
  ] as const;
  const only = new Set(flag('only', '').split(',').map(value => value.trim()).filter(Boolean));
  for (const role of only) {
    if (!roles.some(item => item[0] === role)) throw Error('未知便笺角色：' + role);
  }
  const backup = resolve(dataRoot, 'backups/cardgame', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(backup, { recursive: true, mode: 0o700 });
  const officialRoles: Partial<Record<(typeof roles)[number][0], { template: string; actions: string[] }>> = {
    knowledge: { template: 'knowledge', actions: ['addResource'] },
    todo: { template: 'todo', actions: ['addTodo', 'feedback'] },
    execution: { template: 'execution', actions: ['acceptRequirement'] },
    preview: { template: 'candidates', actions: ['receive'] },
  };
  for (const [role, title, template] of roles) {
    if (!registry.notes[role]) {
      const matches = found.filter((note: any) => note.title === title || role === 'preview' && note.title === '候选预览');
      if (matches.length > 1) throw Error('同名便笺不唯一：' + title);
      if (matches[0]) registry.notes[role] = matches[0].id;
      else {
        const definition = await jsonFile(resolve(repo, 'templates', template, 'worka-note.json'), null);
        if (!definition) throw Error('缺少便笺模板：' + template);
        const note = await call('note.create', { name: title, desktopId, cwd: projectRoot, initialState: definition.initialState ?? { title } });
        registry.notes[role] = note.id;
      }
      await writeJSON(registryPath, registry);
    }
  }
  const notes = registry.notes as CardgameNotes;
  for (const [role, title, template] of roles) {
    if (only.size && !only.has(role)) continue;
    const noteId = notes[role];
    const note = await call('note.get', { noteId });
    const config = await call('note.config.get', { noteId });
    await writeJSON(resolve(backup, role + '.json'), { note, config });
    const expected = officialRoles[role];
    const official = await isOfficialRoleSource(note, expected, title);
    if (official) {
      const available = new Set<string>((note.actions ?? []).map((item: { name: string }) => item.name));
      const missing = expected!.actions.filter(name => !available.has(name));
      if (missing.length) throw Error(`官方便笺 ${title} 尚缺 CardGame 兼容动作 ${missing.join(', ')}，已备份但未覆盖`);
    }
    let files: Array<{ path: string; content: string }> = [];
    if (!official) {
      const source = resolve(repo, 'templates', template);
      const publication = await jsonFile(resolve(source, 'worka-note.json'), null);
      const paths = [...new Set<string>(['worka-note.json', ...publication.files])];
      files = await Promise.all(paths.map(async path => ({ path, content: await readFile(resolve(source, path), 'utf8') })));
      for (const file of note.code?.files ?? []) {
        const previous = registry.hashes[noteId]?.[file.path];
        if (previous && previous !== hash(file.content)) throw Error('便笺文件在上次安装后有本地修改，已备份但未覆盖：' + file.path);
      }
    }
    const resources = [...(config.value.resources ?? [])];
    const index = resolve(projectRoot, 'knowledge/index.md');
    if (role === 'knowledge' && !resources.some(item => item.path === index)) resources.push({ title: 'CardGame 项目知识', path: index, root: projectRoot, linkBase: resolve(projectRoot, 'knowledge') });
    if (role === 'knowledge') {
      const docsIndex = resolve(projectRoot, 'public/data/docs/index.md');
      const sections = [
        ['世界观与剧情蓝图', 'world-story-index.md'],
        ['剧情内容与运行时', 'story-runtime-index.md'],
        ['战斗与秘境玩法', 'battle-expedition-index.md'],
        ['卡牌与法器设计', 'cards-artifacts-index.md'],
      ] as const;
      const sectionResources = [];
      for (const [title, filename] of sections) {
        const path = resolve(dirname(docsIndex), filename);
        try {
          await readFile(path, 'utf8');
          sectionResources.push({ title, path, root: projectRoot, linkBase: dirname(path) });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (sectionResources.length === sections.length) {
        const paths = new Set([docsIndex, ...sectionResources.map(item => item.path)]);
        const oldIndex = resources.findIndex(item => paths.has(item.path));
        const insertionIndex = oldIndex < 0 ? resources.length : oldIndex;
        const retained = resources.filter(item => !paths.has(item.path));
        retained.splice(Math.min(insertionIndex, retained.length), 0, ...sectionResources);
        resources.splice(0, resources.length, ...retained);
      }
    }
    const instanceConfig = { ...config.value };
    if (role === 'preview') delete instanceConfig.playOnly;
    await call('note.config.update', { noteId, baseRevision: config.revision, value: {
      ...instanceConfig, projectId, projectRoot, notes,
      ...(role === 'knowledge' || role === 'cards' || role === 'assets' ? { mode: role } : {}),
      ...(role === 'knowledge' ? { resources } : {}),
      ...(role === 'preview' ? { feedbackInTodo: true } : {}),
      catalogRef: { projectId, noteId, kind: role, query: role === 'knowledge' ? 'documents' : role === 'production' ? 'productions' : role === 'todo' ? 'todos' : role },
    } });
    if (role === 'todo' && Array.isArray(note.state?.items) && note.state.items.length) {
      await call('extension.invoke', { extension: 'cardgame-content', method: 'importTodos', input: { projectId, items: note.state.items } });
      const { items: _items, ...smallState } = note.state;
      await call('store.update', { ref: note.storeRef, baseRevision: note.stateRevision, value: smallState });
    }
    if (!official) {
      await call('code.saveDraft', { noteId, files, ...(note.code?.draftVersion ? { baseVersion: note.code.draftVersion } : {}) });
      const activated = await call('code.activate', { noteId });
      if (activated.ok === false || activated.status === 'failed' || activated.status === 'error' || activated.diagnostics?.some((d: any) => d.level === 'error')) throw Error('便笺激活失败：' + title + ' ' + JSON.stringify(activated));
    }
    const checked = await call('note.get', { noteId });
    if (!checked.code?.activeVersion || checked.code.status === 'error') throw Error('便笺没有有效运行版本：' + title);
    if (!official) registry.hashes[noteId] = Object.fromEntries(files.map(file => [file.path, hash(file.content)]));
    await writeJSON(registryPath, registry);
    await call('note.update', { noteId, title, cwd: projectRoot });
    const positions: Record<string, [number, number]> = { knowledge:[70,100], cards:[70,390], assets:[70,680], todo:[470,100], production:[470,390], execution:[870,100], preview:[870,430] };
    const [x,y] = positions[role]!;
    if (!only.size) await call('note.updateLayout', { noteId, x, y, width: role === 'preview' || role === 'execution' ? 440 : 320, height: 210, expandedWidth: role === 'preview' ? 1500 : 1280, expandedHeight: role === 'preview' ? 940 : 850 });
    console.log((official ? 'Preserved official ' : 'Activated ') + title + ' (' + noteId + ')');
  }
  // Keep auxiliary notes available outside the seven primary tool positions.
  for (const [index, extra] of found.filter((item: any) => !only.size && !Object.values(notes).includes(item.id)).entries()) {
    await call('note.updateLayout', { noteId: extra.id, x: 1430, y: 100 + index * 500 });
  }
  const connectionDb = new Database(resolve(dataRoot, 'state.sqlite'), { readonly: true });
  let existing: Array<{ id: string; value: any }>;
  try {
    existing = (connectionDb.query('SELECT key,value FROM u_workbench_connections').all() as Array<{ key: string; value: string }>).map(row =>
      ({ id: row.key, value: JSON.parse(row.value).value }));
  } finally { connectionDb.close(); }
  const hasLegacy = existing.some(row => row.value.schemaVersion !== 2);
  const skillSpecs = cardgameSkillRelations(notes);
  if (!only.size && !hasLegacy) {
    const descriptions = new Map<string, any>();
    for (const noteId of new Set(skillSpecs.flatMap(spec => spec.nodeIds))) descriptions.set(noteId, await call('note.describe', { noteId }));
    for (const spec of skillSpecs) {
      const published = spec.nodeIds.flatMap(id => descriptions.get(id)?.capabilities?.events?.map((event: any) => event.name) ?? []);
      const missing = cardgameEventNames[spec.kind].filter(name => !published.includes(name));
      if (missing.length || spec.nodeIds.some(id => !descriptions.get(id)?.capabilities))
        throw Error(`Skill 连线「${spec.name}」的便笺公开能力未更新：${missing.join('、') || '缺少 capabilities'}`);
    }
    registry.skillRelations ??= {};
    const sources = new SkillConnectionSources(dataRoot);
    for (const spec of skillSpecs) {
      const same = existing.filter(row => row.value.schemaVersion === 2 && row.value.name === spec.name &&
        JSON.stringify([...row.value.nodeIds].sort()) === JSON.stringify([...spec.nodeIds].sort()));
      if (same.length > 1) throw Error(`Skill 连线「${spec.name}」不唯一`);
      const ownedRelationId = registry.skillRelations[spec.kind];
      let relation: SkillConnectionView = same[0] ? await call('connection.skillGet', { id: same[0].id }) : await call('connection.skillCreate',
        { nodeIds: spec.nodeIds, name: spec.name, goal: spec.goal });
      if (!same[0]) {
        registry.skillRelations[spec.kind] = relation.id;
        await writeJSON(registryPath, registry);
      }
      if (!relation.enabled) {
        // Only initialize a new or resumable installer-owned draft; preserve existing and migrated selections.
        if (!same[0] || ownedRelationId === relation.id && !relation.activeSkill
          && !relation.grants.some(grant => grant.queries.length || grant.actions.length || grant.events.length))
          relation = await call('connection.skillUpdateDraft', {id: relation.id, revision: relation.revision,
            change: {grants: selectCardgameGrants(spec.kind, relation, notes)}});
        await seedCardgameSkill(spec.kind, relation, sources);
        relation = await call('connection.skillActivate', { id: relation.id, revision: relation.revision });
      }
      registry.skillRelations[spec.kind] = relation.id;
      await writeJSON(registryPath, registry);
    }
  } else if (!only.size && hasLegacy) {
    console.log('发现旧版连线；请先运行 CardGame Skill 离线迁移，安装器未创建重叠关系。');
  }
  // Idempotent by stable schedule id; a user-paused schedule stays paused.
  const priorSchedules = await call('schedule.list');
  for (const spec of only.size ? [] : cardgameSchedules(notes, projectId)) {
    const old = priorSchedules.find((item: any) => item.id === spec.id);
    await call('schedule.upsert', { ...spec, ...(old?.status === 'paused' ? { status: 'paused' } : {}) });
  }
  registry.installedAt = new Date().toISOString();
  registry.backup = backup;
  await writeJSON(registryPath, registry);
  console.log(JSON.stringify({ desktopId, notes, backup, skillRelations: hasLegacy ? 0 : skillSpecs.length, schedules: cardgameSchedules(notes, projectId).length }, null, 2));
}

if (import.meta.main) {
  if (argv.includes('--prepare')) await prepare();
  if (!argv.includes('--prepare') || argv.includes('--install')) await install();
}
