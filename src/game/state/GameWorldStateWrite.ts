import {
    SAVE_COMPATIBILITY_REGISTRY,
    type ActiveRunCompatibilityKeys,
    type ActiveRunSaveCompatibilityEntry,
    type FixedKeySaveCompatibilityEntry,
} from '../services/SaveCompatibility';
import {
    STASH_STORAGE_KEY,
    type ActiveRunStorageLookup,
    type ActiveRunTargetIdentity,
    type RunPersistenceStorageAdapter,
} from '../services/RunPersistence';
import {
    RUN_RESOLUTION_BOUNDARY_MODULE,
    RUN_RESOLUTION_TERMINAL_OUTCOMES,
} from '../services/RunResolution';
import type {
    StoryHubSessionDocument,
    StoryHubSessionStorageAdapter,
} from '../services/StoryHubSessionPersistence';
import type { PersistentStash, RunSnapshot } from '../types/expedition';
import {
    createGameWorldState,
    type DeepReadonly,
    type GameWorldState,
    type GameWorldStateOptions,
    type GameWorldStatePersistentStashSource,
    type GameWorldStateRunResolutionMetadata,
} from './GameWorldState';
import {
    applyGameWorldStateActiveRunPlan,
    planGameWorldStateActiveRunWriteFromDocument,
    planGameWorldStateActiveRunWriteFromView,
    type GameWorldStateActiveRunWritePlan,
    type GameWorldStateActiveRunWriteResult,
} from './GameWorldStateActiveRunWrite';
import {
    planGameWorldStatePersistentStashWriteFromDocument,
    planGameWorldStatePersistentStashWriteFromView,
    writeGameWorldStatePersistentStashPlan,
    type GameWorldStatePersistentStashWritePlan,
    type GameWorldStatePersistentStashWriteResult,
} from './GameWorldStatePersistentStashWrite';
import {
    applyGameWorldStateStoryHubSessionPlan,
    planGameWorldStateStoryHubSessionWriteFromDocument,
    planGameWorldStateStoryHubSessionWriteFromView,
    type GameWorldStateStoryHubSessionWritePlan,
    type GameWorldStateStoryHubSessionWriteResult,
} from './GameWorldStateStoryHubSessionWrite';

export type GameWorldStateWriteStorageAdapter =
    StoryHubSessionStorageAdapter & RunPersistenceStorageAdapter;

export interface GameWorldStateWriteOptions extends Omit<GameWorldStateOptions, 'storage'> {
    readonly storage: GameWorldStateWriteStorageAdapter;
}

export interface GameWorldStateWriteFromDocumentsOptions {
    readonly storyHubSession: DeepReadonly<StoryHubSessionDocument>;
    readonly persistentStash: DeepReadonly<PersistentStash> | null;
    readonly persistentStashSource?: GameWorldStatePersistentStashSource;
    readonly activeRun: DeepReadonly<RunSnapshot> | null;
    readonly activeRunLookup?: ActiveRunStorageLookup;
    readonly activeRunIdentity?: ActiveRunTargetIdentity;
}

export const GAME_WORLD_STATE_WRITE_SLICE_ORDER = [
    'storyHubSession',
    'persistentStash',
    'activeRun',
] as const;

export type GameWorldStateWriteSliceOwner = typeof GAME_WORLD_STATE_WRITE_SLICE_ORDER[number];

export interface GameWorldStatePersistentStashClearPlan {
    readonly operation: 'clear';
    readonly storageKey: typeof STASH_STORAGE_KEY;
    readonly document: null;
    readonly reason: 'document-null';
}

export interface GameWorldStatePersistentStashClearResult extends GameWorldStatePersistentStashClearPlan {}

export interface GameWorldStateWriteStoryHubSessionSlicePlan {
    readonly owner: 'storyHubSession';
    readonly operation: 'save';
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly plan: GameWorldStateStoryHubSessionWritePlan;
}

export interface GameWorldStateWriteStoryHubSessionSliceResult {
    readonly owner: 'storyHubSession';
    readonly operation: 'save';
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly result: GameWorldStateStoryHubSessionWriteResult;
}

export interface GameWorldStateWritePersistentStashSaveSlicePlan {
    readonly owner: 'persistentStash';
    readonly operation: 'save';
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly plan: GameWorldStatePersistentStashWritePlan;
}

export interface GameWorldStateWritePersistentStashSaveSliceResult {
    readonly owner: 'persistentStash';
    readonly operation: 'save';
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly result: GameWorldStatePersistentStashWriteResult;
}

export interface GameWorldStateWritePersistentStashClearSlicePlan {
    readonly owner: 'persistentStash';
    readonly operation: 'clear';
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly plan: GameWorldStatePersistentStashClearPlan;
}

export interface GameWorldStateWritePersistentStashClearSliceResult {
    readonly owner: 'persistentStash';
    readonly operation: 'clear';
    readonly compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>;
    readonly result: GameWorldStatePersistentStashClearResult;
}

export type GameWorldStateWritePersistentStashSlicePlan =
    | GameWorldStateWritePersistentStashSaveSlicePlan
    | GameWorldStateWritePersistentStashClearSlicePlan;

export type GameWorldStateWritePersistentStashSliceResult =
    | GameWorldStateWritePersistentStashSaveSliceResult
    | GameWorldStateWritePersistentStashClearSliceResult;

export interface GameWorldStateWriteActiveRunSlicePlan {
    readonly owner: 'activeRun';
    readonly operation: GameWorldStateActiveRunWritePlan['operation'];
    readonly compatibility: DeepReadonly<ActiveRunSaveCompatibilityEntry>;
    readonly keys: DeepReadonly<ActiveRunCompatibilityKeys>;
    readonly plan: GameWorldStateActiveRunWritePlan;
}

export interface GameWorldStateWriteActiveRunSliceResult {
    readonly owner: 'activeRun';
    readonly operation: GameWorldStateActiveRunWriteResult['operation'];
    readonly compatibility: DeepReadonly<ActiveRunSaveCompatibilityEntry>;
    readonly keys: DeepReadonly<ActiveRunCompatibilityKeys>;
    readonly result: GameWorldStateActiveRunWriteResult;
}

export type GameWorldStateWriteSlicePlan =
    | GameWorldStateWriteStoryHubSessionSlicePlan
    | GameWorldStateWritePersistentStashSlicePlan
    | GameWorldStateWriteActiveRunSlicePlan;

export type GameWorldStateWriteSliceResult =
    | GameWorldStateWriteStoryHubSessionSliceResult
    | GameWorldStateWritePersistentStashSliceResult
    | GameWorldStateWriteActiveRunSliceResult;

export type GameWorldStateWriteSlicePlanTuple = readonly [
    GameWorldStateWriteStoryHubSessionSlicePlan,
    GameWorldStateWritePersistentStashSlicePlan,
    GameWorldStateWriteActiveRunSlicePlan,
];

export type GameWorldStateWriteSliceResultTuple = readonly [
    GameWorldStateWriteStoryHubSessionSliceResult,
    GameWorldStateWritePersistentStashSliceResult,
    GameWorldStateWriteActiveRunSliceResult,
];

export interface GameWorldStateWritePlan {
    readonly owner: 'gameWorldState';
    readonly sliceOrder: typeof GAME_WORLD_STATE_WRITE_SLICE_ORDER;
    readonly runResolution: GameWorldStateRunResolutionMetadata;
    readonly slices: GameWorldStateWriteSlicePlanTuple;
}

export interface GameWorldStateWriteResult {
    readonly owner: 'gameWorldState';
    readonly status: 'success';
    readonly sliceOrder: typeof GAME_WORLD_STATE_WRITE_SLICE_ORDER;
    readonly runResolution: GameWorldStateRunResolutionMetadata;
    readonly slices: GameWorldStateWriteSliceResultTuple;
}

function assertExplicitStorageAdapter(storage: GameWorldStateWriteStorageAdapter): void {
    const candidate = storage as Partial<GameWorldStateWriteStorageAdapter> | null | undefined;

    if (
        candidate
        && typeof candidate.getItem === 'function'
        && typeof candidate.setItem === 'function'
        && typeof candidate.removeItem === 'function'
    ) {
        return;
    }

    throw new Error(
        'GameWorldState write requires an explicit storage adapter with getItem, setItem, and removeItem.',
    );
}

function cloneFixedCompatibilityEntry(
    entry: DeepReadonly<FixedKeySaveCompatibilityEntry>,
): FixedKeySaveCompatibilityEntry {
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
    entry: DeepReadonly<ActiveRunSaveCompatibilityEntry>,
): ActiveRunSaveCompatibilityEntry {
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

function cloneActiveRunKeys(keys: DeepReadonly<ActiveRunCompatibilityKeys>): ActiveRunCompatibilityKeys {
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

function cloneRunResolutionMetadata(
    metadata: DeepReadonly<GameWorldStateRunResolutionMetadata>,
): GameWorldStateRunResolutionMetadata {
    return {
        boundaryModule: metadata.boundaryModule,
        terminalOutcomes: [...metadata.terminalOutcomes],
    };
}

function createCurrentRunResolutionMetadata(): GameWorldStateRunResolutionMetadata {
    return {
        boundaryModule: RUN_RESOLUTION_BOUNDARY_MODULE,
        terminalOutcomes: [...RUN_RESOLUTION_TERMINAL_OUTCOMES],
    };
}

function migrationHooksMatch(
    left: DeepReadonly<FixedKeySaveCompatibilityEntry | ActiveRunSaveCompatibilityEntry>['migrationHooks'],
    right: DeepReadonly<FixedKeySaveCompatibilityEntry | ActiveRunSaveCompatibilityEntry>['migrationHooks'],
): boolean {
    return left.length === right.length
        && left.every((hook, index) => hook.description === right[index]?.description);
}

function assertFixedCompatibilityEntry(
    actual: DeepReadonly<FixedKeySaveCompatibilityEntry>,
    expected: FixedKeySaveCompatibilityEntry,
): void {
    if (
        actual.owner === expected.owner
        && actual.boundaryModule === expected.boundaryModule
        && actual.storageKey === expected.storageKey
        && actual.storageKeyVersion === expected.storageKeyVersion
        && actual.documentSchemaVersion === expected.documentSchemaVersion
        && actual.persistedShape === expected.persistedShape
        && migrationHooksMatch(actual.migrationHooks, expected.migrationHooks)
    ) {
        return;
    }

    throw new Error(`GameWorldState write attempted to use incompatible ${expected.owner} compatibility metadata.`);
}

function assertActiveRunCompatibilityEntry(
    actual: DeepReadonly<ActiveRunSaveCompatibilityEntry>,
): void {
    const expected = SAVE_COMPATIBILITY_REGISTRY.activeRun;

    if (
        actual.owner === expected.owner
        && actual.boundaryModule === expected.boundaryModule
        && actual.storageKeyVersion === expected.storageKeyVersion
        && actual.documentSchemaVersion === expected.documentSchemaVersion
        && actual.persistedShape === expected.persistedShape
        && actual.canonicalStorageKeyPrefix === expected.canonicalStorageKeyPrefix
        && actual.legacyUnscopedStorageKey === expected.legacyUnscopedStorageKey
        && actual.routeKeyFormat === expected.routeKeyFormat
        && migrationHooksMatch(actual.migrationHooks, expected.migrationHooks)
    ) {
        return;
    }

    throw new Error('GameWorldState write attempted to use incompatible activeRun compatibility metadata.');
}

function assertRunResolutionMetadata(metadata: DeepReadonly<GameWorldStateRunResolutionMetadata>): void {
    if (
        metadata.boundaryModule === RUN_RESOLUTION_BOUNDARY_MODULE
        && metadata.terminalOutcomes.length === RUN_RESOLUTION_TERMINAL_OUTCOMES.length
        && RUN_RESOLUTION_TERMINAL_OUTCOMES.every(
            (outcome, index) => metadata.terminalOutcomes[index] === outcome,
        )
    ) {
        return;
    }

    throw new Error('GameWorldState write attempted to use incompatible runResolution metadata.');
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function createActiveRunKeysFromPlan(plan: GameWorldStateActiveRunWritePlan): ActiveRunCompatibilityKeys {
    return {
        normalizedIdentity: {
            expeditionId: plan.identity.expeditionId,
            mapId: plan.identity.mapId,
        },
        routeKey: plan.routeKey,
        canonicalStorageKey: plan.canonicalStorageKey,
        legacyUnscopedStorageKey: plan.legacyUnscopedStorageKey,
        legacyRouteStorageKeys: [...plan.legacyRouteStorageKeys],
    };
}

function assertActiveRunKeysMatchPlan(
    keys: DeepReadonly<ActiveRunCompatibilityKeys>,
    plan: GameWorldStateActiveRunWritePlan,
): void {
    if (
        keys.normalizedIdentity.expeditionId === plan.identity.expeditionId
        && keys.normalizedIdentity.mapId === plan.identity.mapId
        && keys.routeKey === plan.routeKey
        && keys.canonicalStorageKey === plan.canonicalStorageKey
        && keys.legacyUnscopedStorageKey === plan.legacyUnscopedStorageKey
        && sameStringArray(keys.legacyRouteStorageKeys, plan.legacyRouteStorageKeys)
    ) {
        return;
    }

    throw new Error('GameWorldState write attempted to use mismatched activeRun key metadata.');
}

function cloneStoryHubSessionWritePlan(
    plan: GameWorldStateStoryHubSessionWritePlan,
): GameWorldStateStoryHubSessionWritePlan {
    return planGameWorldStateStoryHubSessionWriteFromDocument({
        document: plan.document,
    });
}

function clonePersistentStashWritePlan(
    plan: GameWorldStatePersistentStashWritePlan,
): GameWorldStatePersistentStashWritePlan {
    return planGameWorldStatePersistentStashWriteFromDocument({
        source: plan.source,
        document: plan.document,
    });
}

function clonePersistentStashClearPlan(
    plan: GameWorldStatePersistentStashClearPlan,
): GameWorldStatePersistentStashClearPlan {
    return {
        operation: plan.operation,
        storageKey: plan.storageKey,
        document: null,
        reason: plan.reason,
    };
}

function cloneActiveRunWritePlan(plan: GameWorldStateActiveRunWritePlan): GameWorldStateActiveRunWritePlan {
    return planGameWorldStateActiveRunWriteFromDocument({
        document: plan.document,
        activeRunLookup: plan.legacyRouteLookup,
        activeRunIdentity: plan.identity,
    });
}

function createPersistentStashClearPlan(): GameWorldStatePersistentStashClearPlan {
    return {
        operation: 'clear',
        storageKey: STASH_STORAGE_KEY,
        document: null,
        reason: 'document-null',
    };
}

function assertPersistentStashClearPlan(plan: GameWorldStatePersistentStashClearPlan): void {
    if (plan.operation === 'clear'
        && plan.storageKey === STASH_STORAGE_KEY
        && plan.document === null
        && plan.reason === 'document-null') {
        return;
    }

    throw new Error('GameWorldState persistent-stash clear plan must remove the current persistent stash key.');
}

function createStoryHubSessionSlicePlan(
    compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>,
    plan: GameWorldStateStoryHubSessionWritePlan,
): GameWorldStateWriteStoryHubSessionSlicePlan {
    const slice = {
        owner: 'storyHubSession',
        operation: 'save',
        compatibility: cloneFixedCompatibilityEntry(compatibility),
        plan: cloneStoryHubSessionWritePlan(plan),
    } as const satisfies GameWorldStateWriteStoryHubSessionSlicePlan;

    assertFixedCompatibilityEntry(slice.compatibility, SAVE_COMPATIBILITY_REGISTRY.storyHubSession);

    return slice;
}

function createPersistentStashSaveSlicePlan(
    compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>,
    plan: GameWorldStatePersistentStashWritePlan,
): GameWorldStateWritePersistentStashSaveSlicePlan {
    const slice = {
        owner: 'persistentStash',
        operation: 'save',
        compatibility: cloneFixedCompatibilityEntry(compatibility),
        plan: clonePersistentStashWritePlan(plan),
    } as const satisfies GameWorldStateWritePersistentStashSaveSlicePlan;

    assertFixedCompatibilityEntry(slice.compatibility, SAVE_COMPATIBILITY_REGISTRY.persistentStash);

    return slice;
}

function createPersistentStashClearSlicePlan(
    compatibility: DeepReadonly<FixedKeySaveCompatibilityEntry>,
): GameWorldStateWritePersistentStashClearSlicePlan {
    const slice = {
        owner: 'persistentStash',
        operation: 'clear',
        compatibility: cloneFixedCompatibilityEntry(compatibility),
        plan: createPersistentStashClearPlan(),
    } as const satisfies GameWorldStateWritePersistentStashClearSlicePlan;

    assertFixedCompatibilityEntry(slice.compatibility, SAVE_COMPATIBILITY_REGISTRY.persistentStash);

    return slice;
}

function createActiveRunSlicePlan(
    compatibility: DeepReadonly<ActiveRunSaveCompatibilityEntry>,
    keys: DeepReadonly<ActiveRunCompatibilityKeys>,
    plan: GameWorldStateActiveRunWritePlan,
): GameWorldStateWriteActiveRunSlicePlan {
    const clonedPlan = cloneActiveRunWritePlan(plan);
    const slice = {
        owner: 'activeRun',
        operation: clonedPlan.operation,
        compatibility: cloneActiveRunCompatibilityEntry(compatibility),
        keys: cloneActiveRunKeys(keys),
        plan: clonedPlan,
    } as const satisfies GameWorldStateWriteActiveRunSlicePlan;

    assertActiveRunCompatibilityEntry(slice.compatibility);
    assertActiveRunKeysMatchPlan(slice.keys, slice.plan);

    return slice;
}

function assertGameWorldStateWritePlan(plan: GameWorldStateWritePlan): void {
    if (plan.owner !== 'gameWorldState') {
        throw new Error('GameWorldState write plan must target the gameWorldState owner.');
    }

    if (!sameStringArray(plan.sliceOrder, GAME_WORLD_STATE_WRITE_SLICE_ORDER)) {
        throw new Error('GameWorldState write plan uses an incompatible slice order.');
    }

    if (plan.slices.length !== GAME_WORLD_STATE_WRITE_SLICE_ORDER.length
        || plan.slices.some((slice, index) => slice.owner !== GAME_WORLD_STATE_WRITE_SLICE_ORDER[index])) {
        throw new Error('GameWorldState write plan slices must be ordered storyHubSession, persistentStash, activeRun.');
    }

    const [storyHubSession, persistentStash, activeRun] = plan.slices;

    assertFixedCompatibilityEntry(storyHubSession.compatibility, SAVE_COMPATIBILITY_REGISTRY.storyHubSession);
    assertFixedCompatibilityEntry(persistentStash.compatibility, SAVE_COMPATIBILITY_REGISTRY.persistentStash);
    assertActiveRunCompatibilityEntry(activeRun.compatibility);
    assertActiveRunKeysMatchPlan(activeRun.keys, activeRun.plan);

    if (persistentStash.operation === 'clear') {
        assertPersistentStashClearPlan(persistentStash.plan);
    }

    assertRunResolutionMetadata(plan.runResolution);
}

function createGameWorldStateWritePlanFromSlicePlans(
    storyHubSession: GameWorldStateWriteStoryHubSessionSlicePlan,
    persistentStash: GameWorldStateWritePersistentStashSlicePlan,
    activeRun: GameWorldStateWriteActiveRunSlicePlan,
    runResolution: DeepReadonly<GameWorldStateRunResolutionMetadata>,
): GameWorldStateWritePlan {
    const plan: GameWorldStateWritePlan = {
        owner: 'gameWorldState',
        sliceOrder: GAME_WORLD_STATE_WRITE_SLICE_ORDER,
        runResolution: cloneRunResolutionMetadata(runResolution),
        slices: [
            storyHubSession,
            persistentStash,
            activeRun,
        ],
    };

    assertGameWorldStateWritePlan(plan);

    return plan;
}

function cloneStoryHubSessionSlicePlan(
    slice: GameWorldStateWriteStoryHubSessionSlicePlan,
): GameWorldStateWriteStoryHubSessionSlicePlan {
    return createStoryHubSessionSlicePlan(slice.compatibility, slice.plan);
}

function clonePersistentStashSlicePlan(
    slice: GameWorldStateWritePersistentStashSlicePlan,
): GameWorldStateWritePersistentStashSlicePlan {
    return slice.operation === 'save'
        ? createPersistentStashSaveSlicePlan(slice.compatibility, slice.plan)
        : createPersistentStashClearSlicePlan(slice.compatibility);
}

function cloneActiveRunSlicePlan(
    slice: GameWorldStateWriteActiveRunSlicePlan,
): GameWorldStateWriteActiveRunSlicePlan {
    return createActiveRunSlicePlan(slice.compatibility, slice.keys, slice.plan);
}

function cloneGameWorldStateWritePlan(plan: GameWorldStateWritePlan): GameWorldStateWritePlan {
    assertGameWorldStateWritePlan(plan);

    return createGameWorldStateWritePlanFromSlicePlans(
        cloneStoryHubSessionSlicePlan(plan.slices[0]),
        clonePersistentStashSlicePlan(plan.slices[1]),
        cloneActiveRunSlicePlan(plan.slices[2]),
        plan.runResolution,
    );
}

function applyPersistentStashClearPlan(
    plan: GameWorldStatePersistentStashClearPlan,
    storage: GameWorldStateWriteStorageAdapter,
): GameWorldStatePersistentStashClearResult {
    assertPersistentStashClearPlan(plan);
    storage.removeItem(STASH_STORAGE_KEY);

    return clonePersistentStashClearPlan(plan);
}

function createStoryHubSessionSliceResult(
    slice: GameWorldStateWriteStoryHubSessionSlicePlan,
    result: GameWorldStateStoryHubSessionWriteResult,
): GameWorldStateWriteStoryHubSessionSliceResult {
    return {
        owner: 'storyHubSession',
        operation: 'save',
        compatibility: cloneFixedCompatibilityEntry(slice.compatibility),
        result: cloneStoryHubSessionWritePlan(result),
    };
}

function createPersistentStashSliceResult(
    slice: GameWorldStateWritePersistentStashSlicePlan,
    result: GameWorldStatePersistentStashWriteResult | GameWorldStatePersistentStashClearResult,
): GameWorldStateWritePersistentStashSliceResult {
    if (slice.operation === 'save') {
        return {
            owner: 'persistentStash',
            operation: 'save',
            compatibility: cloneFixedCompatibilityEntry(slice.compatibility),
            result: clonePersistentStashWritePlan(result as GameWorldStatePersistentStashWriteResult),
        };
    }

    return {
        owner: 'persistentStash',
        operation: 'clear',
        compatibility: cloneFixedCompatibilityEntry(slice.compatibility),
        result: clonePersistentStashClearPlan(result as GameWorldStatePersistentStashClearResult),
    };
}

function createActiveRunSliceResult(
    slice: GameWorldStateWriteActiveRunSlicePlan,
    result: GameWorldStateActiveRunWriteResult,
): GameWorldStateWriteActiveRunSliceResult {
    const clonedResult = cloneActiveRunWritePlan(result);

    return {
        owner: 'activeRun',
        operation: clonedResult.operation,
        compatibility: cloneActiveRunCompatibilityEntry(slice.compatibility),
        keys: cloneActiveRunKeys(slice.keys),
        result: clonedResult,
    };
}

export function planGameWorldStateWriteFromView(worldState: GameWorldState): GameWorldStateWritePlan {
    const storyHubSession = createStoryHubSessionSlicePlan(
        worldState.storyHubSession.compatibility,
        planGameWorldStateStoryHubSessionWriteFromView(worldState),
    );
    const persistentStash = createPersistentStashSaveSlicePlan(
        worldState.persistentStash.compatibility,
        planGameWorldStatePersistentStashWriteFromView(worldState),
    );
    const activeRunPlan = planGameWorldStateActiveRunWriteFromView(worldState);
    const activeRun = createActiveRunSlicePlan(
        worldState.activeRun.compatibility,
        worldState.activeRun.keys,
        activeRunPlan,
    );

    return createGameWorldStateWritePlanFromSlicePlans(
        storyHubSession,
        persistentStash,
        activeRun,
        worldState.runResolution,
    );
}

export function planGameWorldStateWrite(options: GameWorldStateWriteOptions): GameWorldStateWritePlan {
    assertExplicitStorageAdapter(options.storage);

    return planGameWorldStateWriteFromView(createGameWorldState(options));
}

export function planGameWorldStateWriteFromDocuments(
    options: GameWorldStateWriteFromDocumentsOptions,
): GameWorldStateWritePlan {
    const storyHubSession = createStoryHubSessionSlicePlan(
        SAVE_COMPATIBILITY_REGISTRY.storyHubSession,
        planGameWorldStateStoryHubSessionWriteFromDocument({
            document: options.storyHubSession,
        }),
    );
    const persistentStash = options.persistentStash
        ? createPersistentStashSaveSlicePlan(
            SAVE_COMPATIBILITY_REGISTRY.persistentStash,
            planGameWorldStatePersistentStashWriteFromDocument({
                source: options.persistentStashSource ?? 'stored-stash',
                document: options.persistentStash,
            }),
        )
        : createPersistentStashClearSlicePlan(SAVE_COMPATIBILITY_REGISTRY.persistentStash);
    const activeRunPlan = planGameWorldStateActiveRunWriteFromDocument({
        document: options.activeRun,
        activeRunLookup: options.activeRunLookup,
        activeRunIdentity: options.activeRunIdentity,
    });
    const activeRun = createActiveRunSlicePlan(
        SAVE_COMPATIBILITY_REGISTRY.activeRun,
        createActiveRunKeysFromPlan(activeRunPlan),
        activeRunPlan,
    );

    return createGameWorldStateWritePlanFromSlicePlans(
        storyHubSession,
        persistentStash,
        activeRun,
        createCurrentRunResolutionMetadata(),
    );
}

export function applyGameWorldStateWritePlan(
    plan: GameWorldStateWritePlan,
    storage: GameWorldStateWriteStorageAdapter,
): GameWorldStateWriteResult {
    assertExplicitStorageAdapter(storage);
    const clonedPlan = cloneGameWorldStateWritePlan(plan);
    const [storyHubSession, persistentStash, activeRun] = clonedPlan.slices;
    const storyHubSessionResult = applyGameWorldStateStoryHubSessionPlan(storyHubSession.plan, storage);
    const persistentStashResult = persistentStash.operation === 'save'
        ? writeGameWorldStatePersistentStashPlan(persistentStash.plan, storage)
        : applyPersistentStashClearPlan(persistentStash.plan, storage);
    const activeRunResult = applyGameWorldStateActiveRunPlan(activeRun.plan, storage);

    return {
        owner: 'gameWorldState',
        status: 'success',
        sliceOrder: GAME_WORLD_STATE_WRITE_SLICE_ORDER,
        runResolution: cloneRunResolutionMetadata(clonedPlan.runResolution),
        slices: [
            createStoryHubSessionSliceResult(storyHubSession, storyHubSessionResult),
            createPersistentStashSliceResult(persistentStash, persistentStashResult),
            createActiveRunSliceResult(activeRun, activeRunResult),
        ],
    };
}

export const writeGameWorldStatePlan = applyGameWorldStateWritePlan;

export function writeGameWorldState(options: GameWorldStateWriteOptions): GameWorldStateWriteResult {
    return applyGameWorldStateWritePlan(planGameWorldStateWrite(options), options.storage);
}

export function writeGameWorldStateFromDocuments(
    options: GameWorldStateWriteFromDocumentsOptions & { readonly storage: GameWorldStateWriteStorageAdapter },
): GameWorldStateWriteResult {
    assertExplicitStorageAdapter(options.storage);

    return applyGameWorldStateWritePlan(planGameWorldStateWriteFromDocuments(options), options.storage);
}
