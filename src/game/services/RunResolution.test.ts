import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import worldMapJson from '../../../public/data/world/world-map.json';

import { ExpeditionState } from '../state/ExpeditionState';
import { validateWorldMapDefinition } from '../scenes/worldmap/worldMap';
import {
    loadActiveRun,
    loadPersistentStash,
    resetRunPersistenceForTests,
} from './RunPersistence';
import {
    resolveBattleDefeat,
    resolveBattleVictory,
    resolveBossClear,
    resolveExtract,
} from './RunResolution';

const DEFAULT_TARGET = {
    expeditionId: 'phase01-first-playable-expedition',
    mapId: 'phase01-prototype-map',
};

const SYNTHETIC_TARGET = {
    expeditionId: 'synthetic-expedition',
    mapId: 'synthetic-map',
};

function getCheckedInExpeditionTarget(destinationId: string): { expeditionId: string; mapId: string } {
    const worldMap = validateWorldMapDefinition(worldMapJson);
    const destination = worldMap.destinations.find((candidate) => candidate.id === destinationId);

    if (!destination || destination.kind !== 'expedition') {
        throw new Error(`Expected checked-in Expedition destination: ${destinationId}`);
    }

    return {
        expeditionId: destination.expeditionId,
        mapId: destination.mapId,
    };
}

function startRewardedRun(
    targetIdentity: { expeditionId: string; mapId: string } = DEFAULT_TARGET,
    rewardCardId = 'TL_002',
    entryNodeId = targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'entrance.mountain-gate' : 'entrance.synthetic',
): ExpeditionState {
    const state = ExpeditionState.bootstrap({
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
        targetIdentity,
    });

    state.createRunSnapshot({
        ...targetIdentity,
        entryNodeId,
    });

    state.applyNodeRewardPreview({
        cards: [{ id: rewardCardId, count: 1 }],
        items: [{ id: 'tool_talisman_basic', itemType: 'tool', count: 1 }],
        spiritStones: 18,
    });

    return state;
}

describe('RunResolution', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('defeat clears the active run and loses all carried run assets from the persistent stash', () => {
        startRewardedRun();

        const summary = resolveBattleDefeat({ finalNodeId: 'battle.mist-foxes' });
        const updatedStash = loadPersistentStash();

        expect(loadActiveRun()).toBeNull();
        expect(updatedStash?.deck).toEqual([]);
        expect(updatedStash?.items).toEqual([]);
        expect(updatedStash?.spiritStones).toBe(0);
        expect(summary.outcome).toBe('defeat');
        expect(summary.finalNodeId).toBe('battle.mist-foxes');
        expect(summary.kept).toEqual({ cards: [], items: [], spiritStones: 0 });
        expect(summary.lost.cards).toContainEqual({ id: 'TL_002', count: 1 });
        expect(summary.lost.items).toContainEqual({ id: 'tool_talisman_basic', itemType: 'tool', count: 1 });
        expect(summary.lost.spiritStones).toBe(54);
        expect(updatedStash?.lastRunSummary).toEqual(summary);
    });

    it('extract clears the active run and banks carried cards, items, and spiritStones without duplicating the starting loadout', () => {
        startRewardedRun();

        const summary = resolveExtract({ finalNodeId: 'extract.cliff-rope' });
        const updatedStash = loadPersistentStash();

        expect(loadActiveRun()).toBeNull();
        expect(updatedStash?.deck).toEqual([...starterDeckJson.cards, { id: 'TL_002', count: 1 }]);
        expect(updatedStash?.items).toEqual([
            ...initialWorldState.stash.items,
            { id: 'tool_talisman_basic', itemType: 'tool', count: 1 },
        ]);
        expect(updatedStash?.spiritStones).toBe(54);
        expect(summary.outcome).toBe('extract');
        expect(summary.kept.cards).toContainEqual({ id: 'TL_002', count: 1 });
        expect(summary.kept.items).toContainEqual({ id: 'tool_talisman_basic', itemType: 'tool', count: 1 });
        expect(summary.kept.spiritStones).toBe(54);
        expect(summary.lost).toEqual({ cards: [], items: [], spiritStones: 0 });
        expect(updatedStash?.lastRunSummary).toEqual(summary);
    });

    it('boss clear uses the boss-clear terminal label and allows a fresh run immediately after resolution', () => {
        const state = startRewardedRun();

        const summary = resolveBossClear({ finalNodeId: 'boss.sealed-guardian' });
        state.resetToEntranceState();
        const freshRun = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(summary.outcome).toBe('boss-clear');
        expect(summary.finalNodeId).toBe('boss.sealed-guardian');
        expect(loadActiveRun()?.runId).toBe(freshRun.runId);
        expect(freshRun.runId).not.toBe(summary.runId);
        expect(freshRun.carriedDeck).toContainEqual({ id: 'TL_002', count: 1 });
        expect(freshRun.carriedItems).toContainEqual({ id: 'tool_talisman_basic', itemType: 'tool', count: 1 });
        expect(freshRun.spiritStones).toBe(54);
    });

    it('terminal defeat clears only the matching target active run', () => {
        const defaultState = startRewardedRun(DEFAULT_TARGET, 'TL_002');
        const syntheticState = startRewardedRun(SYNTHETIC_TARGET, 'AR_001');
        const syntheticRunId = syntheticState.activeRun?.runId;

        const summary = resolveBattleDefeat({
            targetIdentity: DEFAULT_TARGET,
            finalNodeId: 'battle.mist-foxes',
        });

        expect(summary.runId).toBe(defaultState.activeRun?.runId);
        expect(loadActiveRun(DEFAULT_TARGET)).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRunId);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
    });

    it('extract and boss-clear terminal outcomes also clear only the matching target active run', () => {
        for (const scenario of [
            {
                outcome: 'extract' as const,
                finalNodeId: 'extract.cliff-rope',
                resolve: resolveExtract,
            },
            {
                outcome: 'boss-clear' as const,
                finalNodeId: 'boss.sealed-guardian',
                resolve: resolveBossClear,
            },
        ]) {
            resetRunPersistenceForTests();
            startRewardedRun(DEFAULT_TARGET, 'TL_002');
            const syntheticState = startRewardedRun(SYNTHETIC_TARGET, 'AR_001');
            const syntheticRunId = syntheticState.activeRun?.runId;

            const summary = scenario.resolve({
                targetIdentity: DEFAULT_TARGET,
                finalNodeId: scenario.finalNodeId,
            });

            expect(summary.outcome).toBe(scenario.outcome);
            expect(loadActiveRun(DEFAULT_TARGET)).toBeNull();
            expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRunId);
            expect(loadActiveRun(SYNTHETIC_TARGET)?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
        }
    });

    it('terminal resolution for the checked-in outer-mountain route leaves the checked-in jade-cave route active', () => {
        const outerMountainTarget = getCheckedInExpeditionTarget('destination.qingyun-outer-mountain-trial');
        const jadeCaveTarget = getCheckedInExpeditionTarget('destination.qingyun-jade-cave-trial');

        startRewardedRun(outerMountainTarget, 'TL_002', 'entrance.mountain-gate');
        const jadeCaveState = startRewardedRun(jadeCaveTarget, 'AR_001', 'entrance.mountain-gate');
        const jadeCaveRunId = jadeCaveState.activeRun?.runId;

        const summary = resolveExtract({
            targetIdentity: outerMountainTarget,
            finalNodeId: 'extract.cliff-rope',
        });

        expect(summary.outcome).toBe('extract');
        expect(loadActiveRun(outerMountainTarget)).toBeNull();
        expect(loadActiveRun(jadeCaveTarget)?.runId).toBe(jadeCaveRunId);
        expect(loadActiveRun(jadeCaveTarget)?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
    });

    it('battle victory persists the continued run under the same target identity', () => {
        const defaultState = startRewardedRun(DEFAULT_TARGET, 'TL_002');
        const syntheticState = startRewardedRun(SYNTHETIC_TARGET, 'AR_001');
        const syntheticRunId = syntheticState.activeRun?.runId;

        const victory = resolveBattleVictory({
            run: {
                ...defaultState.activeRun!,
                currentNodeId: 'battle.mist-foxes',
                pendingEncounter: {
                    runId: defaultState.activeRun!.runId,
                    nodeId: 'battle.mist-foxes',
                    nodeType: 'battle',
                    encounterId: 'test_encounter_01',
                    encounterFile: 'data/encounters/test-enemy.json',
                    runDeck: defaultState.activeRun!.carriedDeck,
                },
            },
            finalNodeId: 'battle.mist-foxes',
            endedAt: '2026-05-08T01:00:00.000Z',
        });

        expect(victory.run.pendingEncounter).toBeNull();
        expect(loadActiveRun(DEFAULT_TARGET)).toEqual(victory.run);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRunId);
    });
});
