import { expect, mock, test } from 'bun:test';
import type { CardSprite } from '../../objects/CardSprite';
import type { StatusManager } from './StatusManager';
import type { BattleLog } from '../../ui/battle/BattleLog';
import type { BattleAnimationManager } from './BattleAnimationManager';
import { BattleStatusController } from './BattleStatusController';
import { getUnitStateId } from './unitIdentity';

test('two copies of a card keep separate statuses and damage processing', () => {
    const units = ['copy-one', 'copy-two'].map(battleInstanceId => ({
        battleInstanceId, getCardData: () => ({ id: 'CR_001', health: 2 }), updateStatusDisplay: mock(() => {}),
    }) as unknown as CardSprite);
    const applyStatus = mock((_id: string, ..._args: unknown[]) => true);
    const getUnitStatuses = mock((_id: string) => []);
    const controller = new BattleStatusController({ applyStatus, getUnitStatuses } as unknown as StatusManager,
        {} as BattleLog, {} as BattleAnimationManager);
    controller.applyStatusToUnit('CR_001', 'armor', 5, units[0]);
    controller.applyStatusToUnit('CR_001', 'poison', 2, units[1]);
    expect(applyStatus.mock.calls.map(call => call[0])).toEqual(['copy-one', 'copy-two']);
    expect(getUnitStatuses.mock.calls.map(call => call[0])).toEqual(['copy-one', 'copy-two']);
    expect(getUnitStateId(units[0])).not.toBe(getUnitStateId(units[1]));
});
