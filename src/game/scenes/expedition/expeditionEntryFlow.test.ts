import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';
import prototypeMapJson from '../../../../public/data/mijing/prototype-map.json';

import { resetRunPersistenceForTests } from '../../services/RunPersistence';
import { ExpeditionState } from '../../state/ExpeditionState';
import { getSelectedDeckCards } from '../../state/PersistentStashDecks';
import type { PersistentStash } from '../../types/expedition';
import {
    confirmExpeditionLoadout,
    getInitialExpeditionEntryView,
    validateExpeditionLoadout,
} from './expeditionEntryFlow';

function createTestStash(overrides: Partial<PersistentStash> = {}): PersistentStash {
    return {
        stashId: 'test-stash',
        cards: [
            { id: 'card.a', count: 3 },
            { id: 'card.b', count: 2 },
            { id: 'card.c', count: 1 },
        ],
        savedDecks: [
            {
                id: 'deck-1',
                name: 'Test Deck',
                cards: [
                    { id: 'card.a', count: 2 },
                    { id: 'card.b', count: 1 },
                ],
            },
        ],
        selectedDeckId: 'deck-1',
        items: [],
        spiritStones: 0,
        ...overrides,
    };
}

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
        expect(view.statusText).toBe('储物袋已备好：20 张卡、3 件道具、36 枚灵石。');
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
        expect(view.statusText).toBe('已继续探索：当前位置 entrance.mountain-gate，携带 20 张卡、3 件道具、36 枚灵石。');
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
        expect(view.activeRun.carriedDeck).toEqual(getSelectedDeckCards(expeditionState.persistentStash));
        expect(view.activeRun.carriedItems).toEqual(expeditionState.persistentStash.items);
        expect(view.activeRun.spiritStones).toBe(expeditionState.persistentStash.spiritStones);
        expect(view.statusText).toBe('已进入秘境：当前位置 entrance.mountain-gate，携带 20 张卡、3 件道具、36 枚灵石。');
    });
});

describe('validateExpeditionLoadout', () => {
    it('returns valid for a deck with sufficient size and available copies', () => {
        const stashCards = [
            { id: 'card.a', count: 15 },
            { id: 'card.b', count: 10 },
        ];
        const stash = createTestStash({
            cards: stashCards,
            savedDecks: [
                {
                    id: 'deck-1',
                    name: 'Valid Deck',
                    cards: [
                        { id: 'card.a', count: 12 },
                        { id: 'card.b', count: 8 },
                    ],
                },
            ],
        });

        const result = validateExpeditionLoadout(stash);

        expect(result.valid).toBe(true);
        expect(result.sizeIssue).toBeNull();
        expect(result.availabilityIssues).toEqual([]);
    });

    it('returns invalid for a deck with too few cards', () => {
        const stash = createTestStash({
            savedDecks: [
                {
                    id: 'deck-1',
                    name: 'Too Small',
                    cards: [
                        { id: 'card.a', count: 1 },
                    ],
                },
            ],
        });

        const result = validateExpeditionLoadout(stash);

        expect(result.valid).toBe(false);
        expect(result.sizeIssue?.kind).toBe('too-few-cards');
    });

    it('returns invalid for a deck with too many cards', () => {
        const stash = createTestStash({
            cards: Array.from({ length: 45 }, (_, i) => ({ id: `card.${i}`, count: 1 })),
            savedDecks: [
                {
                    id: 'deck-1',
                    name: 'Too Large',
                    cards: Array.from({ length: 45 }, (_, i) => ({ id: `card.${i}`, count: 1 })),
                },
            ],
        });

        const result = validateExpeditionLoadout(stash);

        expect(result.valid).toBe(false);
        expect(result.sizeIssue?.kind).toBe('too-many-cards');
    });

    it('returns invalid when stash lacks sufficient copies', () => {
        const stash = createTestStash({
            cards: [
                { id: 'card.a', count: 1 },
            ],
            savedDecks: [
                {
                    id: 'deck-1',
                    name: 'Needs More Copies',
                    cards: [
                        { id: 'card.a', count: 3 },
                    ],
                },
            ],
        });

        const result = validateExpeditionLoadout(stash);

        expect(result.valid).toBe(false);
        expect(result.availabilityIssues.length).toBe(1);
        expect(result.availabilityIssues[0].kind).toBe('insufficient-copies');
    });

    it('returns size issue and availability issues together when both apply', () => {
        const stash = createTestStash({
            cards: [
                { id: 'card.a', count: 1 },
            ],
            savedDecks: [
                {
                    id: 'deck-1',
                    name: 'Multi Issue',
                    cards: [
                        { id: 'card.a', count: 3 },
                    ],
                },
            ],
        });

        const result = validateExpeditionLoadout(stash);

        expect(result.valid).toBe(false);
        expect(result.sizeIssue?.kind).toBe('too-few-cards');
        expect(result.availabilityIssues.length).toBe(1);
    });

    it('returns invalid with no size issue when stash has no saved decks', () => {
        const stash = createTestStash({
            savedDecks: [],
            selectedDeckId: null,
        });

        const result = validateExpeditionLoadout(stash);

        expect(result.valid).toBe(false);
        expect(result.sizeIssue).toBeNull();
        expect(result.availabilityIssues).toEqual([]);
    });
});
