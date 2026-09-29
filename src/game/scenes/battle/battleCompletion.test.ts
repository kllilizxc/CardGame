import { describe, expect, it } from 'bun:test';

import type { BattleLaunchPayload } from '../../types/expedition';
import { createActiveRunRouteKey } from '../../services/RunPersistence';
import { createExpeditionBattleCompleteEvent } from './battleCompletion';

const WORLD_MAP_TEST_TARGET_IDENTITY = {
    expeditionId: 'phase01-first-playable-expedition',
    mapId: 'phase01-prototype-map',
};

const battlePayload: BattleLaunchPayload = {
    runId: 'run-test-001',
    nodeId: 'battle.mist-foxes',
    nodeType: 'battle',
    encounterId: 'test_encounter_01',
    encounterResourceId: 'test_encounter_01',
    encounterFile: 'data/encounters/test-enemy.json',
    runDeck: [{ id: 'SX_YJZ_001', count: 1 }],
    targetConfig: {
        routeKey: createActiveRunRouteKey(WORLD_MAP_TEST_TARGET_IDENTITY),
        expeditionId: 'phase01-first-playable-expedition',
        mapId: 'phase01-prototype-map',
        worldStateFile: 'data/world/initial-state.json',
        starterDeckFile: 'data/decks/starter-deck.json',
        mapFile: 'data/mijing/prototype-map.json',
        eventsFile: 'data/mijing/prototype-events.json',
        shopFile: 'data/mijing/prototype-shop.json',
    },
};

const bossPayload: BattleLaunchPayload = {
    ...battlePayload,
    nodeId: 'boss.sealed-guardian',
    nodeType: 'boss',
    encounterId: 'mijing_boss_01',
    encounterFile: 'data/encounters/mijing-boss.json',
};

describe('createExpeditionBattleCompleteEvent', () => {
    it('emits battle-victory for normal encounter wins', () => {
        expect(createExpeditionBattleCompleteEvent(battlePayload, true, '2026-05-08T01:00:00.000Z')).toEqual({
            runId: 'run-test-001',
            nodeId: 'battle.mist-foxes',
            nodeType: 'battle',
            encounterId: 'test_encounter_01',
            encounterResourceId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            victory: true,
            outcome: 'battle-victory',
            completedAt: '2026-05-08T01:00:00.000Z',
            targetConfig: battlePayload.targetConfig,
        });
    });

    it('emits boss-clear for boss wins and defeat for any loss', () => {
        expect(createExpeditionBattleCompleteEvent(bossPayload, true, '2026-05-08T01:00:00.000Z').outcome).toBe('boss-clear');
        expect(createExpeditionBattleCompleteEvent(bossPayload, false, '2026-05-08T01:00:00.000Z').outcome).toBe('defeat');
    });

    it('leaves encounterResourceId absent in completion events for legacy payloads', () => {
        const { encounterResourceId: _omitted, ...legacyPayload } = battlePayload;

        expect(createExpeditionBattleCompleteEvent(legacyPayload, true, '2026-05-08T01:00:00.000Z')).not.toHaveProperty(
            'encounterResourceId',
        );
    });
});
