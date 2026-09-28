import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
    clearActiveRun,
    createActiveRunStorageKey,
    loadActiveRun,
    loadPersistentStash,
    resetRunPersistenceForTests,
    saveActiveRun,
    savePersistentStash,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import { previewStoragePrefix } from './PreviewStorage';
import {
    createRunSnapshot,
    createItemStack,
    createTestPersistentStash,
    DEFAULT_EXPEDITION_TARGET,
} from '../testing/fixtures/expeditionWorldStateFixtures';

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

const TEST_STASH = createTestPersistentStash({
    stashId: 'test-stash',
    deckRef: 'test-deck',
    deck: [{ id: 'CARD_A', count: 2 }],
    items: [createItemStack('item.rope', 'tool', 1)],
    spiritStones: 9,
});

let previousLocalStorageDescriptor: PropertyDescriptor | undefined;

function installMemoryStorage(storage = new MemoryStorage()): MemoryStorage {
    previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: storage,
    });

    return storage;
}

function installThrowingAmbientLocalStorage(message: string): void {
    previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error(message);
        },
    });
}

function restoreLocalStorage(): void {
    if (previousLocalStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousLocalStorageDescriptor);
    } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
    }

    previousLocalStorageDescriptor = undefined;
}

describe('RunPersistence', () => {
    beforeEach(() => {
        installMemoryStorage();
        resetRunPersistenceForTests();
    });

    afterEach(() => {
        restoreLocalStorage();
        resetRunPersistenceForTests();
    });

    it('writes persistent stash documents to an injected adapter without touching ambient localStorage', () => {
        const injectedStorage = new MemoryStorage();

        restoreLocalStorage();
        installThrowingAmbientLocalStorage('ambient localStorage must not be used by injected stash writes');

        savePersistentStash(TEST_STASH, injectedStorage);

        expect(JSON.parse(injectedStorage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(TEST_STASH);
    });

    it('keeps default persistent stash localStorage behavior when no adapter is injected', () => {
        const ambientStorage = globalThis.localStorage as MemoryStorage;

        savePersistentStash(TEST_STASH);

        expect(JSON.parse(ambientStorage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(TEST_STASH);
        expect(loadPersistentStash()).toEqual(TEST_STASH);
    });

    it('isolates default stash and active runs by candidate and profile without reading ordinary saves', () => {
        const storage = globalThis.localStorage as MemoryStorage;
        const ordinaryStash = createTestPersistentStash({ spiritStones: 73 });
        storage.setItem(STASH_STORAGE_KEY, JSON.stringify(ordinaryStash));
        const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
        const base = `?workaProject=cardgame&workaCandidate=main-latest&workaCommit=${'a'.repeat(40)}`;
        const searchA = `${base}&workaProfile=one`;
        const searchB = `${base}&workaProfile=two`;
        const otherCandidate = `?workaProject=cardgame&workaCandidate=next&workaCommit=${'b'.repeat(40)}&workaProfile=one`;
        const setSearch = (search: string) => Object.defineProperty(globalThis, 'location', {
            configurable: true,
            value: { search },
        });

        try {
            setSearch(searchA);
            expect(loadPersistentStash()).toBeNull();
            expect(loadActiveRun(DEFAULT_EXPEDITION_TARGET)).toBeNull();
            savePersistentStash(TEST_STASH);
            saveActiveRun(createRunSnapshot(DEFAULT_EXPEDITION_TARGET, { runId: 'run-one' }));

            const prefixA = previewStoragePrefix(searchA)!;
            expect(storage.getItem(`${prefixA}${STASH_STORAGE_KEY}`)).toBe(JSON.stringify(TEST_STASH));
            expect(storage.getItem(`${prefixA}${createActiveRunStorageKey(DEFAULT_EXPEDITION_TARGET)}`)).not.toBeNull();
            expect(storage.getItem(STASH_STORAGE_KEY)).toBe(JSON.stringify(ordinaryStash));

            setSearch(searchB);
            expect(loadPersistentStash()).toBeNull();
            expect(loadActiveRun(DEFAULT_EXPEDITION_TARGET)).toBeNull();
            savePersistentStash(createTestPersistentStash({ spiritStones: 5 }));
            saveActiveRun(createRunSnapshot(DEFAULT_EXPEDITION_TARGET, { runId: 'run-two' }));

            setSearch(searchA);
            expect(loadPersistentStash()?.spiritStones).toBe(TEST_STASH.spiritStones);
            expect(loadActiveRun(DEFAULT_EXPEDITION_TARGET)?.runId).toBe('run-one');
            clearActiveRun(DEFAULT_EXPEDITION_TARGET);

            setSearch(searchB);
            expect(loadPersistentStash()?.spiritStones).toBe(5);
            expect(loadActiveRun(DEFAULT_EXPEDITION_TARGET)?.runId).toBe('run-two');

            setSearch(otherCandidate);
            expect(loadPersistentStash()).toBeNull();
            expect(loadActiveRun(DEFAULT_EXPEDITION_TARGET)).toBeNull();

            setSearch('');
            expect(loadPersistentStash()).toEqual(ordinaryStash);
            expect(loadActiveRun(DEFAULT_EXPEDITION_TARGET)).toBeNull();
        } finally {
            if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
            else delete (globalThis as { location?: Location }).location;
        }
    });

    it('keeps default persistent stash memory fallback when localStorage is unavailable', () => {
        restoreLocalStorage();
        resetRunPersistenceForTests();

        savePersistentStash(TEST_STASH);

        expect(loadPersistentStash()).toEqual(TEST_STASH);
    });
});
