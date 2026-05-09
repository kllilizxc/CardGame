import type { PersistentStash, RunSnapshot } from '../types/expedition';

export const STASH_STORAGE_KEY = 'cardgame.persistent-stash.v1';
export const ACTIVE_RUN_STORAGE_KEY = 'cardgame.active-run.v1';
export const DEFAULT_ACTIVE_RUN_ROUTE_KEY = 'default';

export interface ActiveRunStorageIdentity {
    expeditionId: string;
    mapId: string;
}

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

export function normalizeActiveRunRouteKey(routeKey?: string | null): string {
    const normalized = routeKey?.trim();

    return normalized && normalized.length > 0 ? normalized : DEFAULT_ACTIVE_RUN_ROUTE_KEY;
}

export function createActiveRunStorageKey(routeKey?: string | null): string {
    const normalizedRouteKey = normalizeActiveRunRouteKey(routeKey);

    return normalizedRouteKey === DEFAULT_ACTIVE_RUN_ROUTE_KEY
        ? ACTIVE_RUN_STORAGE_KEY
        : `${ACTIVE_RUN_STORAGE_KEY}:${normalizedRouteKey}`;
}

function runMatchesStorageIdentity(
    run: RunSnapshot,
    identity?: ActiveRunStorageIdentity,
): boolean {
    return !identity || (run.expeditionId === identity.expeditionId && run.mapId === identity.mapId);
}

function attachRouteKey(run: RunSnapshot, routeKey: string): RunSnapshot {
    return {
        ...run,
        routeKey,
    };
}

export function loadPersistentStash(): PersistentStash | null {
    return readStoredJson<PersistentStash>(STASH_STORAGE_KEY);
}

export function savePersistentStash(stash: PersistentStash): void {
    getStorageAdapter().setItem(STASH_STORAGE_KEY, JSON.stringify(stash));
}

export function loadActiveRun(
    routeKey?: string | null,
    identity?: ActiveRunStorageIdentity,
): RunSnapshot | null {
    const normalizedRouteKey = normalizeActiveRunRouteKey(routeKey);
    const storageKey = createActiveRunStorageKey(normalizedRouteKey);
    const activeRun = readStoredJson<RunSnapshot>(storageKey);

    if (activeRun) {
        if (!runMatchesStorageIdentity(activeRun, identity)) {
            getStorageAdapter().removeItem(storageKey);
            return null;
        }

        return activeRun.routeKey === normalizedRouteKey ? activeRun : attachRouteKey(activeRun, normalizedRouteKey);
    }

    if (storageKey === ACTIVE_RUN_STORAGE_KEY) {
        return null;
    }

    const legacyActiveRun = readStoredJson<RunSnapshot>(ACTIVE_RUN_STORAGE_KEY);

    if (!legacyActiveRun || !runMatchesStorageIdentity(legacyActiveRun, identity)) {
        return null;
    }

    const migratedActiveRun = attachRouteKey(legacyActiveRun, normalizedRouteKey);
    saveActiveRun(migratedActiveRun, normalizedRouteKey);
    getStorageAdapter().removeItem(ACTIVE_RUN_STORAGE_KEY);

    return migratedActiveRun;
}

export function saveActiveRun(run: RunSnapshot, routeKey?: string | null): void {
    const normalizedRouteKey = normalizeActiveRunRouteKey(routeKey ?? run.routeKey);
    const activeRun = attachRouteKey(run, normalizedRouteKey);

    getStorageAdapter().setItem(createActiveRunStorageKey(normalizedRouteKey), JSON.stringify(activeRun));
}

export function clearActiveRun(routeKey?: string | null): void {
    getStorageAdapter().removeItem(createActiveRunStorageKey(routeKey));
}

export function resetRunPersistenceForTests(): void {
    memoryStorage.clear();
    clearActiveRun();
    getStorageAdapter().removeItem(STASH_STORAGE_KEY);
}
