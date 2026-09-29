import { describe, expect, mock, test } from 'bun:test';
import type { BattleContext } from '../../context/BattleContext';
import type { CardSprite } from '../../objects/CardSprite';
import { CombatManager } from './CombatManager';

function unit(id: string, health: number, effects: object[] = []): CardSprite {
    const data = { id, name: id, attack: 4, health, effects };
    return {
        active: true,
        getCardData: () => data,
        updateStats: mock(() => {}),
        updateStatusDisplay: mock(() => {}),
    } as unknown as CardSprite;
}

function fixture() {
    const callbacks: Array<(target: CardSprite, damage: number) => void> = [];
    const fieldKill = mock(() => {});
    const executeEffect = mock((..._args: unknown[]) => {});
    const attacker = unit('ally', 8, [
        { timing: 'onKill', target: { scope: 'self' }, actions: [{ type: 'heal', value: 5 }] },
        { timing: 'turnStart', target: { scope: 'self' }, actions: [{ type: 'heal', value: 1 }] },
    ]);
    const target = unit('enemy', 3);
    const scene = { playerField: [attacker], enemyField: [target] };
    const context = {
        scene,
        battleLog: { addLog: mock(() => {}) },
        animationManager: { addAttackAnimation: mock((
            _attacker: CardSprite, _target: CardSprite, _damage: number, _delay: number,
            callback: (target: CardSprite, damage: number) => void,
        ) => callbacks.push(callback)) },
        statusManager: {
            processDamage: mock((_id: string, amount: number) => amount),
            getUnitStatuses: mock(() => []),
        },
        fieldManager: { onPlayerUnitKill: fieldKill },
        effectResolver: { executeEffect },
    } as unknown as BattleContext;
    return { manager: new CombatManager(context), context, callbacks, attacker, target, fieldKill, executeEffect, scene };
}

describe('CombatManager onKill', () => {
    test('a lethal player attack triggers its unit and field effects once', () => {
        const f = fixture();
        f.manager.performSingleAttack(f.attacker, f.target, 4);
        expect(f.callbacks).toHaveLength(1);
        f.callbacks[0]!(f.target, 4);
        f.callbacks[0]!(f.target, 4);

        expect(f.target.getCardData().health).toBe(0);
        expect(f.fieldKill).toHaveBeenCalledTimes(1);
        expect(f.fieldKill).toHaveBeenCalledWith(f.attacker, f.scene.playerField, f.scene.enemyField);
        expect(f.executeEffect).toHaveBeenCalledTimes(1);
        expect(f.executeEffect.mock.calls[0]?.[1]).toMatchObject({
            triggerUnit: f.attacker,
            attackTarget: f.target,
            playerField: f.scene.playerField,
            enemyField: f.scene.enemyField,
        });
    });

    test('armor or a surviving target does not trigger kill effects', () => {
        const f = fixture();
        (f.context.statusManager.processDamage as ReturnType<typeof mock>).mockReturnValue(0);
        f.manager.performSingleAttack(f.attacker, f.target, 10);
        f.callbacks[0]!(f.target, 10);
        expect(f.target.getCardData().health).toBe(3);
        expect(f.fieldKill).not.toHaveBeenCalled();
        expect(f.executeEffect).not.toHaveBeenCalled();
    });

    test('enemy unit kills can trigger their own effect without the player field', () => {
        const f = fixture();
        f.scene.playerField = [f.target];
        f.scene.enemyField = [f.attacker];
        f.manager.performSingleAttack(f.attacker, f.target, 4);
        f.callbacks[0]!(f.target, 4);
        expect(f.fieldKill).not.toHaveBeenCalled();
        expect(f.executeEffect).toHaveBeenCalledTimes(1);
        expect(f.executeEffect.mock.calls[0]?.[1]).toMatchObject({
            playerField: f.scene.enemyField,
            enemyField: f.scene.playerField,
        });
    });
});
