import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import { resetRunPersistenceForTests, loadActiveRun } from '../services/RunPersistence';
import { ExpeditionState } from './ExpeditionState';

describe('ExpeditionState', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('seeds the persistent starter stash from the world bootstrap data', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(state.activeRun).toBeNull();
        expect(state.persistentStash.stashId).toBe('phase01.starter-stash');
        expect(state.persistentStash.deckRef).toBe('starter-deck');
        expect(state.persistentStash.deck).toEqual(starterDeckJson.cards);
        expect(state.persistentStash.items).toEqual(initialWorldState.stash.items);
        expect(state.persistentStash.spiritStones).toBe(initialWorldState.stash.spiritStones);
    });

    it('creates and persists a run snapshot from the current stash loadout', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(run.currentNodeId).toBe('entrance.mountain-gate');
        expect(run.carriedDeck).toEqual(state.persistentStash.deck);
        expect(run.carriedItems).toEqual(state.persistentStash.items);
        expect(run.spiritStones).toBe(state.persistentStash.spiritStones);
        expect(run.visitedNodeIds).toEqual(['entrance.mountain-gate']);
        expect(run.nodeStates['entrance.mountain-gate']).toEqual({
            nodeId: 'entrance.mountain-gate',
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
        });
        expect(loadActiveRun()?.runId).toBe(run.runId);
    });
});
