#!/usr/bin/env bun
import { validateRpcCall, type RpcCallArguments } from '../src/rpc-methods';
/** Update the seven existing CardGame note sources before the offline Skill conversion. */
import { Database } from 'bun:sqlite';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const value = (name: string) => {
  const at = process.argv.indexOf(name);
  const result = at < 0 ? undefined : process.argv[at + 1];
  if (!result || result.startsWith('--')) throw Error(`缺少 ${name}`);
  return resolve(result);
};
const root = value('--data-root');
const backup = value('--backup-dir');
const apply = process.argv.includes('--apply');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex < 0 ? undefined : process.argv[onlyIndex + 1];
const repo = resolve(import.meta.dirname, '..');
if (backup.startsWith(root + '/') || !isAbsolute(backup)) throw Error('源码备份必须在实例目录之外');
const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8')) as {
  source: string; phase: string; notes: string[]; databases: Record<string, string>;
};
if (manifest.source !== root || manifest.phase !== 'pre-activation' || manifest.notes.length !== 7
  || Object.keys(manifest.databases).length !== 4) throw Error('缺少已验证的迁移前备份');
for (const id of manifest.notes) if (!(await stat(join(backup, 'notes', id))).isDirectory()) throw Error(`缺少便笺源码备份 ${id}`);
const registry = JSON.parse(await readFile(join(root, 'cardgame-workbench.json'), 'utf8')) as {
  notes: Record<'knowledge' | 'cards' | 'assets' | 'production' | 'todo' | 'execution' | 'preview', string>;
};
if (Object.values(registry.notes).some(id => !manifest.notes.includes(id))) throw Error('实例便笺与备份身份不一致');
const saved = new Database(join(backup, 'state.sqlite'), { readonly: true });
const revisions = new Map<string, string>();
try {
  for (const id of manifest.notes) {
    const row = saved.query('SELECT value FROM u_workbench_notes WHERE key = ?').get(id) as { value: string } | undefined;
    if (!row) throw Error(`备份缺少便笺 ${id}`);
    revisions.set(id, (JSON.parse(row.value) as { value: { codeVersion: string } }).value.codeVersion);
  }
} finally { saved.close(); }
const connection = JSON.parse(await readFile(join(root, 'connection.json'), 'utf8')) as {
  url: string; token: string; protocolVersion?: unknown;
};
async function call<T = any>(...[method, input = {}]: RpcCallArguments): Promise<T> {
  input = validateRpcCall(method, input, 'user');
  const response = await fetch(connection.url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-workbench-token': connection.token },
    body: JSON.stringify({ method, input, protocolVersion: connection.protocolVersion }),
  });
  const result = await response.json() as { ok: boolean; data: T; error?: { message: string } };
  if (!result.ok) throw Error(`${method}: ${result.error?.message ?? response.status}`);
  return result.data;
}
const roles = [
  { role: 'knowledge', template: 'cardgame-library', mode: 'manifest' },
  { role: 'cards', template: 'cardgame-library', mode: 'manifest' },
  { role: 'assets', template: 'cardgame-library', mode: 'manifest' },
  { role: 'execution', template: 'execution-note', mode: 'template' },
  { role: 'preview', template: 'candidate-preview', mode: 'template' },
  { role: 'production', template: 'cardgame-production', mode: 'production' },
  { role: 'todo', template: 'cardgame-todo', mode: 'template' },
] as const;
if (only && !roles.some(entry => entry.role === only)) throw Error(`未知便笺角色 ${only}`);
for (const { role, template, mode } of roles.filter(entry => !only || entry.role === only)) {
  const noteId = registry.notes[role];
  const note = await call<{ code?: { activeVersion?: string } }>('note.get', { noteId });
  const current = await call<{ draftVersion: string; files: Array<{ path: string; content: string }> }>('code.get', { noteId });
  if (note.code?.activeVersion !== revisions.get(noteId)) throw Error(`${role} 的激活版本与备份不同，停止更新`);
  const directory = join(repo, 'templates', template);
  const nextPublication = JSON.parse(await readFile(join(directory, 'worka-note.json'), 'utf8')) as {
    files: string[]; [key: string]: unknown;
  };
  const oldManifest = current.files.find(file => file.path === 'worka-note.json');
  if (!oldManifest) throw Error(`${role} 缺少现用 worka-note.json`);
  const publication = JSON.parse(oldManifest.content) as Record<string, unknown>;
  const updated: Record<string, unknown> = mode === 'template'
    ? { ...nextPublication, ...Object.fromEntries(['onboarding', 'scenarios'].filter(key => publication[key] !== undefined).map(key => [key, publication[key]])),
      name: publication.name ?? nextPublication.name, icon: publication.icon ?? nextPublication.icon }
    : { ...publication };
  delete updated.capabilities;
  const files = [{ path: 'worka-note.json', content: JSON.stringify(updated, null, 2) + '\n' }];
  if (mode === 'template') {
    for (const name of nextPublication.files) files.push({ path: name, content: await readFile(join(directory, name), 'utf8') });
  } else if (mode === 'production') {
    for (const name of ['actions.ts', 'README.md', 'SKILL.md'])
      files.push({ path: name, content: await readFile(join(directory, name), 'utf8') });
  }
  console.log(JSON.stringify({ role, noteId, files: files.map(file => file.path), apply }));
  if (!apply) continue;
  await call('code.saveDraft', { noteId, baseVersion: current.draftVersion, files });
  const result = await call<{ version?: string; status?: string; diagnostics?: Array<{ level?: string; message?: string }> }>('code.activate', { noteId });
  if (!result.version || result.status === 'failed' || result.status === 'error' || result.diagnostics?.some(item => item.level === 'error'))
    throw Error(`${role} 激活失败：${JSON.stringify(result.diagnostics ?? result)}`);
  const described = await call<{ capabilities?: { queries: unknown[]; actions: unknown[]; events: unknown[] } }>('note.describe', { noteId });
  if (!described.capabilities) throw Error(`${role} 激活后缺少公开能力`);
  console.log(JSON.stringify({ role, activated: true, version: result.version,
    capabilities: Object.fromEntries(['queries', 'actions', 'events'].map(key => [key, (described.capabilities as any)[key]?.length ?? 0])) }));
}
