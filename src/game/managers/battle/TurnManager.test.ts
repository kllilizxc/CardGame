import { expect, mock, test } from 'bun:test';
import type { Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import type { BattleContext } from '../../context/BattleContext';
import { BattleState } from '../../state/BattleState';
import { TurnManager, type TurnManagerContext } from './TurnManager';

function unit(id: string): CardSprite {
    return { getCardData: () => ({ id, health: 2 }) } as CardSprite;
}

function fixture(enemies: CardSprite[]) {
    const state = new BattleState();
    state.enemyField = enemies;
    const delayedCall = mock((_delay: number, callback: () => void) => callback());
    const log = mock(() => {});
    const context = {
        playerField: state.playerField,
        enemyField: state.enemyField,
        playerHealth: state.playerHealth,
        isPlayerTurn: true,
        isProcessingTurn: false,
        turnNumber: 1,
        onPlayerDamaged: mock(() => {}),
        onRemoveUnit: mock(() => {}),
        onApplyPlayerTurnEndEffects: mock(() => {}),
        onSetIsPlayerTurn: mock((value: boolean) => { state.isPlayerTurn = value; }),
        onSetTurnNumber: mock((value: number) => { state.turnNumber = value; }),
        onSetIsProcessingTurn: mock(() => {}),
        onEnablePlayerInteraction: mock(() => {}),
        onDisablePlayerInteraction: mock(() => {}),
        onArrangeField: mock(() => {}),
        onDrawCard: mock(() => {}),
        combatManager: { resolveCombat: mock(() => 0) },
    } as unknown as TurnManagerContext;
    const battleContext = {
        battleState: state,
        battleTickManager: { tick: mock(() => {}) },
        battleLog: { addLog: log },
        battleStatusController: { triggerTurnStartStatuses: mock(() => {}) },
        effectManager: { showTurnAnimation: mock((_text: string, _color: number, callback: () => void) => callback()) },
    } as unknown as BattleContext;
    const scene = { time: { delayedCall } } as unknown as Scene;
    return { state, context, battleContext, delayedCall, log, manager: new TurnManager(scene, battleContext) };
}

test('a final kill ends combat without starting a stale enemy turn', () => {
    const defeated = unit('defeated');
    const f = fixture([defeated]);
    f.context.combatManager.resolveCombat = mock((_player: boolean, _allies: CardSprite[], _enemies: CardSprite[],
        _damage: (amount: number) => void, done?: () => void) => {
        f.state.enemyField = [];
        done?.();
        return 0;
    });
    f.manager.executePlayerTurn(f.context);
    expect(f.battleContext.battleTickManager.tick).toHaveBeenCalledTimes(1);
    expect(f.context.onSetIsPlayerTurn).not.toHaveBeenCalled();
    expect(f.delayedCall).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalledWith('═══ 敌人回合开始 ═══');
});

test('a surviving enemy turn receives the updated field, excluding defeated units', () => {
    const defeated = unit('defeated'), survivor = unit('survivor');
    const f = fixture([defeated, survivor]);
    const combatCalls: Array<{ player: boolean; enemies: CardSprite[] }> = [];
    f.context.combatManager.resolveCombat = mock((player: boolean, _allies: CardSprite[], enemies: CardSprite[],
        _damage: (amount: number) => void, done?: () => void) => {
        combatCalls.push({ player, enemies });
        if (player) {
            f.state.enemyField = [survivor];
            done?.();
        }
        return 0;
    });
    f.manager.executePlayerTurn(f.context);
    expect(combatCalls).toEqual([
        { player: true, enemies: [defeated, survivor] },
        { player: false, enemies: [survivor] },
    ]);
});
