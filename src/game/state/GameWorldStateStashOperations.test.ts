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
import {
    createItemStack,
    createRunSnapshot as createRunSnapshotFixture,
    createTestRewardBundle,
} from '../testing/fixtures/expeditionWorldStateFixtures';

function createPersistentStash(overrides: Partial<PersistentStash> = {}): PersistentStash {
    return {
        stashId: 'test-stash',
        deckRef: 'test-deck',
        deck: [
            { id: 'CARD_A', count: 2 },
            { id: 'CARD_B', count: 1 },
        ],
        items: [
            createItemStack('item.rope', 'tool', 1),
            createItemStack('item.salve', 'consumable', 2),
        ],
        spiritStones: 5,
        lastRunSummary: null,
        ...overrides,
    };
}

function createRunSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
    return createRunSnapshotFixture({
        expeditionId: 'expedition-test',
        mapId: 'map-test',
        runId: 'run-test',
        currentNodeId: 'entrance',
        startingLoadout: {
            cards: [{ id: 'CARD_A', count: 2 }],
            items: [createItemStack('item.rope', 'tool', 1)],
            spiritStones: 5,
        },
        carriedDeck: [
            { id: 'CARD_A', count: 2 },
            { id: 'CARD_C', count: 1 },
        ],
        carriedItems: [
            createItemStack('item.rope', 'tool', 1),
            createItemStack('item.charm', 'artifact', 1),
        ],
        spiritStones: 8,
        nodeStates: {
            entrance: {
                nodeId: 'entrance',
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
        },
        status: 'inProgress',
        startedAt: '2026-05-10T00:00:00.000Z',
        visitedNodeIds: ['entrance'],
        ...overrides,
    });
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
                createItemStack('shared', 'artifact', 2),
                createItemStack('shared', 'artifact', 1),
                createItemStack('shared', 'tool', 5),
                createItemStack('stale', 'quest', 0),
            ],
            [
                createItemStack('shared', 'artifact', 3),
                createItemStack('shared', 'tool', 1),
                createItemStack('salve', 'consumable', 2),
                createItemStack('salve', 'consumable', 1),
                createItemStack('ignored', 'quest', -1),
            ],
        )).toEqual([
            createItemStack('shared', 'artifact', 6),
            createItemStack('shared', 'tool', 6),
            createItemStack('salve', 'consumable', 3),
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
                createItemStack('item.rope', 'tool', 1),
                createItemStack('item.salve', 'consumable', 2),
            ],
            spiritStones: 5,
        });
        const startingLoadout: RunRewardBundle = createTestRewardBundle({
            cards: [
                { id: 'CARD_A', count: 5 },
                { id: 'CARD_B', count: 1 },
                { id: 'CARD_MISSING', count: 1 },
                { id: 'CARD_NEGATIVE', count: -1 },
            ],
            items: [
                createItemStack('item.rope', 'tool', 3),
                createItemStack('item.salve', 'consumable', 1),
                createItemStack('item.missing', 'quest', 1),
                createItemStack('item.ignored', 'quest', -1),
            ],
            spiritStones: 9,
        });

        const updatedStash = subtractStartingLoadoutFromStash(stash, startingLoadout);

        expect(updatedStash).toEqual({
            ...stash,
            deck: [],
            items: [createItemStack('item.salve', 'consumable', 1)],
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
        const carried: RunRewardBundle = createTestRewardBundle({
            cards: [
                { id: 'CARD_A', count: 2 },
                { id: 'CARD_ZERO', count: 0 },
            ],
            items: [createItemStack('item.rope', 'tool', 1)],
            spiritStones: 5,
        });
        const rewards: RunRewardBundle = createTestRewardBundle({
            cards: [
                { id: 'CARD_A', count: 1 },
                { id: 'CARD_B', count: 1 },
                { id: 'CARD_B', count: 2 },
            ],
            items: [
                createItemStack('item.rope', 'tool', 1),
                createItemStack('item.charm', 'artifact', 1),
            ],
            spiritStones: 3,
        });
        const rewardedCarried = addRewardBundleToCarriedBundle(carried, rewards);
        const stash = createPersistentStash({
            deck: [{ id: 'CARD_A', count: 1 }],
            items: [createItemStack('item.rope', 'tool', 1)],
            spiritStones: 7,
        });

        const updatedStash = addCarriedBundleToStash(stash, rewardedCarried);

        expect(rewardedCarried).toEqual({
            cards: [
                { id: 'CARD_A', count: 3 },
                { id: 'CARD_B', count: 3 },
            ],
            items: [
                createItemStack('item.rope', 'tool', 2),
                createItemStack('item.charm', 'artifact', 1),
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
                createItemStack('item.rope', 'tool', 3),
                createItemStack('item.charm', 'artifact', 1),
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
