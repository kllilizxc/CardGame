import {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
} from '../config/ExpeditionDefaults';
import { gameStorage } from './PreviewStorage';
import { isEquipSlotId, isValidEquippedItems } from '../state/EquipmentState';
import { getRunPlayerHealth, isRunPlayerHealth } from '../state/RunHealth';
import type { EquippedItems, ExpeditionItemStack, ExpeditionRouteIdentity, PersistentStash, RunSnapshot } from '../types/expedition';
import {
    cloneDeckCardStacks,
    cloneSavedDecks,
    createSavedDeck,
    DEFAULT_SAVED_DECK_ID,
    resolveSelectedDeckId,
} from '../state/PersistentStashDecks';

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
        return gameStorage(globalThis.localStorage);
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

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
    return value === undefined || value === null || typeof value === 'string';
}

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isCardStacks(value: unknown): value is PersistentStash['cards'] {
    return Array.isArray(value)
        && value.every((stack) => isRecord(stack) && isNonEmptyString(stack.id) && isNumber(stack.count));
}

function isItemStacks(value: unknown): value is PersistentStash['items'] {
    return Array.isArray(value)
        && value.every((stack) => isRecord(stack)
            && isNonEmptyString(stack.id)
            && typeof stack.itemType === 'string'
            && isNumber(stack.count));
}

/** An obsolete equipment reference must not invalidate the player's inventory or run. */
function normalizeEquippedItems(value: unknown, items: readonly ExpeditionItemStack[]): EquippedItems | undefined {
    if (value === undefined) return undefined;
    const normalized: EquippedItems = {};
    if (!isRecord(value)) return normalized;
    const seen = new Set<string>();
    for (const [slot, itemId] of Object.entries(value)) {
        if (!isEquipSlotId(slot) || !isNonEmptyString(itemId)
            || seen.has(itemId) || !items.some(item => item.id === itemId && item.count > 0)) continue;
        normalized[slot] = itemId;
        seen.add(itemId);
    }
    return normalized;
}

function normalizeRunEquipment(run: RunSnapshot): RunSnapshot {
    const withHealth = run.playerHealth !== undefined && !isRunPlayerHealth(run.playerHealth)
        ? { ...run, playerHealth: getRunPlayerHealth(run.playerHealth) } : run;
    const equippedItems = normalizeEquippedItems(withHealth.equippedItems, isItemStacks(withHealth.carriedItems) ? withHealth.carriedItems : []);
    return equippedItems === undefined ? withHealth : { ...withHealth, equippedItems };
}

function isRewardBundle(value: unknown): boolean {
    return isRecord(value)
        && isCardStacks(value.cards)
        && isItemStacks(value.items)
        && isNumber(value.spiritStones);
}

function isRunResolutionSummary(value: unknown): boolean {
    return value === null || (isRecord(value)
        && isNonEmptyString(value.runId)
        && (value.outcome === 'defeat' || value.outcome === 'extract' || value.outcome === 'boss-clear')
        && isNonEmptyString(value.finalNodeId)
        && isRewardBundle(value.kept)
        && isRewardBundle(value.lost)
        && isNonEmptyString(value.endedAt));
}

function normalizeLastRunSummary(value: unknown): PersistentStash['lastRunSummary'] {
    if (value === undefined) {
        return undefined;
    }

    return isRunResolutionSummary(value) ? JSON.parse(JSON.stringify(value)) as PersistentStash['lastRunSummary'] : undefined;
}

function normalizeCurrentPersistentStash(value: JsonRecord): PersistentStash | null {
    if (!isNonEmptyString(value.stashId)
        || !isCardStacks(value.cards)
        || !Array.isArray(value.savedDecks)
        || !isItemStacks(value.items)
        || !isNumber(value.spiritStones)
        || !isOptionalNullableString(value.selectedDeckId)) {
        return null;
    }

    const savedDecks = value.savedDecks
        .filter((savedDeck): savedDeck is JsonRecord => isRecord(savedDeck))
        .filter((savedDeck) => isNonEmptyString(savedDeck.id) && isNonEmptyString(savedDeck.name) && isCardStacks(savedDeck.cards))
        .map((savedDeck) => ({
            id: savedDeck.id as string,
            name: savedDeck.name as string,
            cards: cloneDeckCardStacks(savedDeck.cards as PersistentStash['cards']),
        }));

    if (savedDecks.length !== value.savedDecks.length) {
        return null;
    }

    const normalizedStash: PersistentStash = {
        stashId: value.stashId,
        cards: cloneDeckCardStacks(value.cards),
        savedDecks: cloneSavedDecks(savedDecks),
        selectedDeckId: resolveSelectedDeckId(value.selectedDeckId, savedDecks),
        items: JSON.parse(JSON.stringify(value.items)) as PersistentStash['items'],
        ...(value.equippedItems !== undefined ? { equippedItems: normalizeEquippedItems(value.equippedItems, value.items) } : {}),
        spiritStones: value.spiritStones,
        ...(value.itemSlotCapacity !== undefined ? { itemSlotCapacity: value.itemSlotCapacity as number } : {}),
    };
    if (value.itemSlotCapacity !== undefined && (typeof value.itemSlotCapacity !== 'number' || !Number.isSafeInteger(value.itemSlotCapacity) || value.itemSlotCapacity < 1)) return null;
    const lastRunSummary = normalizeLastRunSummary(value.lastRunSummary);

    if (value.lastRunSummary !== undefined && lastRunSummary === undefined) {
        return null;
    }

    if (lastRunSummary !== undefined) {
        normalizedStash.lastRunSummary = lastRunSummary;
    }

    if (value.claimedStoryGrantIds !== undefined) {
        if (!Array.isArray(value.claimedStoryGrantIds) || !value.claimedStoryGrantIds.every(isNonEmptyString)) return null;
        normalizedStash.claimedStoryGrantIds = [...new Set(value.claimedStoryGrantIds)];
    }
    if (value.settledStoryItemTransactionIds !== undefined) {
        if (!Array.isArray(value.settledStoryItemTransactionIds) || !value.settledStoryItemTransactionIds.every(isNonEmptyString)) return null;
        normalizedStash.settledStoryItemTransactionIds = [...new Set(value.settledStoryItemTransactionIds)];
    }

    return normalizedStash;
}

function normalizeLegacyPersistentStash(value: JsonRecord): PersistentStash | null {
    if (!isNonEmptyString(value.stashId)
        || !isCardStacks(value.deck)
        || !isItemStacks(value.items)
        || !isNumber(value.spiritStones)) {
        return null;
    }

    const starterSavedDeck = createSavedDeck(
        isNonEmptyString(value.deckRef) ? value.deckRef : DEFAULT_SAVED_DECK_ID,
        isNonEmptyString(value.deckRef) ? value.deckRef : undefined,
        value.deck,
    );
    const normalizedStash: PersistentStash = {
        stashId: value.stashId,
        cards: cloneDeckCardStacks(value.deck),
        savedDecks: [starterSavedDeck],
        selectedDeckId: starterSavedDeck.id,
        items: JSON.parse(JSON.stringify(value.items)) as PersistentStash['items'],
        ...(value.equippedItems !== undefined ? { equippedItems: normalizeEquippedItems(value.equippedItems, value.items) } : {}),
        spiritStones: value.spiritStones,
        ...(value.itemSlotCapacity !== undefined ? { itemSlotCapacity: value.itemSlotCapacity as number } : {}),
    };
    if (value.itemSlotCapacity !== undefined && (typeof value.itemSlotCapacity !== 'number' || !Number.isSafeInteger(value.itemSlotCapacity) || value.itemSlotCapacity < 1)) return null;
    const lastRunSummary = normalizeLastRunSummary(value.lastRunSummary);

    if (value.lastRunSummary !== undefined && lastRunSummary === undefined) {
        return null;
    }

    if (lastRunSummary !== undefined) {
        normalizedStash.lastRunSummary = lastRunSummary;
    }

    if (value.claimedStoryGrantIds !== undefined) {
        if (!Array.isArray(value.claimedStoryGrantIds) || !value.claimedStoryGrantIds.every(isNonEmptyString)) return null;
        normalizedStash.claimedStoryGrantIds = [...new Set(value.claimedStoryGrantIds)];
    }
    if (value.settledStoryItemTransactionIds !== undefined) {
        if (!Array.isArray(value.settledStoryItemTransactionIds) || !value.settledStoryItemTransactionIds.every(isNonEmptyString)) return null;
        normalizedStash.settledStoryItemTransactionIds = [...new Set(value.settledStoryItemTransactionIds)];
    }

    return normalizedStash;
}

function normalizePersistentStashDocument(value: unknown): PersistentStash | null {
    if (!isRecord(value)) {
        return null;
    }

    return normalizeCurrentPersistentStash(value) ?? normalizeLegacyPersistentStash(value);
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

    const normalized = normalizeRunEquipment(activeRun);
    if (JSON.stringify(normalized) !== JSON.stringify(activeRun)) storage.setItem(key, JSON.stringify(normalized));
    return attachRouteKey(normalized, routeKey);
}

function migrateLegacyActiveRun(
    identity: ExpeditionRouteIdentity,
    storage: RunPersistenceStorageAdapter,
): RunSnapshot | null {
    const legacyRun = readStoredJson<RunSnapshot>(ACTIVE_RUN_STORAGE_KEY, storage);

    if (!legacyRun || !activeRunMatchesIdentity(legacyRun, identity)) {
        return null;
    }

    const migratedRun = saveActiveRunToStorage(normalizeRunEquipment(legacyRun), identity, undefined, storage);
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

    const migratedRun = saveActiveRunToStorage(normalizeRunEquipment(legacyRun), identity, undefined, storage);
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
    const storageAdapter = getStorageAdapter(storage);
    const rawValue = storageAdapter.getItem(STASH_STORAGE_KEY);

    if (!rawValue) {
        return null;
    }

    let parsedValue: unknown;

    try {
        parsedValue = JSON.parse(rawValue);
    } catch {
        storageAdapter.removeItem(STASH_STORAGE_KEY);
        return null;
    }

    const normalizedStash = normalizePersistentStashDocument(parsedValue);

    if (!normalizedStash) {
        storageAdapter.removeItem(STASH_STORAGE_KEY);
        return null;
    }

    const normalizedRawValue = JSON.stringify(normalizedStash);

    if (normalizedRawValue !== rawValue) {
        storageAdapter.setItem(STASH_STORAGE_KEY, normalizedRawValue);
    }

    return normalizedStash;
}

export function savePersistentStash(
    stash: PersistentStash,
    storage?: RunPersistenceStorageAdapter,
): void {
    if (stash.equippedItems !== undefined && !isValidEquippedItems(stash.equippedItems, stash.items)) {
        throw new Error('Cannot save stash with invalid equipped items.');
    }
    getStorageAdapter(storage).setItem(STASH_STORAGE_KEY, JSON.stringify(stash));
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
    if (activeRun.equippedItems !== undefined && !isValidEquippedItems(activeRun.equippedItems, activeRun.carriedItems)) {
        throw new Error('Cannot save active run with invalid equipped items.');
    }
    if (activeRun.playerHealth !== undefined && !isRunPlayerHealth(activeRun.playerHealth)) {
        throw new Error('Cannot save active run with invalid player health.');
    }
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
    storage?: RunPersistenceStorageAdapter,
): RunSnapshot {
    return saveActiveRunToStorage(run, lookup, identity, getStorageAdapter(storage));
}

export function clearActiveRun(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
    storage?: RunPersistenceStorageAdapter,
): void {
    const storageAdapter = getStorageAdapter(storage);
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
