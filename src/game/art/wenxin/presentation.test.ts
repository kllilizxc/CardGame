import { describe, expect, test } from 'bun:test';
import { BATTLE_SLOTS, project, slotPosition, unitArt } from './presentation';
import units from '../../../../public/data/cards/units.json';

describe('wenxin game presentation', () => {
    test('every shipped unit has a deliberate illustration mapping', () => {
        for (const card of units.units) expect(unitArt(card.id)).toBeDefined();
        expect(unitArt('future_unknown_beast')).toBeUndefined();
        expect(unitArt('CR_005')).toBe('turtle');
        expect(unitArt('CR_007')).toBe('wolf');
    });
    test('preserves prototype perspective and mirrored sides', () => {
        for (let i = 0; i < 3; i++) {
            const me = slotPosition('me', i), foe = slotPosition('foe', i);
            expect(me.x + foe.x).toBeCloseTo(640);
            expect(me.y).toBeCloseTo(foe.y);
        }
        expect(slotPosition('me', 0).y).toBeGreaterThan(slotPosition('me', 2).y);
        expect(slotPosition('me', 0).x).toBeCloseTo(444.137931);
    });
    test('camera movement projects the same world slots without mutating their identity', () => {
        const before = JSON.stringify(BATTLE_SLOTS);
        const rest = slotPosition('me', 0), focus = slotPosition('me', 0, { x: 3, z: 6 });
        expect(focus.y).toBeGreaterThan(rest.y);
        expect(JSON.stringify(BATTLE_SLOTS)).toBe(before);
        expect(project(0, 0).x).toBe(320);
    });
});
