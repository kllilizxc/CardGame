/** One-time CardGame Skill conversion. Build with `bun run migration:cardgame:build`,
 * then run `node dist/migrate-cardgame-skill-connections.mjs`. Trial uses SQLite
 * snapshots; apply requires a stopped host. The storage backend needs Node. */
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRecordStorage } from '../src/core/sqlite-record-storage';
import { CoreStore } from '../src/core/store';
import { convertCardgameSkillConnections } from '../plugins/cardgame-content/src/skill-conversion';
import type { LegacyConnectionInventory } from './legacy-connection-inventory';
import { planSkillConnections, type SkillConnectionGrouping } from './plan-skill-connections';

const argument = (name: string) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const required = (name: string) => { const value = argument(name); if (!value || value.startsWith('--')) throw Error(`缺少 ${name}`); return resolve(value); };
const root = required('--data-root');
const groupingPath = required('--grouping'), inventoryPath = required('--inventory'), historyPath = required('--history');
const apply = process.argv.includes('--apply'), backupDir = apply ? required('--backup-dir') : undefined;
if (backupDir && backupDir.startsWith(root + '/')) throw Error('备份必须位于实例目录之外');
const paths = ['state.sqlite', 'executions.sqlite', 'plugins/cardgame-content/content.sqlite', 'plugins/cardgame-content/cardgame-workflow.sqlite'];

function validate(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { if ((db.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check !== 'ok') throw Error(`数据库完整性检查失败：${path}`); }
  finally { db.close(); }
}
function owners(path: string) {
  const result = spawnSync('lsof', ['-t', '--', path], { encoding: 'utf8' });
  if (result.error || ![0, 1].includes(result.status ?? -1) || result.stderr.trim()) throw Error('无法确认数据库是否仍有使用者');
  if (result.stdout.trim()) throw Error('先停止 Worka 宿主及其他数据库使用者');
}
function activeRuns(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return Number((db.prepare("SELECT count(*) AS count FROM execution_meta WHERE status IN ('queued','accepted','started','running','cancel-requested')").get() as { count: number }).count); }
  finally { db.close(); }
}
async function snapshot(source: string, destination: string) {
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(source, { readOnly: true });
  try { db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`); } finally { db.close(); }
  validate(destination);
  return createHash('sha256').update(await readFile(destination)).digest('hex');
}
function verifyInventory(dataRoot: string, expected: LegacyConnectionInventory) {
  const temporary = mkdtempSync(join(tmpdir(), 'cardgame-inventory-'));
  let actual: LegacyConnectionInventory;
  try {
    const output = join(temporary, 'inventory.json');
    const result = spawnSync('bun', [resolve(import.meta.dirname, '../scripts/legacy-connection-inventory.ts'), dataRoot, '--output', output],
      { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw Error(`无法重新盘点实例：${result.stderr.trim() || result.error || result.status}`);
    actual = JSON.parse(readFileSync(output, 'utf8')) as LegacyConnectionInventory;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  const entries = (report: LegacyConnectionInventory) => ({
    notes: report.notes.map(row => [row.id, row.revision]).sort(),
    connections: report.connections.map(row => [row.id, row.revision]).sort(),
    schedules: report.schedules.map(row => [row.id, row.revision, row.value.target]).sort(),
    records: [...report.connectionRecordKeys].sort(),
    runs: report.connections.flatMap(row => row.runs.map(run => [run.id, run.connection_id, run.status])).sort(),
    orphan: [...report.orphanRunIds].sort(),
  });
  if (JSON.stringify(entries(actual)) !== JSON.stringify(entries(expected))) throw Error('实例便笺、旧连线、计划或运行记录已变化，请重新盘点');
}
async function convertAt(dataRoot: string, inventory: LegacyConnectionInventory, history: LegacyConnectionInventory[], grouping: SkillConnectionGrouping) {
  const storage = new SqliteRecordStorage({ path: join(dataRoot, 'state.sqlite') });
  let core: CoreStore | undefined;
  try {
    core = await CoreStore.open(storage);
    return await convertCardgameSkillConnections(core, { packageRoot: resolve(import.meta.dirname, '..'), dataRoot, inventory, history, plan: planSkillConnections(inventory, grouping) });
  } finally { if (core) await core.close(); else await storage.close(); }
}

for (const name of paths) validate(join(root, name));
if (apply) for (const name of paths) owners(join(root, name));
if (apply && activeRuns(join(root, 'executions.sqlite'))) throw Error('仍有在途执行，迁移前须先核对并清空');
const grouping = JSON.parse(await readFile(groupingPath, 'utf8')) as SkillConnectionGrouping;
const current = JSON.parse(await readFile(inventoryPath, 'utf8')) as LegacyConnectionInventory;
const earlier = JSON.parse(await readFile(historyPath, 'utf8')) as LegacyConnectionInventory;
if (current.dataRoot !== root || earlier.dataRoot !== root) throw Error('清单不属于当前实例');
verifyInventory(root, current);
const privateRoot = join(root, 'verification');
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
const trial = await mkdtemp(join(privateRoot, 'cardgame-skill-'));
const trialHashes = {
  state: await snapshot(join(root, 'state.sqlite'), join(trial, 'state.sqlite')),
  executions: await snapshot(join(root, 'executions.sqlite'), join(trial, 'executions.sqlite')),
};
verifyInventory(trial, current);
const trialResult = await convertAt(trial, current, [earlier], grouping);
await writeFile(join(trial, 'result.json'), JSON.stringify({ trial: true, source: root, hashes: trialHashes, result: trialResult }, null, 2), { mode: 0o600 });
if (!apply) { console.log(JSON.stringify({ trial, relations: trialResult.relations.length, legacyRuns: trialResult.legacyRuns })); process.exit(0); }

for (const name of paths) owners(join(root, name));
if (await stat(join(root, 'skill-connections')).catch(() => undefined)) throw Error('实例已有 Skill 连线源码目录，不能重复正式迁移');
verifyInventory(root, current);
if (await stat(backupDir!).then(() => true, error => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
  throw error;
})) throw Error('备份目录已存在，请选择一个新的空路径');
await mkdir(dirname(backupDir!), { recursive: true, mode: 0o700 });
await mkdir(backupDir!, { mode: 0o700 });
const manifest: { phase: string; source: string; trial: string; files: Record<string, string>; result?: unknown; error?: string } =
  { phase: 'backing-up', source: root, trial, files: {} };
const save = () => writeFile(join(backupDir!, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
await save();
try {
  for (const name of paths) manifest.files[name] = await snapshot(join(root, name), join(backupDir!, name));
  await writeFile(join(backupDir!, 'inventory.json'), JSON.stringify(current, null, 2), { mode: 0o600 });
  await writeFile(join(backupDir!, 'grouping.json'), JSON.stringify(grouping, null, 2), { mode: 0o600 });
  manifest.phase = 'converting'; await save();
  const result = await convertAt(root, current, [earlier], grouping);
  manifest.phase = 'complete'; manifest.result = result; await save();
  console.log(JSON.stringify({ complete: true, backupDir, relations: result.relations.length, legacyRuns: result.legacyRuns }));
} catch (error) {
  if (manifest.phase === 'backing-up') {
    manifest.phase = 'backup-failed'; manifest.error = error instanceof Error ? error.message : String(error); await save();
    throw error;
  }
  manifest.phase = 'restoring'; manifest.error = error instanceof Error ? error.message : String(error); await save();
  await rm(join(root, 'skill-connections'), { recursive: true, force: true });
  for (const name of paths) {
    await rm(join(root, name + '-wal'), { force: true });
    await rm(join(root, name + '-shm'), { force: true });
    await copyFile(join(backupDir!, name), join(root, name)); validate(join(root, name));
  }
  manifest.phase = 'restored'; await save();
  throw error;
}
