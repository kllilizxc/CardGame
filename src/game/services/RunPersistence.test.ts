import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
    loadPersistentStash,
    resetRunPersistenceForTests,
    savePersistentStash,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import {
    createItemStack,
    createTestPersistentStash,
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

    it('keeps default persistent stash memory fallback when localStorage is unavailable', () => {
        restoreLocalStorage();
        resetRunPersistenceForTests();

        savePersistentStash(TEST_STASH);

        expect(loadPersistentStash()).toEqual(TEST_STASH);
    });
});
