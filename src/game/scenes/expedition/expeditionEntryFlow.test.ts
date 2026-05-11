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
import { normalizeExpeditionWorldStateSeed } from '../../testing/fixtures/expeditionWorldStateFixtures';

const createWorldStateSeed = () => normalizeExpeditionWorldStateSeed(structuredClone(initialWorldState));

describe('expeditionEntryFlow', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('returns preparation mode when no active run exists yet', () => {
        const expeditionState = ExpeditionState.bootstrap({
            worldState: createWorldStateSeed(),
            starterDeck: structuredClone(starterDeckJson),
        });

        const view = getInitialExpeditionEntryView(expeditionState);

        expect(view.mode).toBe('preparation');
        expect(view.activeRun).toBeNull();
        expect(view.statusText).toBe('储物袋已备好：14 张卡、3 件道具、36 枚灵石。');
    });

    it('returns active-run mode when a run is already in progress', () => {
        const expeditionState = ExpeditionState.bootstrap({
            worldState: createWorldStateSeed(),
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
        expect(view.statusText).toBe('已继续探索：当前位置 entrance.mountain-gate，携带 14 张卡、3 件道具、36 枚灵石。');
    });

    it('confirms the starter stash into a new active run and returns HUD mode', () => {
        const expeditionState = ExpeditionState.bootstrap({
            worldState: createWorldStateSeed(),
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
        expect(view.statusText).toBe('已进入秘境：当前位置 entrance.mountain-gate，携带 14 张卡、3 件道具、36 枚灵石。');
    });
});
