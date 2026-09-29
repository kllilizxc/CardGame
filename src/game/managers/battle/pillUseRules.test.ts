import { expect, test } from 'bun:test';
import type { PillCard } from '../../../../public/data/types/cards/pill';
import { BattleState } from '../../state/BattleState';
import { canUsePillAtHealth } from './pillUseRules';

const healingPill = {
    target: 'player',
    effects: [{ actions: [{ type: 'healPlayer', value: 5 }] }],
} as PillCard;

test('a pure healing pill stays in its slot at full health; other actions remain usable', () => {
    const state = new BattleState();
    expect(canUsePillAtHealth(healingPill, state)).toBe(false);
    expect(canUsePillAtHealth({ ...healingPill, effects: [{ actions: [{ type: 'drawCards', value: 1 }] }] } as PillCard, state)).toBe(true);
    state.damagePlayer(1);
    expect(canUsePillAtHealth(healingPill, state)).toBe(true);
});

test('healing reports actual restored health and respects the maximum', () => {
    const state = new BattleState();
    state.damagePlayer(4);
    expect(state.healPlayer(5)).toBe(4);
    expect(state.playerHealth).toBe(100);
    expect(state.healPlayer(5)).toBe(0);
    state.reset();
    expect(state.playerHealth).toBe(state.maxPlayerHealth);
});
