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
        battleStatusController: { triggerTurnStartStatuses: mock(() => {}), triggerTurnEndStatuses: mock(() => {}) },
        effectResolver: { clearTurnAttackMods: mock(() => {}) },
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

test('ending the turn disables player input before any turn effects or attacks', () => {
    const f = fixture([unit('enemy')]);
    const steps: string[] = [];
    f.context.onSetIsProcessingTurn = mock(() => steps.push('lock'));
    f.context.onDisablePlayerInteraction = mock(() => steps.push('disable'));
    f.context.onApplyPlayerTurnEndEffects = mock(() => steps.push('effects'));
    f.context.combatManager.resolveCombat = mock(() => { steps.push('combat'); return 0; });
    f.manager.endTurn(f.context);
    expect(steps).toEqual(['lock', 'disable', 'effects', 'combat']);
});

test('enemy turn-end effects retain enemy ownership until the next player turn', () => {
    const f = fixture([unit('enemy')]);
    f.state.isPlayerTurn = false;
    const sides: boolean[] = [];
    f.battleContext.fieldManager = { onTurnEnd: mock((side: boolean) => sides.push(side)), onTurnStart: mock(() => {}) } as unknown as BattleContext['fieldManager'];
    f.context.combatManager.resolveCombat = mock((_side: boolean, _allies: CardSprite[], _enemies: CardSprite[],
        _damage: (amount: number) => void, done?: () => void) => { done?.(); return 0; });
    f.manager.executeEnemyTurn(f.context);
    expect(sides).toEqual([false]);
    expect(f.state.isPlayerTurn).toBe(true);
    expect(f.state.turnNumber).toBe(2);
});

test('turn effects run only for the acting side and player skill uses reset each turn', () => {
    const ally = Object.assign(unit('ally'), { active: true });
    const enemy = Object.assign(unit('enemy'), { active: true });
    const f = fixture([enemy]);
    f.state.playerField.push(ally);
    const apply = mock((_unit: CardSprite, _timing: string) => {});
    Object.assign(f.battleContext, { combatManager: { applyUnitTimingEffects: apply } });
    f.context.onPlayerTurnStart = mock(() => {});
    f.manager.startPlayerTurn(f.context);
    expect(apply).toHaveBeenCalledWith(ally, 'turnStart');
    expect(apply).not.toHaveBeenCalledWith(enemy, 'turnStart');
    expect(f.context.onPlayerTurnStart).toHaveBeenCalledTimes(1);
    apply.mockClear();
    f.state.isPlayerTurn = false;
    f.manager.startEnemyTurn(f.context);
    expect(apply).toHaveBeenCalledWith(enemy, 'turnStart');
    expect(apply).not.toHaveBeenCalledWith(ally, 'turnStart');
});

test('lethal turn-start effects finish battle before drawing or unlocking player input', () => {
    const f = fixture([unit('enemy')]);
    f.battleContext.battleStatusController.triggerTurnStartStatuses = mock(() => { f.state.playerHealth = 0; });
    f.manager.startPlayerTurn(f.context);
    expect(f.context.onDrawCard).not.toHaveBeenCalled();
    expect(f.context.onEnablePlayerInteraction).not.toHaveBeenCalled();
    expect(f.context.onSetIsProcessingTurn).not.toHaveBeenCalledWith(false);
});

test('holding a unit at the gate skips its auto attack but leaves it on the field to defend', () => {
    const enemy = unit('enemy');
    const holding = unit('holding');
    const striking = unit('striking');
    const f = fixture([enemy]);
    f.state.playerField = [holding, striking];
    f.context.shouldUnitAutoAttack = (unit) => unit !== holding;
    const fields: CardSprite[][] = [];
    f.context.combatManager.resolveCombat = mock((player: boolean, allies: CardSprite[], _enemies: CardSprite[],
        _damage: (amount: number) => void, done?: () => void) => {
        fields.push(allies);
        if (player) done?.();
        return 0;
    });
    f.manager.executePlayerTurn(f.context);
    expect(fields).toEqual([[striking], [holding, striking]]);
});
