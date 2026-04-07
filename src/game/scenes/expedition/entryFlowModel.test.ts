import { describe, expect, it } from 'bun:test';

import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';

import { ExpeditionState } from '../../state/ExpeditionState';
import {
    createPreparationSummary,
    createRunSummary,
} from './entryFlowModel';

describe('entryFlowModel', () => {
    it('summarizes the starter stash for the preparation panel', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(createPreparationSummary(state.persistentStash)).toEqual({
            deckCount: 14,
            itemCount: 3,
            spiritStones: 36,
            statusText: 'Starter stash ready: 14 cards, 3 items, 36 spiritStones.',
        });
    });

    it('summarizes an active run for the HUD and resume status copy', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(createRunSummary(run)).toEqual({
            currentNodeId: 'entrance.mountain-gate',
            currentNodeLabel: 'entrance.mountain-gate',
            carriedDeckCount: 14,
            carriedItemCount: 3,
            spiritStones: 36,
            statusText: 'Run resumed at entrance.mountain-gate with 14 cards, 3 items, and 36 spiritStones.',
        });
    });

    it('uses a readable node label when the expedition scene provides one', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(createRunSummary(run, {
            mode: 'started',
            currentNodeLabel: '山门入口',
        })).toEqual({
            currentNodeId: 'entrance.mountain-gate',
            currentNodeLabel: '山门入口',
            carriedDeckCount: 14,
            carriedItemCount: 3,
            spiritStones: 36,
            statusText: 'Run started at 山门入口 with 14 cards, 3 items, and 36 spiritStones.',
        });
    });
});
