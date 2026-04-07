import type { PersistentStash, RunSnapshot } from '../types/expedition';

export const STASH_STORAGE_KEY = 'cardgame.persistent-stash.v1';
export const ACTIVE_RUN_STORAGE_KEY = 'cardgame.active-run.v1';

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const memoryStorage = new Map<string, string>();

function getStorageAdapter(): StorageAdapter {
    if (typeof globalThis.localStorage !== 'undefined') {
        return globalThis.localStorage;
    }

    return {
        getItem: (key: string) => memoryStorage.get(key) ?? null,
        setItem: (key: string, value: string) => {
            memoryStorage.set(key, value);
        },
        removeItem: (key: string) => {
            memoryStorage.delete(key);
        },
    };
}

function readStoredJson<T>(key: string): T | null {
    const rawValue = getStorageAdapter().getItem(key);

    if (!rawValue) {
        return null;
    }

    try {
        return JSON.parse(rawValue) as T;
    } catch {
        getStorageAdapter().removeItem(key);
        return null;
    }
}

export function loadPersistentStash(): PersistentStash | null {
    return readStoredJson<PersistentStash>(STASH_STORAGE_KEY);
}

export function savePersistentStash(stash: PersistentStash): void {
    getStorageAdapter().setItem(STASH_STORAGE_KEY, JSON.stringify(stash));
}

export function loadActiveRun(): RunSnapshot | null {
    return readStoredJson<RunSnapshot>(ACTIVE_RUN_STORAGE_KEY);
}

export function saveActiveRun(run: RunSnapshot): void {
    getStorageAdapter().setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(run));
}

export function clearActiveRun(): void {
    getStorageAdapter().removeItem(ACTIVE_RUN_STORAGE_KEY);
}

export function resetRunPersistenceForTests(): void {
    memoryStorage.clear();
    clearActiveRun();
    getStorageAdapter().removeItem(STASH_STORAGE_KEY);
}
