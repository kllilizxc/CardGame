import { afterEach, describe, expect, it } from 'bun:test';

import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import initialWorldState from '../../../public/data/world/initial-state.json';

import {
    createActiveRunStorageKey,
    resetRunPersistenceForTests,
    type RunPersistenceStorageAdapter,
    STASH_STORAGE_KEY,
} from '../services/RunPersistence';
import type { ExpeditionItemStack, PersistentStash, RunSnapshot } from '../types/expedition';
import { createGameWorldState } from './GameWorldState';
import { createPersistentStashFromWorldStateSeed } from './GameWorldStateSeed';
import {
    createRunSnapshot,
    createTestPersistentStash,
    SYNTHETIC_EXPEDITION_TARGET,
    createItemStacksFromSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';
import {
    planGameWorldStatePersistentStashWrite,
    planGameWorldStatePersistentStashWriteFromView,
    writeGameWorldStatePersistentStash,
    writeGameWorldStatePersistentStashPlan,
} from './GameWorldStatePersistentStashWrite';

const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const initialWorldStateStashItems = createItemStacksFromSeed(initialWorldState.stash.items);

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

let previousLocalStorageDescriptor: PropertyDescriptor | undefined;

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by GameWorldState stash writes');
        },
    });

    try {
        return callback();
    } finally {
        restoreLocalStorage();
    }
}

function restoreLocalStorage(): void {
    if (previousLocalStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousLocalStorageDescriptor);
    } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
    }

    previousLocalStorageDescriptor = undefined;
}

function createSeedSources() {
    return {
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
    };
}

function createStoredStash(): PersistentStash {
    return createTestPersistentStash({
        stashId: 'stored-stash',
        deckRef: 'stored-deck',
        deck: [
            { id: 'AR_001', count: 4 },
            { id: 'TL_002', count: 1 },
        ],
        items: [
            { id: 'tool.return-rope', itemType: 'tool', count: 2 },
            { id: 'artifact.fly-sword', itemType: 'artifact', count: 1 },
        ],
        spiritStones: 88,
        lastRunSummary: {
            runId: 'run-finished',
            outcome: 'extract',
            finalNodeId: 'extract.synthetic',
            kept: {
                cards: [{ id: 'TL_002', count: 1 }],
                items: [{ id: 'artifact.fly-sword', itemType: 'artifact', count: 1 }],
                spiritStones: 18,
            },
            lost: {
                cards: [],
                items: [],
                spiritStones: 0,
            },
            endedAt: '2026-05-10T01:00:00.000Z',
        },
    });
}

function createStoredActiveRun(): RunSnapshot {
    return createRunSnapshot(SYNTHETIC_TARGET, {
        runId: 'run-active',
        currentNodeId: 'event.synthetic-cache',
        startingLoadout: {
            cards: [{ id: 'AR_001', count: 3 }],
            items: [{ id: 'tool.return-rope', itemType: 'tool', count: 1 }],
            spiritStones: 36,
        },
        carriedDeck: [
            { id: 'AR_001', count: 3 },
            { id: 'TL_002', count: 1 },
        ],
        carriedItems: [{ id: 'tool.return-rope', itemType: 'tool', count: 1 }],
        spiritStones: 54,
        visitedNodeIds: ['entrance.synthetic', 'event.synthetic-cache'],
        nodeStates: {
            'entrance.synthetic': {
                nodeId: 'entrance.synthetic',
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
            'event.synthetic-cache': {
                nodeId: 'event.synthetic-cache',
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
        },
        startedAt: '2026-05-10T00:00:00.000Z',
    });
}

describe('GameWorldStatePersistentStashWrite', () => {
    afterEach(() => {
        restoreLocalStorage();
        resetRunPersistenceForTests();
    });

    it('rewrites an existing stored stash through explicit storage while preserving the compatibility key and active-run route', () => {
        const storage = new MemoryStorage();
        const storedStash = createStoredStash();
        const activeRun = createStoredActiveRun();
        const activeRunStorageKey = createActiveRunStorageKey(SYNTHETIC_TARGET);
        storage.setItem(STASH_STORAGE_KEY, JSON.stringify(storedStash));
        storage.setItem(activeRunStorageKey, JSON.stringify(activeRun));
        const activeRunBeforeWrite = storage.getItem(activeRunStorageKey);

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStatePersistentStash({
            ...createSeedSources(),
            storage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(result.source).toBe('stored-stash');
        expect(result.storageKey).toBe(STASH_STORAGE_KEY);
        expect(result.document).toEqual(storedStash);
        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(storedStash);
        expect(storage.getItem(activeRunStorageKey)).toBe(activeRunBeforeWrite);

        result.document.deck[0].count = 999;
        result.document.items[0].count = 999;
        result.document.lastRunSummary!.kept.cards[0].count = 999;

        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(storedStash);
    });

    it('materializes a seed-fallback stash through explicit storage without changing the JSON shape', () => {
        const storage = new MemoryStorage();
        const expectedSeedStash = createPersistentStashFromWorldStateSeed(createSeedSources());

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStatePersistentStash({
            ...createSeedSources(),
            storage,
        }));

        expect(result.source).toBe('seed-fallback');
        expect(result.storageKey).toBe(STASH_STORAGE_KEY);
        expect(result.document).toEqual(expectedSeedStash);
        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(expectedSeedStash);
        expect(Object.keys(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? '{}')).sort()).toEqual([
            'deck',
            'deckRef',
            'items',
            'lastRunSummary',
            'spiritStones',
            'stashId',
        ]);
        expect(result.document.deck).toEqual(starterDeckJson.cards);
        expect(result.document.items).toEqual(initialWorldStateStashItems);
        expect(result.document.spiritStones).toBe(initialWorldState.stash.spiritStones);

        result.document.deck[0].count = 999;
        result.document.items[0].count = 999;

        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(expectedSeedStash);
    });

    it('plans a stored-stash write separately from applying it through the explicit storage adapter', () => {
        const storage = new MemoryStorage();
        const storedStash = createStoredStash();
        storage.setItem(STASH_STORAGE_KEY, JSON.stringify(storedStash));

        const plan = withThrowingAmbientLocalStorage(() => planGameWorldStatePersistentStashWrite({
            ...createSeedSources(),
            storage,
        }));

        expect(plan.source).toBe('stored-stash');
        expect(plan.storageKey).toBe(STASH_STORAGE_KEY);
        expect(plan.document).toEqual(storedStash);
        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(storedStash);

        plan.document.deck[0].count = 999;
        plan.document.items[0].count = 999;
        plan.document.lastRunSummary!.kept.cards[0].count = 999;

        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(storedStash);

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStatePersistentStashPlan(plan, storage));

        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(plan.document);

        result.document.deck[0].count = 123;
        result.document.items[0].count = 123;
        result.document.lastRunSummary!.kept.cards[0].count = 123;

        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(plan.document);
    });

    it('plans and applies a seed-fallback view without writing until the apply step', () => {
        const storage = new MemoryStorage();
        const expectedSeedStash = createPersistentStashFromWorldStateSeed(createSeedSources());

        const plan = withThrowingAmbientLocalStorage(() => planGameWorldStatePersistentStashWrite({
            ...createSeedSources(),
            storage,
        }));

        expect(plan.source).toBe('seed-fallback');
        expect(plan.storageKey).toBe(STASH_STORAGE_KEY);
        expect(plan.document).toEqual(expectedSeedStash);
        expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStatePersistentStashPlan(plan, storage));

        expect(result).toEqual(plan);
        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(expectedSeedStash);

        plan.document.deck[0].count = 999;
        result.document.items[0].count = 999;

        expect(JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(expectedSeedStash);
    });

    it('rejects incompatible persistent-stash compatibility metadata before writing', () => {
        const storage = new MemoryStorage();
        const worldState = createGameWorldState({
            ...createSeedSources(),
            storage,
        });
        (
            worldState.persistentStash.compatibility as { storageKey: string }
        ).storageKey = 'cardgame.incompatible-persistent-stash.v2';

        expect(() => planGameWorldStatePersistentStashWriteFromView(worldState)).toThrow(
            'GameWorldState persistent-stash write attempted to use an incompatible storage boundary.',
        );
        expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
    });

    it('rejects malformed write plans and storage adapters with explicit errors', () => {
        const storage = new MemoryStorage();
        const plan = planGameWorldStatePersistentStashWrite({
            ...createSeedSources(),
            storage,
        });
        const malformedStorage = {
            getItem: storage.getItem.bind(storage),
            removeItem: storage.removeItem.bind(storage),
        } as unknown as RunPersistenceStorageAdapter;

        expect(() => writeGameWorldStatePersistentStashPlan(
            {
                ...plan,
                storageKey: 'cardgame.incompatible-persistent-stash.v2' as typeof STASH_STORAGE_KEY,
            },
            storage,
        )).toThrow('GameWorldState persistent-stash write plan uses an incompatible storage key.');
        expect(() => writeGameWorldStatePersistentStashPlan(plan, malformedStorage)).toThrow(
            'GameWorldState persistent-stash write requires an explicit storage adapter with getItem, setItem, and removeItem.',
        );
        expect(() => withThrowingAmbientLocalStorage(() => planGameWorldStatePersistentStashWrite({
            ...createSeedSources(),
            storage: undefined as unknown as RunPersistenceStorageAdapter,
        }))).toThrow(
            'GameWorldState persistent-stash write requires an explicit storage adapter with getItem, setItem, and removeItem.',
        );
        expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
    });
});
