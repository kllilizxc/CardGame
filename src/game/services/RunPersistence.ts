import {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
} from '../config/ExpeditionDefaults';
import type { ExpeditionRouteIdentity, PersistentStash, RunSnapshot } from '../types/expedition';

export const STASH_STORAGE_KEY = 'cardgame.persistent-stash.v1';
export const ACTIVE_RUN_STORAGE_KEY = 'cardgame.active-run.v1';
export const ACTIVE_RUN_STORAGE_KEY_PREFIX = `${ACTIVE_RUN_STORAGE_KEY}:`;

export type ActiveRunTargetIdentity = Partial<ExpeditionRouteIdentity> | null | undefined;
export type ActiveRunStorageLookup = string | ActiveRunTargetIdentity;
export type RunPersistenceStorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const memoryStorage = new Map<string, string>();

function getStorageAdapter(storage?: RunPersistenceStorageAdapter): RunPersistenceStorageAdapter {
    if (storage) {
        return storage;
    }

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

function readStoredJson<T>(key: string, storage = getStorageAdapter()): T | null {
    const rawValue = storage.getItem(key);

    if (!rawValue) {
        return null;
    }

    try {
        return JSON.parse(rawValue) as T;
    } catch {
        storage.removeItem(key);
        return null;
    }
}

function normalizeIdentityValue(value: string | undefined, fallback: string): string {
    const normalized = value?.trim();

    return normalized && normalized.length > 0 ? normalized : fallback;
}

function isIdentityLookup(value: ActiveRunStorageLookup): value is ActiveRunTargetIdentity {
    return typeof value === 'object' || value === null || value === undefined;
}

function safeDecodeRouteSegment(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function normalizeActiveRunIdentity(identity?: ActiveRunTargetIdentity): ExpeditionRouteIdentity {
    return {
        expeditionId: normalizeIdentityValue(identity?.expeditionId, DEFAULT_EXPEDITION_ID),
        mapId: normalizeIdentityValue(identity?.mapId, DEFAULT_EXPEDITION_MAP_ID),
    };
}

export function parseActiveRunRouteKey(routeKey?: string | null): ExpeditionRouteIdentity | null {
    const normalizedRouteKey = routeKey?.trim();

    if (!normalizedRouteKey) {
        return null;
    }

    const match = /^expedition:([^:]+):([^:]+)$/.exec(normalizedRouteKey);

    if (!match) {
        return null;
    }

    return normalizeActiveRunIdentity({
        expeditionId: safeDecodeRouteSegment(match[1]),
        mapId: safeDecodeRouteSegment(match[2]),
    });
}

export function createActiveRunRouteKey(identity?: ActiveRunTargetIdentity): string {
    const normalizedIdentity = normalizeActiveRunIdentity(identity);

    return `expedition:${encodeURIComponent(normalizedIdentity.expeditionId)}:${encodeURIComponent(normalizedIdentity.mapId)}`;
}

function resolveLookupIdentity(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): ExpeditionRouteIdentity {
    if (identity) {
        return normalizeActiveRunIdentity(identity);
    }

    if (isIdentityLookup(lookup)) {
        return normalizeActiveRunIdentity(lookup);
    }

    return parseActiveRunRouteKey(lookup) ?? normalizeActiveRunIdentity();
}

export function normalizeActiveRunRouteKey(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): string {
    return createActiveRunRouteKey(resolveLookupIdentity(lookup, identity));
}

function identitiesMatch(left: ExpeditionRouteIdentity, right: ExpeditionRouteIdentity): boolean {
    return left.expeditionId === right.expeditionId && left.mapId === right.mapId;
}

export function activeRunMatchesIdentity(run: RunSnapshot, identity?: ActiveRunTargetIdentity): boolean {
    return identitiesMatch(
        normalizeActiveRunIdentity(run),
        normalizeActiveRunIdentity(identity),
    );
}

export function createActiveRunStorageKey(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): string {
    return `${ACTIVE_RUN_STORAGE_KEY_PREFIX}${normalizeActiveRunRouteKey(lookup, identity)}`;
}

function createLegacyRouteStorageKey(routeKey?: string | null): string | null {
    const normalizedRouteKey = routeKey?.trim();

    return normalizedRouteKey ? `${ACTIVE_RUN_STORAGE_KEY_PREFIX}${normalizedRouteKey}` : null;
}

function attachRouteKey(run: RunSnapshot, routeKey: string): RunSnapshot {
    return {
        ...run,
        routeKey,
    };
}

function assertRunMatchesIdentity(run: RunSnapshot, identity: ExpeditionRouteIdentity): void {
    if (activeRunMatchesIdentity(run, identity)) {
        return;
    }

    throw new Error(
        `Cannot persist active run for ${run.expeditionId}/${run.mapId} under route ${identity.expeditionId}/${identity.mapId}.`,
    );
}

function readStoredActiveRun(
    key: string,
    identity: ExpeditionRouteIdentity,
    routeKey: string,
    storage: RunPersistenceStorageAdapter,
): RunSnapshot | null {
    const activeRun = readStoredJson<RunSnapshot>(key, storage);

    if (!activeRun) {
        return null;
    }

    if (!activeRunMatchesIdentity(activeRun, identity)) {
        storage.removeItem(key);
        return null;
    }

    return attachRouteKey(activeRun, routeKey);
}

function migrateLegacyActiveRun(
    identity: ExpeditionRouteIdentity,
    storage: RunPersistenceStorageAdapter,
): RunSnapshot | null {
    const legacyRun = readStoredJson<RunSnapshot>(ACTIVE_RUN_STORAGE_KEY, storage);

    if (!legacyRun || !activeRunMatchesIdentity(legacyRun, identity)) {
        return null;
    }

    const migratedRun = saveActiveRunToStorage(legacyRun, identity, undefined, storage);
    storage.removeItem(ACTIVE_RUN_STORAGE_KEY);

    return migratedRun;
}

function migrateLegacyRouteActiveRun(
    legacyRouteKey: string | undefined,
    identity: ExpeditionRouteIdentity,
    canonicalStorageKey: string,
    storage: RunPersistenceStorageAdapter,
): RunSnapshot | null {
    const legacyStorageKey = createLegacyRouteStorageKey(legacyRouteKey);

    if (!legacyStorageKey || legacyStorageKey === canonicalStorageKey) {
        return null;
    }

    const legacyRun = readStoredJson<RunSnapshot>(legacyStorageKey, storage);

    if (!legacyRun || !activeRunMatchesIdentity(legacyRun, identity)) {
        return null;
    }

    const migratedRun = saveActiveRunToStorage(legacyRun, identity, undefined, storage);
    storage.removeItem(legacyStorageKey);

    return migratedRun;
}

function removeLegacyActiveRunIfOwnedBy(
    identity: ExpeditionRouteIdentity,
    storage = getStorageAdapter(),
): void {
    const legacyRun = readStoredJson<RunSnapshot>(ACTIVE_RUN_STORAGE_KEY, storage);

    if (!legacyRun || activeRunMatchesIdentity(legacyRun, identity)) {
        storage.removeItem(ACTIVE_RUN_STORAGE_KEY);
    }
}

function removeLegacyRouteStorageKey(
    routeKey: string | null | undefined,
    canonicalStorageKey: string | undefined,
    storage: RunPersistenceStorageAdapter,
): void {
    const legacyStorageKey = createLegacyRouteStorageKey(routeKey);

    if (legacyStorageKey && legacyStorageKey !== canonicalStorageKey) {
        storage.removeItem(legacyStorageKey);
    }
}

function getEnumerableStorageKeys(storage: RunPersistenceStorageAdapter): string[] {
    const enumerableStorage = storage as Storage;

    if (typeof enumerableStorage.key !== 'function' || typeof enumerableStorage.length !== 'number') {
        return [];
    }

    const keys: string[] = [];

    for (let index = 0; index < enumerableStorage.length; index += 1) {
        const key = enumerableStorage.key(index);

        if (key) {
            keys.push(key);
        }
    }

    return keys;
}

function removeAllActiveRunStorageKeys(): void {
    const storage = getStorageAdapter();

    storage.removeItem(ACTIVE_RUN_STORAGE_KEY);

    for (const key of getEnumerableStorageKeys(storage)) {
        if (key.startsWith(ACTIVE_RUN_STORAGE_KEY_PREFIX)) {
            storage.removeItem(key);
        }
    }
}

export function loadPersistentStash(storage?: RunPersistenceStorageAdapter): PersistentStash | null {
    return readStoredJson<PersistentStash>(STASH_STORAGE_KEY, getStorageAdapter(storage));
}

export function savePersistentStash(stash: PersistentStash): void {
    getStorageAdapter().setItem(STASH_STORAGE_KEY, JSON.stringify(stash));
}

export function loadActiveRun(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
    storage?: RunPersistenceStorageAdapter,
): RunSnapshot | null {
    const storageAdapter = getStorageAdapter(storage);
    const normalizedIdentity = resolveLookupIdentity(lookup, identity);
    const routeKey = createActiveRunRouteKey(normalizedIdentity);
    const storageKey = createActiveRunStorageKey(normalizedIdentity);
    const storedActiveRun = readStoredActiveRun(storageKey, normalizedIdentity, routeKey, storageAdapter);

    if (storedActiveRun) {
        return storedActiveRun;
    }

    return migrateLegacyRouteActiveRun(
        typeof lookup === 'string' ? lookup : undefined,
        normalizedIdentity,
        storageKey,
        storageAdapter,
    ) ?? migrateLegacyActiveRun(normalizedIdentity, storageAdapter);
}

function saveActiveRunToStorage(
    run: RunSnapshot,
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
    storageAdapter = getStorageAdapter(),
): RunSnapshot {
    const normalizedIdentity = resolveLookupIdentity(lookup ?? run, identity);
    const routeKey = createActiveRunRouteKey(normalizedIdentity);
    const activeRun = attachRouteKey(run, routeKey);
    const storageKey = createActiveRunStorageKey(normalizedIdentity);

    assertRunMatchesIdentity(activeRun, normalizedIdentity);
    storageAdapter.setItem(storageKey, JSON.stringify(activeRun));
    removeLegacyActiveRunIfOwnedBy(normalizedIdentity, storageAdapter);

    if (typeof lookup === 'string') {
        removeLegacyRouteStorageKey(lookup, storageKey, storageAdapter);
    }

    return activeRun;
}

export function saveActiveRun(
    run: RunSnapshot,
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): RunSnapshot {
    return saveActiveRunToStorage(run, lookup, identity);
}

export function clearActiveRun(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): void {
    const storageAdapter = getStorageAdapter();
    const normalizedIdentity = resolveLookupIdentity(lookup, identity);

    storageAdapter.removeItem(createActiveRunStorageKey(normalizedIdentity));
    removeLegacyActiveRunIfOwnedBy(normalizedIdentity, storageAdapter);

    if (typeof lookup === 'string') {
        removeLegacyRouteStorageKey(lookup, undefined, storageAdapter);
    }
}

export function resetRunPersistenceForTests(): void {
    memoryStorage.clear();
    removeAllActiveRunStorageKeys();
    getStorageAdapter().removeItem(STASH_STORAGE_KEY);
}
