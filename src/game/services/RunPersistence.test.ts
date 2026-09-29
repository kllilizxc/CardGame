import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { PersistentStash } from '../types/expedition';
import { validateDeckAvailability } from '../state/PersistentStashDecks';
import {
    loadPersistentStash,
    resetRunPersistenceForTests,
    savePersistentStash,
    STASH_STORAGE_KEY,
} from './RunPersistence';

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

const TEST_STASH: PersistentStash = {
    stashId: 'test-stash',
    cards: [{ id: 'CARD_A', count: 2 }],
    savedDecks: [{ id: 'test-deck', name: 'test-deck', cards: [{ id: 'CARD_A', count: 2 }] }],
    selectedDeckId: 'test-deck',
    items: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
    spiritStones: 9,
    lastRunSummary: null,
};

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

    it('preserves a configured bag capacity and rejects a malformed saved capacity', () => {
        const ambientStorage = globalThis.localStorage as MemoryStorage;
        const stash = { ...TEST_STASH, itemSlotCapacity: 2 };
        savePersistentStash(stash);
        expect(loadPersistentStash()).toEqual(stash);

        ambientStorage.setItem(STASH_STORAGE_KEY, JSON.stringify({ ...stash, itemSlotCapacity: 0 }));
        expect(loadPersistentStash()).toBeNull();
        expect(ambientStorage.getItem(STASH_STORAGE_KEY)).toBeNull();
    });

    it('repairs a stale equipment reference without deleting the saved inventory', () => {
        const ambientStorage = globalThis.localStorage as MemoryStorage;
        ambientStorage.setItem(STASH_STORAGE_KEY, JSON.stringify({
            ...TEST_STASH,
            equippedItems: { charm: 'item.missing' },
        }));
        const restored = loadPersistentStash();
        expect(restored?.items).toEqual(TEST_STASH.items);
        expect(restored?.cards).toEqual(TEST_STASH.cards);
        expect(restored?.equippedItems).toEqual({});
        expect(ambientStorage.getItem(STASH_STORAGE_KEY)).not.toBeNull();
        expect(() => savePersistentStash({ ...TEST_STASH, equippedItems: { charm: 'item.missing' } })).toThrow('invalid equipped items');

        ambientStorage.setItem(STASH_STORAGE_KEY, JSON.stringify({
            ...TEST_STASH,
            equippedItems: JSON.parse('{"__proto__":"item.rope"}'),
        }));
        expect(loadPersistentStash()?.equippedItems).toEqual({});
        expect(ambientStorage.getItem(STASH_STORAGE_KEY)).not.toBeNull();
    });

    it('keeps default persistent stash memory fallback when localStorage is unavailable', () => {
        restoreLocalStorage();
        resetRunPersistenceForTests();

        savePersistentStash(TEST_STASH);

        expect(loadPersistentStash()).toEqual(TEST_STASH);
    });

    it('migrates a legacy deck-based stash into permanent collection plus a default saved deck without clearing progress', () => {
        const ambientStorage = globalThis.localStorage as MemoryStorage;
        ambientStorage.setItem(STASH_STORAGE_KEY, JSON.stringify({
            stashId: 'legacy-stash',
            deckRef: 'legacy-deck',
            deck: [{ id: 'CARD_A', count: 2 }],
            items: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
            spiritStones: 9,
            lastRunSummary: null,
        }));

        expect(loadPersistentStash()).toEqual({
            stashId: 'legacy-stash',
            cards: [{ id: 'CARD_A', count: 2 }],
            savedDecks: [{ id: 'legacy-deck', name: 'legacy-deck', cards: [{ id: 'CARD_A', count: 2 }] }],
            selectedDeckId: 'legacy-deck',
            items: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
            spiritStones: 9,
            lastRunSummary: null,
        });
        expect(JSON.parse(ambientStorage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(loadPersistentStash());
    });

    it('preserves a too-small deck (< 20 cards) through a save/load round-trip', () => {
        const stash: PersistentStash = {
            stashId: 'test-stash',
            cards: [{ id: 'CARD_A', count: 10 }],
            savedDecks: [{ id: 'small-deck', name: 'Too Small', cards: [{ id: 'CARD_A', count: 5 }] }],
            selectedDeckId: 'small-deck',
            items: [],
            spiritStones: 0,
        };

        savePersistentStash(stash);
        const loaded = loadPersistentStash();

        expect(loaded).not.toBeNull();
        expect(loaded).toEqual(stash);
    });

    it('preserves a too-large deck (> 40 cards) through a save/load round-trip', () => {
        const stash: PersistentStash = {
            stashId: 'test-stash',
            cards: [{ id: 'CARD_A', count: 60 }],
            savedDecks: [{ id: 'big-deck', name: 'Too Large', cards: [{ id: 'CARD_A', count: 55 }] }],
            selectedDeckId: 'big-deck',
            items: [],
            spiritStones: 0,
        };

        savePersistentStash(stash);
        const loaded = loadPersistentStash();

        expect(loaded).not.toBeNull();
        expect(loaded).toEqual(stash);
    });

    it('preserves a deck with unavailable cards through a save/load round-trip, and validation still reports issues', () => {
        const stash: PersistentStash = {
            stashId: 'test-stash',
            cards: [{ id: 'CARD_A', count: 3 }],
            savedDecks: [{ id: 'unavailable-deck', name: 'Unavailable', cards: [{ id: 'CARD_MISSING', count: 2 }] }],
            selectedDeckId: 'unavailable-deck',
            items: [],
            spiritStones: 0,
        };

        savePersistentStash(stash);
        const loaded = loadPersistentStash();

        expect(loaded).not.toBeNull();
        expect(loaded).toEqual(stash);

        const issues = validateDeckAvailability(loaded!.savedDecks[0].cards, loaded!.cards);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toEqual({
            kind: 'insufficient-copies',
            cardId: 'CARD_MISSING',
            required: 2,
            available: 0,
        });
    });

    it('preserves two invalid decks coexisting in savedDecks through a save/load round-trip', () => {
        const stash: PersistentStash = {
            stashId: 'test-stash',
            cards: [{ id: 'CARD_A', count: 60 }],
            savedDecks: [
                { id: 'small-deck', name: 'Small', cards: [{ id: 'CARD_A', count: 5 }] },
                { id: 'big-deck', name: 'Big', cards: [{ id: 'CARD_A', count: 55 }] },
            ],
            selectedDeckId: 'big-deck',
            items: [],
            spiritStones: 0,
        };

        savePersistentStash(stash);
        const loaded = loadPersistentStash();

        expect(loaded).not.toBeNull();
        expect(loaded!.savedDecks).toHaveLength(2);
        expect(loaded!.savedDecks[0]).toEqual(stash.savedDecks[0]);
        expect(loaded!.savedDecks[1]).toEqual(stash.savedDecks[1]);
        expect(loaded).toEqual(stash);
    });
});
