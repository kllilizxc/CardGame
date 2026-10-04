import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOfficialRoleSource } from '../scripts/install-cardgame-workbench';
import { officialSourceHash } from '../src/runtime/official-artifacts';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

test('fresh official note is preserved without a source receipt, and a changed source is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cardgame-official-note-'));
  roots.push(root);
  const source = join(root, 'view.tsx');
  await writeFile(source, 'export default function View() { return null; }');
  const marker = { key: 'knowledge', hash: await officialSourceHash(root) };
  const expected = { template: 'knowledge', actions: ['addResource'] };
  expect(await isOfficialRoleSource({ codePath: root, officialTemplate: marker }, expected, '知识库')).toBe(true);
  await writeFile(source, 'export default function View() { return 1; }');
  await expect(isOfficialRoleSource({ codePath: root, officialTemplate: marker }, expected, '知识库')).rejects.toThrow('官方源码与记录不一致');
  await expect(isOfficialRoleSource({ codePath: root, officialTemplate: { ...marker, key: 'todo' } }, expected, '知识库')).rejects.toThrow('官方来源与角色不符');
});

test('custom CardGame notes can replace a new generic data note but an official receipt is preserved', async () => {
  expect(await isOfficialRoleSource({ officialTemplate: { key: 'data-note', hash: 'a'.repeat(64) } }, undefined, '卡牌库')).toBe(false);
  expect(await isOfficialRoleSource({ code: { files: [{ path: 'worka-source.json', content: JSON.stringify({ kind: 'official-note', template: 'knowledge' }) }] } }, { template: 'knowledge', actions: ['addResource'] }, '知识库')).toBe(true);
});
