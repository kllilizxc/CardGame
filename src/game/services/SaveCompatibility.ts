import {
    ACTIVE_RUN_STORAGE_KEY,
    ACTIVE_RUN_STORAGE_KEY_PREFIX,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    normalizeActiveRunIdentity,
    parseActiveRunRouteKey,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import type { ActiveRunStorageLookup, ActiveRunTargetIdentity } from './RunPersistence';
import {
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
} from './StoryHubSessionPersistence';
import type { ExpeditionRouteIdentity } from '../types/expedition';

export type SaveCompatibilityOwner = 'storyHubSession' | 'persistentStash' | 'activeRun';
export type PersistedSaveShape = 'StoryHubSessionDocument' | 'PersistentStash' | 'RunSnapshot';

export interface SaveMigrationHook {
    readonly description: string;
    readonly migrate: <TDocument>(document: TDocument) => TDocument;
}

export interface SaveCompatibilityEntry {
    readonly owner: SaveCompatibilityOwner;
    readonly boundaryModule: string;
    readonly storageKeyVersion: 1;
    readonly documentSchemaVersion: number | null;
    readonly persistedShape: PersistedSaveShape;
    readonly migrationHooks: readonly SaveMigrationHook[];
}

export interface FixedKeySaveCompatibilityEntry extends SaveCompatibilityEntry {
    readonly storageKey: string;
}

export interface ActiveRunSaveCompatibilityEntry extends SaveCompatibilityEntry {
    readonly canonicalStorageKeyPrefix: string;
    readonly legacyUnscopedStorageKey: string;
    readonly routeKeyFormat: 'expedition:<expeditionId>:<mapId>';
}

export interface SaveCompatibilityRegistry {
    readonly storyHubSession: FixedKeySaveCompatibilityEntry;
    readonly persistentStash: FixedKeySaveCompatibilityEntry;
    readonly activeRun: ActiveRunSaveCompatibilityEntry;
}

export interface ActiveRunCompatibilityKeys {
    readonly normalizedIdentity: ExpeditionRouteIdentity;
    readonly routeKey: string;
    readonly canonicalStorageKey: string;
    readonly legacyUnscopedStorageKey: string;
    readonly legacyRouteStorageKeys: readonly string[];
}

const NO_MIGRATION_HOOKS: readonly SaveMigrationHook[] = [];

export const SAVE_COMPATIBILITY_REGISTRY = {
    storyHubSession: {
        owner: 'storyHubSession',
        boundaryModule: 'src/game/services/StoryHubSessionPersistence.ts',
        storageKey: STORY_HUB_SESSION_STORAGE_KEY,
        storageKeyVersion: 1,
        documentSchemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        persistedShape: 'StoryHubSessionDocument',
        migrationHooks: NO_MIGRATION_HOOKS,
    },
    persistentStash: {
        owner: 'persistentStash',
        boundaryModule: 'src/game/services/RunPersistence.ts',
        storageKey: STASH_STORAGE_KEY,
        storageKeyVersion: 1,
        documentSchemaVersion: null,
        persistedShape: 'PersistentStash',
        migrationHooks: NO_MIGRATION_HOOKS,
    },
    activeRun: {
        owner: 'activeRun',
        boundaryModule: 'src/game/services/RunPersistence.ts',
        storageKeyVersion: 1,
        documentSchemaVersion: null,
        persistedShape: 'RunSnapshot',
        canonicalStorageKeyPrefix: ACTIVE_RUN_STORAGE_KEY_PREFIX,
        legacyUnscopedStorageKey: ACTIVE_RUN_STORAGE_KEY,
        routeKeyFormat: 'expedition:<expeditionId>:<mapId>',
        migrationHooks: NO_MIGRATION_HOOKS,
    },
} as const satisfies SaveCompatibilityRegistry;

function isIdentityLookup(value: ActiveRunStorageLookup): value is ActiveRunTargetIdentity {
    return typeof value === 'object' || value === null || value === undefined;
}

function resolveCompatibilityIdentity(
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

function createLegacyRouteStorageKey(routeKey?: string | null): string | null {
    const normalizedRouteKey = routeKey?.trim();

    return normalizedRouteKey ? `${ACTIVE_RUN_STORAGE_KEY_PREFIX}${normalizedRouteKey}` : null;
}

export function createActiveRunCompatibilityKeys(
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): ActiveRunCompatibilityKeys {
    const normalizedIdentity = resolveCompatibilityIdentity(lookup, identity);
    const routeKey = createActiveRunRouteKey(normalizedIdentity);
    const canonicalStorageKey = createActiveRunStorageKey(normalizedIdentity);
    const legacyRouteStorageKey = typeof lookup === 'string'
        ? createLegacyRouteStorageKey(lookup)
        : null;

    return {
        normalizedIdentity,
        routeKey,
        canonicalStorageKey,
        legacyUnscopedStorageKey: ACTIVE_RUN_STORAGE_KEY,
        legacyRouteStorageKeys: legacyRouteStorageKey && legacyRouteStorageKey !== canonicalStorageKey
            ? [legacyRouteStorageKey]
            : [],
    };
}

export function applySaveCompatibilityMigrations<TDocument>(
    owner: SaveCompatibilityOwner,
    document: TDocument,
): TDocument {
    return SAVE_COMPATIBILITY_REGISTRY[owner].migrationHooks.reduce(
        (currentDocument, migrationHook) => migrationHook.migrate(currentDocument),
        document,
    );
}
