import {
    createSaveWorldStateSnapshot,
    type SaveWorldStateActiveRunSlice,
    type SaveWorldStateFixedSlice,
    type SaveWorldStateRunResolutionView,
    type SaveWorldStateSnapshot,
    type SaveWorldStateSnapshotOptions,
} from '../services/SaveWorldStateSnapshot';
import type {
    ActiveRunCompatibilityKeys,
    ActiveRunSaveCompatibilityEntry,
    FixedKeySaveCompatibilityEntry,
} from '../services/SaveCompatibility';
import type { StoryHubSessionDocument } from '../services/StoryHubSessionPersistence';
import type { ExpeditionRouteIdentity, PersistentStash, RunSnapshot } from '../types/expedition';
import {
    createPersistentStashFromWorldStateSeed,
    type PersistentStashSeedSources,
} from './GameWorldStateSeed';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type DeepReadonly<TValue> = TValue extends Primitive
    ? TValue
    : TValue extends (...args: never[]) => unknown
        ? TValue
        : TValue extends readonly (infer TItem)[]
            ? readonly DeepReadonly<TItem>[]
            : TValue extends object
                ? { readonly [TKey in keyof TValue]: DeepReadonly<TValue[TKey]> }
                : TValue;

export type GameWorldStatePersistentStashSource = 'stored-stash' | 'seed-fallback';

export interface GameWorldStateStoryHubSessionView {
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly document: DeepReadonly<StoryHubSessionDocument>;
}

export interface GameWorldStatePersistentStashView {
    readonly source: GameWorldStatePersistentStashSource;
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly document: DeepReadonly<PersistentStash>;
}

export interface GameWorldStateActiveRunView {
    readonly compatibility: DeepReadonly<ActiveRunSaveCompatibilityEntry>;
    readonly keys: DeepReadonly<ActiveRunCompatibilityKeys>;
    readonly identity: DeepReadonly<ExpeditionRouteIdentity>;
    readonly document: DeepReadonly<RunSnapshot> | null;
}

export interface GameWorldStateRunResolutionMetadata extends DeepReadonly<SaveWorldStateRunResolutionView> {}

export interface GameWorldState {
    readonly storyHubSession: GameWorldStateStoryHubSessionView;
    readonly persistentStash: GameWorldStatePersistentStashView;
    readonly activeRun: GameWorldStateActiveRunView;
    readonly runResolution: GameWorldStateRunResolutionMetadata;
}

export interface GameWorldStateOptions extends SaveWorldStateSnapshotOptions, PersistentStashSeedSources {}

function cloneJsonDocument<TDocument>(document: TDocument): DeepReadonly<TDocument> {
    return JSON.parse(JSON.stringify(document)) as DeepReadonly<TDocument>;
}

function cloneFixedCompatibilityEntry(
    entry: FixedKeySaveCompatibilityEntry,
): DeepReadonly<FixedKeySaveCompatibilityEntry> {
    return {
        owner: entry.owner,
        boundaryModule: entry.boundaryModule,
        storageKey: entry.storageKey,
        storageKeyVersion: entry.storageKeyVersion,
        documentSchemaVersion: entry.documentSchemaVersion,
        persistedShape: entry.persistedShape,
        migrationHooks: [...entry.migrationHooks],
    };
}

function cloneActiveRunCompatibilityEntry(
    entry: ActiveRunSaveCompatibilityEntry,
): DeepReadonly<ActiveRunSaveCompatibilityEntry> {
    return {
        owner: entry.owner,
        boundaryModule: entry.boundaryModule,
        storageKeyVersion: entry.storageKeyVersion,
        documentSchemaVersion: entry.documentSchemaVersion,
        persistedShape: entry.persistedShape,
        canonicalStorageKeyPrefix: entry.canonicalStorageKeyPrefix,
        legacyUnscopedStorageKey: entry.legacyUnscopedStorageKey,
        routeKeyFormat: entry.routeKeyFormat,
        migrationHooks: [...entry.migrationHooks],
    };
}

function cloneActiveRunKeys(keys: ActiveRunCompatibilityKeys): DeepReadonly<ActiveRunCompatibilityKeys> {
    return {
        normalizedIdentity: {
            expeditionId: keys.normalizedIdentity.expeditionId,
            mapId: keys.normalizedIdentity.mapId,
        },
        routeKey: keys.routeKey,
        canonicalStorageKey: keys.canonicalStorageKey,
        legacyUnscopedStorageKey: keys.legacyUnscopedStorageKey,
        legacyRouteStorageKeys: [...keys.legacyRouteStorageKeys],
    };
}

function cloneStoryHubSessionView(
    slice: SaveWorldStateFixedSlice<StoryHubSessionDocument>,
): GameWorldStateStoryHubSessionView {
    return {
        compatibility: cloneFixedCompatibilityEntry(slice.compatibility),
        document: cloneJsonDocument(slice.document),
    };
}

function clonePersistentStashView(
    snapshot: SaveWorldStateSnapshot,
    seedSources: PersistentStashSeedSources,
): GameWorldStatePersistentStashView {
    const storedStash = snapshot.persistentStash.document;
    const source: GameWorldStatePersistentStashSource = storedStash ? 'stored-stash' : 'seed-fallback';
    const document = storedStash ?? createPersistentStashFromWorldStateSeed(seedSources);

    return {
        source,
        compatibility: cloneFixedCompatibilityEntry(snapshot.persistentStash.compatibility),
        document: cloneJsonDocument(document),
    };
}

function cloneActiveRunView(slice: SaveWorldStateActiveRunSlice): GameWorldStateActiveRunView {
    return {
        compatibility: cloneActiveRunCompatibilityEntry(slice.compatibility),
        keys: cloneActiveRunKeys(slice.keys),
        identity: {
            expeditionId: slice.keys.normalizedIdentity.expeditionId,
            mapId: slice.keys.normalizedIdentity.mapId,
        },
        document: slice.document ? cloneJsonDocument(slice.document) : null,
    };
}

function cloneRunResolutionMetadata(
    view: SaveWorldStateRunResolutionView,
): GameWorldStateRunResolutionMetadata {
    return {
        boundaryModule: view.boundaryModule,
        terminalOutcomes: [...view.terminalOutcomes],
    };
}

export function createGameWorldStateFromSnapshot(
    snapshot: SaveWorldStateSnapshot,
    seedSources: PersistentStashSeedSources,
): GameWorldState {
    return {
        storyHubSession: cloneStoryHubSessionView(snapshot.storyHubSession),
        persistentStash: clonePersistentStashView(snapshot, seedSources),
        activeRun: cloneActiveRunView(snapshot.activeRun),
        runResolution: cloneRunResolutionMetadata(snapshot.runResolution),
    };
}

export function createGameWorldState(options: GameWorldStateOptions): GameWorldState {
    const snapshot = createSaveWorldStateSnapshot({
        storage: options.storage,
        activeRunLookup: options.activeRunLookup,
        activeRunIdentity: options.activeRunIdentity,
    });

    return createGameWorldStateFromSnapshot(snapshot, {
        worldState: options.worldState,
        starterDeck: options.starterDeck,
    });
}
