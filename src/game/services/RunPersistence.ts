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
): RunSnapshot | null {
    const activeRun = readStoredJson<RunSnapshot>(key);

    if (!activeRun) {
        return null;
    }

    if (!activeRunMatchesIdentity(activeRun, identity)) {
        getStorageAdapter().removeItem(key);
        return null;
    }

    return attachRouteKey(activeRun, routeKey);
}

function migrateLegacyActiveRun(identity: ExpeditionRouteIdentity): RunSnapshot | null {
    const legacyRun = readStoredJson<RunSnapshot>(ACTIVE_RUN_STORAGE_KEY);

    if (!legacyRun || !activeRunMatchesIdentity(legacyRun, identity)) {
        return null;
    }

    const migratedRun = saveActiveRun(legacyRun, identity);
    getStorageAdapter().removeItem(ACTIVE_RUN_STORAGE_KEY);

    return migratedRun;
}

function migrateLegacyRouteActiveRun(
    legacyRouteKey: string | undefined,
    identity: ExpeditionRouteIdentity,
    canonicalStorageKey: string,
): RunSnapshot | null {
    const legacyStorageKey = createLegacyRouteStorageKey(legacyRouteKey);

    if (!legacyStorageKey || legacyStorageKey === canonicalStorageKey) {
        return null;
    }

    const legacyRun = readStoredJson<RunSnapshot>(legacyStorageKey);

    if (!legacyRun || !activeRunMatchesIdentity(legacyRun, identity)) {
        return null;
    }

    const migratedRun = saveActiveRun(legacyRun, identity);
    getStorageAdapter().removeItem(legacyStorageKey);

    return migratedRun;
}

function removeLegacyActiveRunIfOwnedBy(identity: ExpeditionRouteIdentity): void {
    const legacyRun = readStoredJson<RunSnapshot>(ACTIVE_RUN_STORAGE_KEY);

    if (!legacyRun || activeRunMatchesIdentity(legacyRun, identity)) {
        getStorageAdapter().removeItem(ACTIVE_RUN_STORAGE_KEY);
    }
}

function removeLegacyRouteStorageKey(routeKey?: string | null, canonicalStorageKey?: string): void {
    const legacyStorageKey = createLegacyRouteStorageKey(routeKey);

    if (legacyStorageKey && legacyStorageKey !== canonicalStorageKey) {
        getStorageAdapter().removeItem(legacyStorageKey);
    }
}

function getEnumerableStorageKeys(storage: StorageAdapter): string[] {
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

export function loadPersistentStash(): PersistentStash | null {
    return readStoredJson<PersistentStash>(STASH_STORAGE_KEY);
}

export function savePersistentStash(stash: PersistentStash): void {
    getStorageAdapter().setItem(STASH_STORAGE_KEY, JSON.stringify(stash));
}

export function loadActiveRun(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): RunSnapshot | null {
    const normalizedIdentity = resolveLookupIdentity(lookup, identity);
    const routeKey = createActiveRunRouteKey(normalizedIdentity);
    const storageKey = createActiveRunStorageKey(normalizedIdentity);
    const storedActiveRun = readStoredActiveRun(storageKey, normalizedIdentity, routeKey);

    if (storedActiveRun) {
        return storedActiveRun;
    }

    return migrateLegacyRouteActiveRun(
        typeof lookup === 'string' ? lookup : undefined,
        normalizedIdentity,
        storageKey,
    ) ?? migrateLegacyActiveRun(normalizedIdentity);
}

export function saveActiveRun(
    run: RunSnapshot,
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): RunSnapshot {
    const normalizedIdentity = resolveLookupIdentity(lookup ?? run, identity);
    const routeKey = createActiveRunRouteKey(normalizedIdentity);
    const activeRun = attachRouteKey(run, routeKey);
    const storageKey = createActiveRunStorageKey(normalizedIdentity);

    assertRunMatchesIdentity(activeRun, normalizedIdentity);
    getStorageAdapter().setItem(storageKey, JSON.stringify(activeRun));
    removeLegacyActiveRunIfOwnedBy(normalizedIdentity);

    if (typeof lookup === 'string') {
        removeLegacyRouteStorageKey(lookup, storageKey);
    }

    return activeRun;
}

export function clearActiveRun(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): void {
    const normalizedIdentity = resolveLookupIdentity(lookup, identity);

    getStorageAdapter().removeItem(createActiveRunStorageKey(normalizedIdentity));
    removeLegacyActiveRunIfOwnedBy(normalizedIdentity);

    if (typeof lookup === 'string') {
        removeLegacyRouteStorageKey(lookup);
    }
}

export function resetRunPersistenceForTests(): void {
    memoryStorage.clear();
    removeAllActiveRunStorageKeys();
    getStorageAdapter().removeItem(STASH_STORAGE_KEY);
}
