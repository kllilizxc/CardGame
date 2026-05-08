import { describe, expect, it } from 'bun:test';

import type { ExpeditionBattleCompleteEvent, RunSnapshot } from '../../types/expedition';
import {
    createRunAfterBattleVictory,
    getTerminalBattleOutcome,
    isTerminalBattleOutcome,
} from './runResultFlow';

function createActiveRun(): RunSnapshot {
    return {
        runId: 'run-test-001',
        expeditionId: 'phase01-first-playable-expedition',
        mapId: 'phase01-prototype-map',
        status: 'inProgress',
        currentNodeId: 'battle.mist-foxes',
        startingLoadout: {
            cards: [{ id: 'SX_YJZ_001', count: 1 }],
            items: [],
            spiritStones: 0,
        },
        carriedDeck: [{ id: 'SX_YJZ_001', count: 1 }],
        carriedItems: [],
        spiritStones: 12,
        visitedNodeIds: ['entrance.mountain-gate', 'battle.mist-foxes'],
        nodeStates: {
            'battle.mist-foxes': {
                nodeId: 'battle.mist-foxes',
                status: 'cleared',
                visited: true,
                rewardClaimed: false,
            },
        },
        pendingEncounter: {
            runId: 'run-test-001',
            nodeId: 'battle.mist-foxes',
            nodeType: 'battle',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            runDeck: [{ id: 'SX_YJZ_001', count: 1 }],
        },
        startedAt: '2026-05-08T00:00:00.000Z',
    };
}

function createBattleResult(outcome: ExpeditionBattleCompleteEvent['outcome']): ExpeditionBattleCompleteEvent {
    return {
        runId: 'run-test-001',
        nodeId: outcome === 'boss-clear' ? 'boss.sealed-guardian' : 'battle.mist-foxes',
        nodeType: outcome === 'boss-clear' ? 'boss' : 'battle',
        encounterId: outcome === 'boss-clear' ? 'mijing_boss_01' : 'test_encounter_01',
        encounterFile: outcome === 'boss-clear' ? 'data/encounters/mijing-boss.json' : 'data/encounters/test-enemy.json',
        victory: outcome !== 'defeat',
        outcome,
        completedAt: '2026-05-08T01:00:00.000Z',
    };
}

describe('runResultFlow', () => {
    it('detects defeat and boss-clear as terminal battle outcomes', () => {
        expect(isTerminalBattleOutcome(createBattleResult('defeat'))).toBe(true);
        expect(isTerminalBattleOutcome(createBattleResult('boss-clear'))).toBe(true);
        expect(isTerminalBattleOutcome(createBattleResult('battle-victory'))).toBe(false);
        expect(getTerminalBattleOutcome(createBattleResult('defeat'))).toBe('defeat');
        expect(getTerminalBattleOutcome(createBattleResult('boss-clear'))).toBe('boss-clear');
        expect(getTerminalBattleOutcome(createBattleResult('battle-victory'))).toBeNull();
    });

    it('turns a normal battle victory into a continued active run without terminal resolution', () => {
        const updatedRun = createRunAfterBattleVictory(createActiveRun(), createBattleResult('battle-victory'));

        expect(updatedRun.status).toBe('inProgress');
        expect(updatedRun.currentNodeId).toBe('battle.mist-foxes');
        expect(updatedRun.resolvedAt).toBeUndefined();
        expect(updatedRun.pendingEncounter).toBeNull();
        expect(updatedRun.nodeStates['battle.mist-foxes']).toEqual({
            nodeId: 'battle.mist-foxes',
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
        });
    });
});
