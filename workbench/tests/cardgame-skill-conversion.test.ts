import { asRecordStorage } from './fixtures/record-storage';
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CoreStore } from '../src/core/store';
import { describeCapabilities } from '@dsh-workbench/runtime';
import type { JsonValue } from '@dsh-workbench/runtime';
import { convertCardgameSkillConnections } from '../plugins/cardgame-content/src/skill-conversion';
import { planSkillConnections } from '../scripts/plan-skill-connections';
import type { LegacyConnectionInventory } from '../scripts/legacy-connection-inventory';

test.each(['complete', 'missing-capability', 'ambiguous-role'] as const)('offline CardGame conversion preserves explicit grants and history (%s)', async mode => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'cardgame-conversion-'));
  const core = await CoreStore.open(asRecordStorage({ loadAll: async () => ({ tables: {}, global: null }), putRecord: async () => {}, deleteRecord: async () => {}, close: async () => {} }));
  const templates = resolve(import.meta.dirname, '../templates');
  const roles = {
    todo: 'cardgame-todo', desk: 'execution-note', preview: 'candidate-preview',
    production: 'cardgame-production', assets: 'cardgame-library',
    knowledge: 'cardgame-library', cards: 'cardgame-library', tracker: 'feature-progress',
  } as const;
  try {
    for (const [id, template] of Object.entries(roles)) {
      const directory = join(templates, template);
      const contract = describeCapabilities(await import(join(directory, 'actions.ts')));
      if (mode === 'missing-capability' && id === 'production') contract.actions = contract.actions.filter(action => action.name !== 'recordCandidates');
      const codeVersion = id + '-v1';
      await core.createNote({ id, name: id, desktopId: 'cardgame' }, {});
      await core.updateNote(id, { activeDirectory: directory, codeVersion,
        actions: contract.actions.map(action => action.name), capabilityContract: { ...contract, codeVersion } as unknown as JsonValue });
    }
    const edges = [
      ['todo/repair', 'todo', 'desk'], ['desk/todoResult', 'desk', 'todo'],
      ['desk/preview', 'desk', 'preview'], ['preview/repair', 'preview', 'desk'],
      ['production/production', 'production', 'desk'], ['desk/productionResult', 'desk', 'production'],
      ['production/assetCandidates', 'production', 'assets'], ['production/adoptAsset', 'production', 'assets'],
      ['todo/productionRequest', 'todo', 'production'],
      ['desk/knowledge', 'knowledge', 'desk'], ['desk/cards', 'cards', 'desk'],
      ['desk/assets', 'assets', 'desk'], ['desk/tracker', 'tracker', 'desk'],
      ['production/knowledge', 'knowledge', 'production'], ['production/references', 'assets', 'production'],
    ] as const;
    const connections: LegacyConnectionInventory['connections'] = [];
    for (const [id, from, to] of edges) {
      const spec = { id, ownerNoteId: id.split('/')[0], key: id.split('/')[1], from: { noteId: from },
        to: { noteId: mode === 'ambiguous-role' && id === 'production/adoptAsset' ? 'knowledge' : to, action: 'legacyAction' }, instruction: '保留原业务约定', enabled: true, watch: false, version: '1' } as any;
      const row = await core.writeRecord('connections', id, spec);
      connections.push({ id, revision: row.revision, updatedAt: row.updatedAt, spec,
        kind: 'handoff', trigger: 'manual', draft: false, schedules: [], runs: [{id: `run:${id}`, connection_id: id, status: 'completed',
          external_id: null, session_id: `session:${id}`, started_at: 1, finished_at: 2}], eventCount: 0 });
    }
    const notes = (await core.listNotes()).map(row => ({ ...row.value, id: row.key,
      desktopId: row.value.desktopId!, revision: row.revision }));
    const inventory: LegacyConnectionInventory = { schemaVersion: 1, capturedAt: 'fixture', dataRoot, notes, connections,
      schedules: [], connectionRecordKeys: [], orphanRunIds: [], unresolvedRunIds: [] };
    const group = (id: string, oldIds: string[]) => ({ id, oldIds, name: id, goal: '保留原业务身份并使用公开能力处理明确请求' });
    const grouping = { groups: [
      group('todo/repair', ['todo/repair', 'desk/todoResult']),
      group('desk/preview', ['desk/preview', 'preview/repair']),
      group('production/production', ['production/production', 'desk/productionResult']),
      group('production/assetCandidates', ['production/assetCandidates', 'production/adoptAsset']),
      group('todo/productionRequest', ['todo/productionRequest']),
      group('desk/knowledge', ['desk/knowledge', 'desk/cards', 'desk/assets', 'desk/tracker']),
      group('production/knowledge', ['production/knowledge', 'production/references']),
    ], retired: [] };
    const plan = planSkillConnections(inventory, grouping);
    const result = await convertCardgameSkillConnections(core, { dataRoot, inventory, history: [inventory], plan });
    expect(result.relations).toHaveLength(7);
    expect(result.relations.filter(row => row.enabled && row.skill)).toHaveLength(mode === 'complete' ? 7 : 6);
    expect(result.warnings).toHaveLength(mode === 'complete' ? 0 : 1);
    expect(result.legacyRuns).toBe(15);
    expect(result.relations.reduce((sum, row) => sum + row.oldIds, 0)).toBe(15);
    const rows = await core.listRecords<any>('connections');
    expect(rows).toHaveLength(7);
    expect(rows.every(row => row.value.schemaVersion === 2)).toBe(true);
    expect((await core.readRecord<any>('records', 'skill-legacy-map:unused'))).toBeUndefined();
    const todo = rows.find(row => row.key === 'todo/repair')!.value;
    expect(todo.grants.find((grant: any) => grant.noteId === 'todo').events).toEqual(['cardgame.todo.delegationRequested']);
    expect(todo.grants.find((grant: any) => grant.noteId === 'desk').events).toEqual(['tasks.changed']);
    expect(todo.activeSkill.trial.sampleCount).toBe(2);
    expect(todo.grants.find((grant: any) => grant.noteId === 'todo').actions).toEqual(['bindExecution', 'feedback']);
    expect(todo.grants.find((grant: any) => grant.noteId === 'todo').queries).toEqual(['todo']);
    const references = rows.find(row => row.key === 'desk/knowledge')!.value;
    expect(references.grants.every((grant: any) => !grant.actions.length && !grant.events.length)).toBe(true);
    expect(references.grants.find((grant: any) => grant.noteId === 'knowledge').queries).toEqual(['document']);
    expect(references.grants.find((grant: any) => grant.noteId === 'cards').queries).toEqual(['card']);
    const history = await core.listRecords<any>('records', {prefix: 'skill-legacy-run:'});
    expect(history).toHaveLength(15);
    expect(history.find(row => row.value.runId === 'run:production/adoptAsset')!.value).toMatchObject({
      connectionId: 'production/assetCandidates', oldConnectionId: 'production/adoptAsset', status: 'completed', sessionId: 'session:production/adoptAsset',
    });
    if (mode !== 'complete') {
      const waiting = rows.find(row => row.key === 'production/assetCandidates')!.value;
      expect(waiting.enabled).toBe(false);
      expect(waiting.activeSkill).toBeUndefined();
      expect(waiting.grants.every((grant: any) => !grant.queries.length && !grant.actions.length && !grant.events.length)).toBe(true);
      expect(result.warnings[0]).toContain('停用草稿');
      expect((await core.listRecords<any>('records', {prefix: 'skill-change:'})).some(row => row.value.connectionId === waiting.id && row.value.status === 'failed' && row.value.error?.includes('显式核对授权'))).toBe(true);
    }
  } finally {
    await core.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
}, 30_000);
