import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { CoreStore } from '../../../src/core/store';
import { NoteContracts } from '../../../src/note-contract';
import { SkillConnectionRegistry } from '../../../src/skill-connection-model';
import { SkillConnectionSources } from '../../../src/skill-connection-source';
import { SkillConnectionLifecycle } from '../../../src/skill-connection-lifecycle';
import { reconcileLegacyRunHistory } from '../../../src/skill-connection-legacy-history';
import { recordLegacySkillRuns } from '../../../src/skill-connection-migration';
import { cardgameSkillKind, seedCardgameSkill, selectCardgameGrants } from './skill-recipes';
import type { LegacyConnectionInventory } from '../../../scripts/legacy-connection-inventory';
import type { SkillConnectionPlan } from '../../../scripts/plan-skill-connections';
import type { CardgameNotes, CardgameSkillKind } from '../connections';
import { recordSkillConnectionChange } from '../../../src/skill-connection-change';

const mapKey = (id: string) => 'skill-legacy-map:' + createHash('sha256').update(id).digest('hex');

export interface CardgameSkillConversionInput {
  dataRoot: string;
  packageRoot?: string;
  inventory: LegacyConnectionInventory;
  history: LegacyConnectionInventory[];
  plan: SkillConnectionPlan;
}

/** Legacy endpoints, not node order or display names, identify the reviewed roles. */
function legacyRoles(kind: CardgameSkillKind, connections: LegacyConnectionInventory['connections']): Partial<CardgameNotes> {
  const notes: Partial<CardgameNotes> = {};
  const assign = (role: keyof CardgameNotes, noteId: string) => {
    if (notes[role] !== undefined && notes[role] !== noteId) throw new Error(`CardGame 旧连线的 ${role} 节点不唯一`);
    notes[role] = noteId;
  };
  const edge = (suffix: string, from: keyof CardgameNotes, to: keyof CardgameNotes) => {
    const matches = connections.filter(connection => connection.id.endsWith(`/${suffix}`));
    if (matches.length !== 1) throw new Error(`CardGame 旧连线缺少唯一的 ${suffix} 身份`);
    assign(from, matches[0]!.spec.from.noteId);
    assign(to, matches[0]!.spec.to.noteId);
  };
  switch (kind) {
    case 'todo-desk': edge('todoResult', 'execution', 'todo'); edge('repair', 'todo', 'execution'); break;
    case 'desk-preview': edge('preview', 'execution', 'preview'); edge('repair', 'preview', 'execution'); break;
    case 'production-desk': edge('productionResult', 'execution', 'production'); edge('production', 'production', 'execution'); break;
    case 'production-assets': edge('assetCandidates', 'production', 'assets'); edge('adoptAsset', 'production', 'assets'); break;
    case 'todo-production': edge('productionRequest', 'todo', 'production'); break;
    case 'desk-references':
      edge('knowledge', 'knowledge', 'execution'); edge('cards', 'cards', 'execution');
      edge('assets', 'assets', 'execution'); edge('tracker', 'tracker', 'execution'); break;
    case 'production-references': edge('knowledge', 'knowledge', 'production'); edge('references', 'assets', 'production'); break;
  }
  return notes;
}

/** Converts only the seven reviewed CardGame groups; never dispatches node work. */
export async function convertCardgameSkillConnections(core: CoreStore, input: CardgameSkillConversionInput) {
  const { inventory, plan } = input;
  if (plan.capturedAt !== inventory.capturedAt || plan.deferred.length || plan.retired.length || plan.orphanRunIds.length)
    throw new Error('CardGame 迁移计划过期、有未确定旧线或孤立运行记录');
  if (inventory.schedules.some(schedule => schedule.value.target?.connectionId))
    throw new Error('存在尚未转换的旧连线定时计划');
  const old = new Map(inventory.connections.map(connection => [connection.id, connection]));
  const covered = new Set(plan.groups.flatMap(group => group.oldIds));
  if (covered.size !== old.size || [...covered].some(id => !old.has(id)))
    throw new Error('CardGame 旧连线清单与分组计划不一致');
  const kinds = plan.groups.map(group => cardgameSkillKind(group.oldIds));
  if (kinds.length !== 7 || new Set(kinds).size !== 7) throw new Error('CardGame 需要七类不重复的 Skill 关系');

  const contracts = new NoteContracts(core, input.dataRoot);
  const registry = new SkillConnectionRegistry(core, contracts);
  const sources = new SkillConnectionSources(input.dataRoot);
  const lifecycle = new SkillConnectionLifecycle(core, contracts, registry, sources);
  const runs = reconcileLegacyRunHistory(inventory, input.history);
  const outputs: Array<{ id: string; kind: string; enabled: boolean; oldIds: number; runs: number; skill?: string; warning?: string }> = [];
  for (const [index, group] of plan.groups.entries()) {
    const kind = kinds[index]!;
    const head = old.get(group.id);
    if (!head) throw new Error(`找不到旧关系身份 ${group.id}`);
    let relation = await registry.importLegacy({ id: group.id, expectedRevision: head.revision,
      nodeIds: group.nodeIds, name: group.name, goal: group.goal });
    await sources.createDraft(relation.id);
    let grants: ReturnType<typeof selectCardgameGrants> | undefined, warning: string | undefined;
    try {
      const notes = legacyRoles(kind, group.oldIds.map(id => old.get(id)!));
      if (group.nodeIds.some(noteId => !Object.values(notes).includes(noteId))) throw new Error('旧连线含有未核对角色的节点');
      grants = selectCardgameGrants(kind, relation, notes);
    } catch (error) {
      warning = `连线「${group.name}」保留为停用草稿，需要显式核对授权：${error instanceof Error ? error.message : String(error)}`;
      await recordSkillConnectionChange(core, {connectionId: relation.id, revision: relation.revision,
        status: 'failed', title: '迁移连线等待选择公开能力', error: warning});
    }
    if (grants) {
      relation = await lifecycle.updateDraft(relation.id, relation.revision, {grants});
      await seedCardgameSkill(kind, relation, sources, input.packageRoot ? resolve(input.packageRoot, 'templates/skill-connections') : undefined);
      if (group.enabled) relation = await lifecycle.activate(relation.id, relation.revision);
    }
    const legacyRuns = group.oldIds.flatMap(id => runs.get(id) ?? []);
    await recordLegacySkillRuns(core, relation.id, legacyRuns);
    for (const oldId of group.oldIds)
      await core.writeRecord('records', mapKey(oldId), { schemaVersion: 1, oldId, status: 'converted', relationId: relation.id }, { expectedRevision: null });
    outputs.push({ id: relation.id, kind, enabled: relation.enabled, oldIds: group.oldIds.length,
      runs: legacyRuns.length, skill: relation.activeSkill?.version, ...(warning ? {warning} : {}) });
  }
  for (const group of plan.groups) for (const id of group.oldIds.filter(id => id !== group.id))
    await core.deleteRecord('connections', id, { expectedRevision: old.get(id)!.revision });
  for (const key of inventory.connectionRecordKeys) {
    const record = await core.readRecord('records', key);
    if (record) await core.deleteRecord('records', key, { expectedRevision: record.revision });
  }
  const live = await registry.list();
  if (live.length !== 7 || live.filter(item => item.enabled).length !== outputs.filter(item => item.enabled).length
    || (await core.listRecords('connections')).some(row => (row.value as { schemaVersion?: number }).schemaVersion !== 2))
    throw new Error('CardGame 转换后关系数量或格式不一致');
  return { relations: outputs, warnings: outputs.flatMap(row => row.warning ? [row.warning] : []), legacyRuns: outputs.reduce((sum, row) => sum + row.runs, 0) };
}
