import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import { ExpeditionState } from '../state/ExpeditionState';
import {
    loadActiveRun,
    loadPersistentStash,
    resetRunPersistenceForTests,
} from './RunPersistence';
import {
    resolveBattleDefeat,
    resolveBossClear,
    resolveExtract,
} from './RunResolution';

function startRewardedRun(): ExpeditionState {
    const state = ExpeditionState.bootstrap({
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
    });

    state.createRunSnapshot({
        expeditionId: 'phase01-first-playable-expedition',
        mapId: 'phase01-prototype-map',
        entryNodeId: 'entrance.mountain-gate',
    });

    state.applyNodeRewardPreview({
        cards: [{ id: 'TL_002', count: 1 }],
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
});
