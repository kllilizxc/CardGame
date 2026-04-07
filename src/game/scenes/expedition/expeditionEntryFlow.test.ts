import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';
import prototypeMapJson from '../../../../public/data/mijing/prototype-map.json';

import { resetRunPersistenceForTests } from '../../services/RunPersistence';
import { ExpeditionState } from '../../state/ExpeditionState';
import {
    confirmExpeditionLoadout,
    getInitialExpeditionEntryView,
} from './expeditionEntryFlow';

describe('expeditionEntryFlow', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('returns preparation mode when no active run exists yet', () => {
        const expeditionState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        const view = getInitialExpeditionEntryView(expeditionState);

        expect(view.mode).toBe('preparation');
        expect(view.activeRun).toBeNull();
        expect(view.statusText).toBe('Starter stash ready: 14 cards, 3 items, 36 spiritStones.');
    });

    it('returns active-run mode when a run is already in progress', () => {
        const expeditionState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        const existingRun = expeditionState.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: prototypeMapJson.id,
            entryNodeId: prototypeMapJson.entryNodeId,
        });

        const view = getInitialExpeditionEntryView(expeditionState);

        expect(view.mode).toBe('activeRun');
        expect(view.activeRun?.runId).toBe(existingRun.runId);
        expect(view.statusText).toBe('Run resumed at entrance.mountain-gate with 14 cards, 3 items, and 36 spiritStones.');
    });

    it('confirms the starter stash into a new active run and returns HUD mode', () => {
        const expeditionState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        const view = confirmExpeditionLoadout(expeditionState, {
            expeditionId: 'phase01-first-playable-expedition',
            mapId: prototypeMapJson.id,
            entryNodeId: prototypeMapJson.entryNodeId,
        });

        expect(view.mode).toBe('activeRun');
        expect(view.activeRun.currentNodeId).toBe(prototypeMapJson.entryNodeId);
        expect(view.activeRun.carriedDeck).toEqual(expeditionState.persistentStash.deck);
        expect(view.activeRun.carriedItems).toEqual(expeditionState.persistentStash.items);
        expect(view.activeRun.spiritStones).toBe(expeditionState.persistentStash.spiritStones);
        expect(view.statusText).toBe('Run started at entrance.mountain-gate with 14 cards, 3 items, and 36 spiritStones.');
    });
});
