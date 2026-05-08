import { describe, expect, it } from 'bun:test';

import type { BattleLaunchPayload } from '../../types/expedition';
import {
    getBattleDeckStacks,
    getEncounterCacheKey,
    getEncounterFile,
    getEncounterUnits,
    normalizeBattleLaunchPayload,
} from './battleSceneLaunch';

const payload: BattleLaunchPayload = {
    runId: 'run-test-001',
    nodeId: 'battle.mist-foxes',
    nodeType: 'battle',
    encounterId: 'test_encounter_01',
    encounterFile: 'data/encounters/test-enemy.json',
    runDeck: [{ id: 'SX_YJZ_001', count: 1 }],
};

describe('battleSceneLaunch', () => {
    it('normalizes a complete expedition battle launch payload', () => {
        expect(normalizeBattleLaunchPayload(payload)).toEqual(payload);
        expect(normalizeBattleLaunchPayload({})).toBeNull();
    });

    it('falls back to starter deck and default encounter when no payload exists', () => {
        const starterDeck = { cards: [{ id: 'AR_001', count: 3 }] };

        expect(getBattleDeckStacks(null, starterDeck)).toEqual([{ id: 'AR_001', count: 3 }]);
        expect(getEncounterCacheKey(null)).toBe('currentEncounter');
        expect(getEncounterFile(null)).toBe('data/encounters/medium-enemy.json');
    });

    it('uses runDeck and a run-scoped encounter cache key for expedition launches', () => {
        const deck = getBattleDeckStacks(payload, { cards: [{ id: 'AR_001', count: 3 }] });

        expect(deck).toEqual([{ id: 'SX_YJZ_001', count: 1 }]);
        expect(deck).not.toBe(payload.runDeck);
        expect(getEncounterCacheKey(payload)).toBe('expeditionEncounter:run-test-001:battle.mist-foxes');
        expect(getEncounterFile(payload)).toBe('data/encounters/test-enemy.json');
    });

    it('accepts existing enemies arrays and prototype boss units arrays', () => {
        expect(getEncounterUnits({ enemies: [{ cardId: 'CR_001' }] })).toEqual([{ cardId: 'CR_001' }]);
        expect(getEncounterUnits({ units: [{ cardId: 'CR_002' }] })).toEqual([{ cardId: 'CR_002' }]);
    });
});
