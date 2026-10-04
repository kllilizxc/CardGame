import { validateRpcCall, type RpcCallArguments } from '../src/rpc-methods';
/**
 * Provision and retire the temporary CardGame capacity-test desktop.
 *
 * Examples:
 *   bun scripts/cardgame-capacity-desktop.ts --prepare --project /tmp/fixture
 *   bun scripts/cardgame-capacity-desktop.ts --install --project /tmp/fixture
 *   bun scripts/cardgame-capacity-desktop.ts --archive
 *
 * The fixture itself is owned by the capacity test. This script only registers
 * its path, creates one isolated desktop, and publishes the three library
 * notes needed by the browser run.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const repo = resolve(import.meta.dir, '..');
const argv = process.argv.slice(2);
const dataRoot = resolve(option('data-root') ?? resolve(repo, '.workbench'));
const registryPath = resolve(dataRoot, 'cardgame-projects.json');
const statePath = resolve(dataRoot, 'cardgame-capacity-test.json');

const projectId = 'scale';
const desktopName = 'CardGame 容量验收（临时）';
const stateMarker = 'cardgame-capacity-desktop';
const roles = ['knowledge', 'cards', 'assets'] as const;
type Role = (typeof roles)[number];
type Notes = Partial<Record<Role, string>>;

interface RegistryEntry {
  id: string;
  root: string;
  [key: string]: unknown;
}

interface RegistryState {
  projects: RegistryEntry[];
  arrayShape: boolean;
  original: Record<string, unknown> | null;
}

interface CapacityState {
  version: 1;
  createdBy: typeof stateMarker;
  projectId: typeof projectId;
  projectRoot: string;
  desktopId: string;
  desktopName: typeof desktopName;
  notes: Notes;
  createdAt: string;
  archivedAt?: string;
}

interface Connection {
  url: string;
  token: string;
  protocolVersion?: unknown;
}

interface RpcResult {
  ok?: boolean;
  data?: unknown;
  error?: { message?: string };
}

interface DesktopWire {
  id: string;
  name: string;
  archived: boolean;
}

interface NoteWire {
  id: string;
  desktopId?: string;
  archived?: boolean;
  code?: {
    draftVersion?: string;
    activeVersion?: string;
    status?: string;
  };
}

interface ConfigWire {
  value: unknown;
  revision: string;
}

interface Publication {
  files: string[];
  initialState?: unknown;
}

type RpcCall = <T = unknown>(...args: RpcCallArguments) => Promise<T>;

function option(name: string): string | undefined {
  const index = argv.indexOf('--' + name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} 缺少有效字符串`);
  return value;
}

async function jsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJSON(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, path);
}

async function requireDirectory(path: string): Promise<void> {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`容量验收 fixture 不存在：${path}`);
    }
    throw error;
  }
  if (!info.isDirectory()) throw new Error(`容量验收 fixture 不是目录：${path}`);
}

async function readRegistry(): Promise<RegistryState> {
  const raw = await jsonFile<unknown>(registryPath, { projects: [] });
  if (Array.isArray(raw)) {
    const projects = raw.map(value => {
      if (!isRecord(value)) throw new Error('cardgame-projects.json 的项目项必须是对象');
      return asRegistryEntry(value);
    });
    return { projects, arrayShape: true, original: null };
  }
  if (!isRecord(raw)) throw new Error('cardgame-projects.json 必须是项目数组或含 projects 的对象');
  if (raw.projects === undefined) return { projects: [], arrayShape: false, original: raw };
  if (!Array.isArray(raw.projects)) throw new Error('cardgame-projects.json 的 projects 必须是数组');
  const projects = raw.projects.map(value => {
    if (!isRecord(value)) throw new Error('cardgame-projects.json 的项目项必须是对象');
    return asRegistryEntry(value);
  });
  return { projects, arrayShape: false, original: raw };
}

function asRegistryEntry(value: Record<string, unknown>): RegistryEntry {
  const id = requiredString(value.id, '项目 id');
  const root = requiredString(value.root, `项目 ${id} 的 root`);
  return { ...value, id, root };
}

async function writeRegistry(registry: RegistryState): Promise<void> {
  const value: unknown = registry.arrayShape
    ? registry.projects
    : { ...(registry.original ?? {}), projects: registry.projects };
  await writeJSON(registryPath, value);
}

async function registerProject(projectRoot: string): Promise<void> {
  const registry = await readRegistry();
  const byId = registry.projects.find(item => item.id === projectId);
  if (byId && resolve(byId.root) !== projectRoot) {
    throw new Error(`项目 ${projectId} 已绑定另一个目录`);
  }
  const byRoot = registry.projects.find(item => resolve(item.root) === projectRoot);
  if (byRoot && byRoot.id !== projectId) {
    throw new Error(`fixture 目录已登记为项目 ${byRoot.id}`);
  }
  if (!byId) {
    registry.projects.push({ id: projectId, root: projectRoot, title: 'CardGame 容量验收' });
    await writeRegistry(registry);
  }
}

async function removeProject(projectRoot: string): Promise<void> {
  const registry = await readRegistry();
  const byId = registry.projects.find(item => item.id === projectId);
  if (!byId) return;
  if (resolve(byId.root) !== projectRoot) {
    throw new Error(`项目 ${projectId} 的登记目录与容量验收 fixture 不符`);
  }
  registry.projects = registry.projects.filter(item => item !== byId);
  await writeRegistry(registry);
}

async function rpc(): Promise<RpcCall> {
  const connection = await jsonFile<Connection | null>(resolve(dataRoot, 'connection.json'), null);
  if (!connection || !connection.url || !connection.token) throw new Error('请先启动 Worka 宿主');
  const call: RpcCall = async <T>(...[method, input = {}]: RpcCallArguments): Promise<T> => {
    input = validateRpcCall(method, input, 'user');
    const response = await fetch(connection.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workbench-token': connection.token,
      },
      body: JSON.stringify({ method, input, protocolVersion: connection.protocolVersion }),
    });
    const result = await response.json() as RpcResult;
    if (!result.ok) {
      throw new Error(`${method}: ${result.error?.message ?? JSON.stringify(result.error)}`);
    }
    return result.data as T;
  };
  return call;
}

async function ensureExtension(call: RpcCall): Promise<void> {
  const help = await call<{ extensions?: unknown }>('workbench.help');
  if (!Array.isArray(help.extensions) || !help.extensions.includes('cardgame-content')) {
    throw new Error('请先构建并重启宿主，启用 cardgame-content 扩展');
  }
}

async function readCapacityState(): Promise<CapacityState | undefined> {
  return jsonFile<CapacityState | undefined>(statePath, undefined);
}

function validateState(state: CapacityState, projectRoot: string): void {
  if (state.createdBy !== stateMarker || state.projectId !== projectId) {
    throw new Error('容量验收记录不是本脚本创建的记录');
  }
  if (resolve(state.projectRoot) !== projectRoot) {
    throw new Error('容量验收记录属于另一个 fixture 目录');
  }
  if (state.desktopName !== desktopName) throw new Error('容量验收记录的桌面名称不匹配');
}

function completeNotes(notes: Notes): Record<Role, string> {
  for (const role of roles) requiredString(notes[role], `${role} noteId`);
  return {
    knowledge: notes.knowledge!,
    cards: notes.cards!,
    assets: notes.assets!,
  };
}

async function saveState(state: CapacityState): Promise<void> {
  await writeJSON(statePath, state);
}

async function ensureDesktop(call: RpcCall, state: CapacityState | undefined, projectRoot: string): Promise<CapacityState> {
  if (state) validateState(state, projectRoot);
  const desktops = await call<DesktopWire[]>('desktop.list');
  let desktop: DesktopWire | undefined;
  if (state) {
    desktop = desktops.find(item => item.id === state.desktopId);
    if (desktop && desktop.name !== desktopName) throw new Error('容量验收桌面名称已被修改');
    if (desktop?.archived) {
      await call('desktop.restore', { desktopId: desktop.id });
      desktop = { ...desktop, archived: false };
    }
  }
  if (!desktop) {
    desktop = await call<DesktopWire>('desktop.create', { name: desktopName });
    requiredString(desktop.id, 'desktopId');
  }
  return {
    version: 1,
    createdBy: stateMarker,
    projectId,
    projectRoot,
    desktopId: desktop.id,
    desktopName,
    notes: state?.notes ?? {},
    createdAt: state?.createdAt ?? new Date().toISOString(),
  };
}

async function ensureNote(call: RpcCall, state: CapacityState, role: Role, projectRoot: string): Promise<string> {
  const prior = state.notes[role];
  if (prior) {
    const note = await call<NoteWire>('note.get', { noteId: prior });
    if (note.desktopId && note.desktopId !== state.desktopId) throw new Error(`${role} note 不属于容量验收桌面`);
    if (note.archived) throw new Error(`${role} note 已归档，不能复用`);
    return requiredString(note.id, `${role} noteId`);
  }
  const note = await call<NoteWire>('note.create', {
    name: role === 'knowledge' ? '知识库' : role === 'cards' ? '卡牌库' : '资源库',
    desktopId: state.desktopId,
    cwd: projectRoot,
    initialState: {
      query: '',
      bookmarks: [],
      views: { knowledge: 'reader', cards: 'table', assets: 'grid', assetsFilters: [] },
    },
  });
  return requiredString(note.id, `${role} noteId`);
}

async function publishNote(call: RpcCall, noteId: string, role: Role, notes: Record<Role, string>, projectRoot: string): Promise<void> {
  const source = resolve(repo, 'templates', 'cardgame-library');
  const publication = await jsonFile<Publication>(resolve(source, 'worka-note.json'), { files: [] });
  const paths = [...new Set(['worka-note.json', ...publication.files])];
  const files = await Promise.all(paths.map(async path => ({
    path,
    content: await readFile(resolve(source, path), 'utf8'),
  })));
  const config = await call<ConfigWire>('note.config.get', { noteId });
  const current = isRecord(config.value) ? config.value : {};
  await call('note.config.update', {
    noteId,
    baseRevision: config.revision,
    value: { ...current, projectId, projectRoot, mode: role, notes },
  });
  const note = await call<NoteWire>('note.get', { noteId });
  await call('code.saveDraft', {
    noteId,
    files,
    ...(note.code?.draftVersion ? { baseVersion: note.code.draftVersion } : {}),
  });
  const activated = await call<{ ok?: boolean; status?: string; diagnostics?: Array<{ level?: string }> }>('code.activate', { noteId });
  if (activated.ok === false || activated.status === 'failed' || activated.status === 'error' || activated.diagnostics?.some(item => item.level === 'error')) {
    throw new Error(`${role} 便笺激活失败`);
  }
  const checked = await call<NoteWire>('note.get', { noteId });
  if (!checked.code?.activeVersion || checked.code.status === 'error') throw new Error(`${role} 便笺没有有效运行版本`);
  await call('note.update', {
    noteId,
    title: role === 'knowledge' ? '知识库' : role === 'cards' ? '卡牌库' : '资源库',
    cwd: projectRoot,
  });
}

async function prepare(): Promise<string> {
  const requested = option('project');
  if (!requested) throw new Error('--prepare 需要 --project <fixture>');
  const projectRoot = resolve(requested);
  await requireDirectory(projectRoot);
  await registerProject(projectRoot);
  return projectRoot;
}

async function install(): Promise<{ fixture: string; desktopId: string; notes: Record<Role, string> }> {
  const prior = await readCapacityState();
  const requested = option('project');
  const requestedRoot = requested ?? prior?.projectRoot;
  if (!requestedRoot) throw new Error('--install 需要 --project <fixture> 或已有容量验收记录');
  const projectRoot = resolve(requestedRoot);
  await requireDirectory(projectRoot);
  const registry = await readRegistry();
  const registration = registry.projects.find(item => item.id === projectId);
  if (!registration || resolve(registration.root) !== projectRoot) throw new Error('请先用 --prepare 登记 scale fixture');

  const call = await rpc();
  await ensureExtension(call);
  const state = await ensureDesktop(call, prior, projectRoot);
  await saveState(state);
  for (const role of roles) {
    state.notes[role] = await ensureNote(call, state, role, projectRoot);
    await saveState(state);
  }
  const notes = completeNotes(state.notes);
  const positions: Record<Role, [number, number]> = { knowledge: [70, 100], cards: [70, 390], assets: [70, 680] };
  for (const role of roles) {
    await publishNote(call, notes[role], role, notes, projectRoot);
    const [x, y] = positions[role];
    await call('note.updateLayout', {
      noteId: notes[role], x, y, width: 320, height: 210, expandedWidth: 1280, expandedHeight: 850,
    });
  }
  return { fixture: projectRoot, desktopId: state.desktopId, notes };
}

async function archive(): Promise<{ fixture: string; desktopId: string; notes: Record<Role, string> }> {
  const state = await readCapacityState();
  if (!state) throw new Error('找不到容量验收记录，无法确认要归档的桌面');
  const requested = option('project');
  const projectRoot = resolve(requested ?? state.projectRoot);
  validateState(state, projectRoot);
  const notes = completeNotes(state.notes);
  const call = await rpc();
  const desktops = await call<DesktopWire[]>('desktop.list');
  const desktop = desktops.find(item => item.id === state.desktopId);
  if (!desktop) throw new Error('找不到本脚本创建的容量验收桌面');
  if (desktop.name !== desktopName) throw new Error('待归档桌面名称不匹配');
  if (!desktop.archived) await call('desktop.archive', { desktopId: desktop.id });
  await removeProject(projectRoot);
  await saveState({ ...state, archivedAt: new Date().toISOString() });
  return { fixture: projectRoot, desktopId: state.desktopId, notes };
}

async function main(): Promise<void> {
  const selected = ['--prepare', '--install', '--archive'].filter(flag => argv.includes(flag));
  if (!selected.length) throw new Error('请指定 --prepare、--install 或 --archive');
  if (selected.includes('--archive') && selected.length !== 1) throw new Error('--archive 不能与其他操作合用');
  let output: { fixture: string; desktopId?: string; notes?: Record<Role, string> };
  if (selected.includes('--archive')) {
    output = await archive();
  } else if (selected.includes('--install')) {
    if (selected.includes('--prepare')) await prepare();
    output = await install();
  } else {
    output = { fixture: await prepare() };
  }
  console.log(JSON.stringify(output));
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
