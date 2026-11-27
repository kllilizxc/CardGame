import { describe, expect, it, mock } from 'bun:test';
import { TalismanManager } from './TalismanManager';
import { EffectResolver } from './EffectResolver';

function fixture(scope = 'singleAlly', labelsAll = ['灵狐'], labelsAny: string[] = []) {
    const unit = (id: string, labels: string[]) => {
        const data = { id, name: id, labels, attack: 4, health: 2 };
        return { getCardData: () => data, updateStats: mock(() => {}) } as any;
    };
    const fox = unit('fox', ['灵狐']);
    const sword = unit('sword', ['剑修']);
    const enemy1 = unit('enemy1', ['灵狐']);
    const enemy2 = unit('enemy2', ['灵狐']);
    const state = { playerField: [fox, sword], enemyField: [enemy1, enemy2] };
    const bc: any = {
        battleState: state,
        battleLog: { addLog: mock(() => {}) },
        effectManager: {
            playTalismanUseAnimation: mock((_s: any, _t: any, done: () => void) => done()),
            showBuffEffect: mock(() => {}),
        },
    };
    bc.effectResolver = new EffectResolver(bc);
    const manager = new TalismanManager(bc);
    manager.setGameActionHandler({ getTargetsByScope: (s: string, target: any) =>
        s === 'allyUnits' ? state.playerField : [target] } as any);
    const data = { name: '狐影突袭', effects: [{ target: {
        scope, requiredLabelsAllOf: labelsAll, requiredLabelsAnyOf: labelsAny,
    }, actions: [{ type: 'modifyAttack', value: 3, duration: 'turn' }] }] };
    const spell: any = { scale: 1, getCardData: () => data,
        setScale: mock(() => {}), setDepth: mock(() => {}) };
    manager.startUseTalisman(spell);
    return { manager, bc, fox, sword, enemy1, enemy2 };
}

describe('TalismanManager — actual resolver integration', () => {
    it('rejects an ally without the required label and retains target selection', () => {
        const { manager, sword, bc } = fixture();
        expect(manager.useTalismanOnTarget(sword, 'ally')).toBe(false);
        expect(sword.getCardData().attack).toBe(4);
        expect(manager.isSelectingTargetMode()).toBe(true);
        expect(bc.effectManager.playTalismanUseAnimation).not.toHaveBeenCalled();
    });
    it('applies the turn buff through the shared resolver and restores base attack', () => {
        const { manager, fox, bc } = fixture();
        expect(manager.useTalismanOnTarget(fox, 'ally')).toBe(true);
        expect(fox.getCardData().attack).toBe(7);
        expect(manager.isSelectingTargetMode()).toBe(false);
        bc.effectResolver.clearTurnAttackMods();
        expect(fox.getCardData().attack).toBe(4);
    });
    it('rejects an enemy for a single ally effect', () => {
        const { manager, enemy1 } = fixture();
        expect(manager.useTalismanOnTarget(enemy1, 'enemy')).toBe(false);
        expect(enemy1.getCardData().attack).toBe(4);
    });
    it('keeps the selected enemy rather than defaulting to the first enemy', () => {
        const { manager, enemy1, enemy2 } = fixture('singleEnemy');
        expect(manager.useTalismanOnTarget(enemy2, 'enemy')).toBe(true);
        expect(enemy1.getCardData().attack).toBe(4);
        expect(enemy2.getCardData().attack).toBe(7);
    });
    it('filters all-target effects and requires any-label matches', () => {
        const { manager, fox, sword } = fixture('allyUnits', [], ['灵狐']);
        expect(manager.useTalismanOnTarget(fox, 'ally')).toBe(true);
        expect(fox.getCardData().attack).toBe(7);
        expect(sword.getCardData().attack).toBe(4);
    });
});
