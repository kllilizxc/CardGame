import { describe, expect, it } from 'bun:test';

import { getStatusDefinition } from '../../utils/StatusHelper';
import { StatusManager } from './StatusManager';

const runtimeStatusDefinitions = {
  statuses: [
    {
      id: 'catalog_runtime_armor',
      name: '目录护甲',
      description: '从 BattleScene runtime status.definitions 注入的护甲状态',
      category: 'buff',
      timing: 'onDamaged',
      effectType: 'reduceDamage',
      stackConsumeType: 'onDamage',
      baseValue: 1,
      affectedByArmor: false,
      icon: '🛡',
      color: '#3498db',
      stackable: true,
      maxStacks: 3,
    },
  ],
};

describe('StatusManager runtime status definitions', () => {
  it('initializes status lookup from preloaded runtime status.definitions data without changing apply semantics', async () => {
    const statusManager = new StatusManager();

    await statusManager.initialize(runtimeStatusDefinitions);

    expect(getStatusDefinition('catalog_runtime_armor')?.name).toBe('目录护甲');
    expect(statusManager.applyStatus('unit-1', 'catalog_runtime_armor', 5)).toBe(true);
    expect(statusManager.getStatus('unit-1', 'catalog_runtime_armor')).toEqual({
      statusId: 'catalog_runtime_armor',
      stacks: 3,
      duration: undefined,
      sourceId: undefined,
    });
    expect(statusManager.processDamage('unit-1', 2)).toBe(0);
    expect(statusManager.getStatus('unit-1', 'catalog_runtime_armor')?.stacks).toBe(1);
  });
});
