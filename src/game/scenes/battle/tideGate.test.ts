import { expect, test } from 'bun:test';
import units from '../../../../public/data/cards/units.json';
import type { UnitCard } from '@data/types/cards/unit';
import { TideGate, TIDE_DRAGON_ID, TIDE_SCOUT_ID } from './tideGate';

const newScout = (): UnitCard => ({
    ...units.units.find(card => card.id === TIDE_SCOUT_ID),
}) as UnitCard;

test('opening recovers the exact sacrifice, spends the gate once, and skips only that dragon this turn', () => {
    const gate = new TideGate();
    const dragon = {};
    const anotherDragon = {};
    const tribute = newScout();
    const duplicate = newScout();
    const discard = [duplicate, tribute];
    gate.bindSacrifice(dragon, TIDE_DRAGON_ID, [tribute], 1);
    gate.bindSacrifice(anotherDragon, TIDE_DRAGON_ID, [duplicate], 1);
    expect(gate.canOpen(dragon, discard, false, 2)).toBe(false);
    expect(gate.canOpen(dragon, [duplicate], true, 2)).toBe(false);
    expect(gate.canOpen(dragon, discard, true, 1)).toBe(false);
    expect(gate.open(dragon, discard, true, 1)).toBeNull();
    expect(discard).toEqual([duplicate, tribute]);
    expect(gate.isCrossing(dragon, 1)).toBe(true);
    expect(gate.skipsAttack(dragon, 1)).toBe(true);
    expect(gate.skipsAttack(dragon, 2)).toBe(false);
    expect(gate.canOpen(dragon, discard, true, 2)).toBe(true);
    expect(gate.open(dragon, discard, true, 2)).toBe(tribute);
    expect(discard).toHaveLength(1);
    expect(discard[0]).toBe(duplicate);
    expect(gate.skipsAttack(dragon, 2)).toBe(true);
    expect(gate.skipsAttack(anotherDragon, 2)).toBe(false);
    expect(gate.skipsAttack(dragon, 3)).toBe(false);
    expect(gate.open(anotherDragon, discard, true, 3)).toBeNull();
});

test('unrelated summons cannot recover an earlier scout from the discard pile', () => {
    const gate = new TideGate();
    const tribute = newScout();
    const dragon = {};
    const anotherUnit = {};
    const normalTribute = { ...tribute, id: 'CR_009' };
    expect(gate.bindSacrifice(dragon, TIDE_DRAGON_ID, [normalTribute], 1)).toBe(false);
    expect(gate.bindSacrifice(anotherUnit, 'OTHER', [tribute], 1)).toBe(false);
    expect(gate.skipsAttack(dragon, 1)).toBe(false);
    expect(gate.canOpen(dragon, [tribute], true, 2)).toBe(false);
    expect(gate.canOpen(anotherUnit, [tribute], true, 2)).toBe(false);
});
