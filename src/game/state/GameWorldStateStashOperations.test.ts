import { describe, expect, it } from 'bun:test';

import type { PersistentStash, RunRewardBundle, RunSnapshot } from '../types/expedition';
import {
    addCarriedBundleToStash,
    addRewardBundleToCarriedBundle,
    createCarriedBundleFromRun,
    createStartingLoadoutFromStash,
    mergeCardStacks,
    mergeItemStacks,
    subtractStartingLoadoutFromStash,
} from './GameWorldStateStashOperations';

function createPersistentStash(overrides: Partial<PersistentStash> = {}): PersistentStash {
    return {
        stashId: 'test-stash',
        deckRef: 'test-deck',
        deck: [
            { id: 'CARD_A', count: 2 },
            { id: 'CARD_B', count: 1 },
        ],
        items: [
            { id: 'item.rope', itemType: 'tool', count: 1 },
            { id: 'item.salve', itemType: 'consumable', count: 2 },
        ],
        spiritStones: 5,
        lastRunSummary: null,
        ...overrides,
    };
}

function createRunSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
    return {
        runId: 'run-test',
        expeditionId: 'expedition-test',
        mapId: 'map-test',
        status: 'inProgress',
        currentNodeId: 'entrance',
        startingLoadout: {
            cards: [{ id: 'CARD_A', count: 2 }],
            items: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
            spiritStones: 5,
        },
        carriedDeck: [
            { id: 'CARD_A', count: 2 },
            { id: 'CARD_C', count: 1 },
        ],
        carriedItems: [
            { id: 'item.rope', itemType: 'tool', count: 1 },
            { id: 'item.charm', itemType: 'artifact', count: 1 },
        ],
        spiritStones: 8,
        visitedNodeIds: ['entrance'],
        nodeStates: {
            entrance: {
                nodeId: 'entrance',
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
        },
        startedAt: '2026-05-10T00:00:00.000Z',
        ...overrides,
    };
}

describe('GameWorldStateStashOperations', () => {
    it('creates starting loadouts and carried bundles without sharing mutable stack objects', () => {
        const stash = createPersistentStash();
        const startingLoadout = createStartingLoadoutFromStash(stash);
        const run = createRunSnapshot();
        const carriedBundle = createCarriedBundleFromRun(run);

        expect(startingLoadout).toEqual({
            cards: stash.deck,
            items: stash.items,
            spiritStones: stash.spiritStones,
        });
        expect(startingLoadout.cards[0]).not.toBe(stash.deck[0]);
        expect(startingLoadout.items[0]).not.toBe(stash.items[0]);

        expect(carriedBundle).toEqual({
            cards: run.carriedDeck,
            items: run.carriedItems,
            spiritStones: run.spiritStones,
        });
        expect(carriedBundle.cards[0]).not.toBe(run.carriedDeck[0]);
        expect(carriedBundle.items[0]).not.toBe(run.carriedItems[0]);

        startingLoadout.cards[0].count = 99;
        carriedBundle.items[0].count = 99;

        expect(stash.deck[0].count).toBe(2);
        expect(run.carriedItems[0].count).toBe(1);
    });

    it('merges duplicate card and item stacks while dropping non-positive stacks', () => {
        expect(mergeCardStacks(
            [
                { id: 'CARD_A', count: 2 },
                { id: 'CARD_A', count: 3 },
                { id: 'CARD_ZERO', count: 0 },
                { id: 'CARD_NEGATIVE', count: -1 },
            ],
            [
                { id: 'CARD_A', count: 4 },
                { id: 'CARD_B', count: 1 },
                { id: 'CARD_B', count: 2 },
                { id: 'CARD_IGNORED_ZERO', count: 0 },
                { id: 'CARD_IGNORED_NEGATIVE', count: -2 },
            ],
        )).toEqual([
            { id: 'CARD_A', count: 9 },
            { id: 'CARD_B', count: 3 },
        ]);

        expect(mergeItemStacks(
            [
                { id: 'shared', itemType: 'artifact', count: 2 },
                { id: 'shared', itemType: 'artifact', count: 1 },
                { id: 'shared', itemType: 'tool', count: 5 },
                { id: 'stale', itemType: 'quest', count: 0 },
            ],
            [
                { id: 'shared', itemType: 'artifact', count: 3 },
                { id: 'shared', itemType: 'tool', count: 1 },
                { id: 'salve', itemType: 'consumable', count: 2 },
                { id: 'salve', itemType: 'consumable', count: 1 },
                { id: 'ignored', itemType: 'quest', count: -1 },
            ],
        )).toEqual([
            { id: 'shared', itemType: 'artifact', count: 6 },
            { id: 'shared', itemType: 'tool', count: 6 },
            { id: 'salve', itemType: 'consumable', count: 3 },
        ]);
    });

    it('subtracts a starting loadout from a stash without negative stacks or spirit stones', () => {
        const stash = createPersistentStash({
            deck: [
                { id: 'CARD_A', count: 2 },
                { id: 'CARD_B', count: 1 },
                { id: 'CARD_ZERO', count: 0 },
                { id: 'CARD_NEGATIVE', count: -1 },
            ],
            items: [
                { id: 'item.rope', itemType: 'tool', count: 1 },
                { id: 'item.salve', itemType: 'consumable', count: 2 },
            ],
            spiritStones: 5,
        });
        const startingLoadout: RunRewardBundle = {
            cards: [
                { id: 'CARD_A', count: 5 },
                { id: 'CARD_B', count: 1 },
                { id: 'CARD_MISSING', count: 1 },
                { id: 'CARD_NEGATIVE', count: -1 },
            ],
            items: [
                { id: 'item.rope', itemType: 'tool', count: 3 },
                { id: 'item.salve', itemType: 'consumable', count: 1 },
                { id: 'item.missing', itemType: 'quest', count: 1 },
                { id: 'item.ignored', itemType: 'quest', count: -1 },
            ],
            spiritStones: 9,
        };

        const updatedStash = subtractStartingLoadoutFromStash(stash, startingLoadout);

        expect(updatedStash).toEqual({
            ...stash,
            deck: [],
            items: [{ id: 'item.salve', itemType: 'consumable', count: 1 }],
            spiritStones: 0,
        });
        expect(stash.deck).toEqual([
            { id: 'CARD_A', count: 2 },
            { id: 'CARD_B', count: 1 },
            { id: 'CARD_ZERO', count: 0 },
            { id: 'CARD_NEGATIVE', count: -1 },
        ]);
    });

    it('adds rewards and carried bundles by pure stash math without mutating inputs', () => {
        const carried: RunRewardBundle = {
            cards: [
                { id: 'CARD_A', count: 2 },
                { id: 'CARD_ZERO', count: 0 },
            ],
            items: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
            spiritStones: 5,
        };
        const rewards: RunRewardBundle = {
            cards: [
                { id: 'CARD_A', count: 1 },
                { id: 'CARD_B', count: 1 },
                { id: 'CARD_B', count: 2 },
            ],
            items: [
                { id: 'item.rope', itemType: 'tool', count: 1 },
                { id: 'item.charm', itemType: 'artifact', count: 1 },
            ],
            spiritStones: 3,
        };
        const rewardedCarried = addRewardBundleToCarriedBundle(carried, rewards);
        const stash = createPersistentStash({
            deck: [{ id: 'CARD_A', count: 1 }],
            items: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
            spiritStones: 7,
        });

        const updatedStash = addCarriedBundleToStash(stash, rewardedCarried);

        expect(rewardedCarried).toEqual({
            cards: [
                { id: 'CARD_A', count: 3 },
                { id: 'CARD_B', count: 3 },
            ],
            items: [
                { id: 'item.rope', itemType: 'tool', count: 2 },
                { id: 'item.charm', itemType: 'artifact', count: 1 },
            ],
            spiritStones: 8,
        });
        expect(updatedStash).toEqual({
            ...stash,
            deck: [
                { id: 'CARD_A', count: 4 },
                { id: 'CARD_B', count: 3 },
            ],
            items: [
                { id: 'item.rope', itemType: 'tool', count: 3 },
                { id: 'item.charm', itemType: 'artifact', count: 1 },
            ],
            spiritStones: 15,
        });
        expect(rewardedCarried.cards[0]).not.toBe(carried.cards[0]);
        expect(updatedStash.deck[0]).not.toBe(stash.deck[0]);
        expect(carried.cards).toEqual([
            { id: 'CARD_A', count: 2 },
            { id: 'CARD_ZERO', count: 0 },
        ]);
        expect(stash.deck).toEqual([{ id: 'CARD_A', count: 1 }]);
    });
});
