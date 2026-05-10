import {
    applySaveCompatibilityMigrations,
    createActiveRunCompatibilityKeys,
    SAVE_COMPATIBILITY_REGISTRY,
    type ActiveRunCompatibilityKeys,
    type ActiveRunSaveCompatibilityEntry,
    type FixedKeySaveCompatibilityEntry,
    type SaveCompatibilityRegistry,
} from './SaveCompatibility';
import {
    loadActiveRun,
    loadPersistentStash,
    type ActiveRunStorageLookup,
    type ActiveRunTargetIdentity,
} from './RunPersistence';
import {
    RUN_RESOLUTION_BOUNDARY_MODULE,
    RUN_RESOLUTION_TERMINAL_OUTCOMES,
} from './RunResolution';
import {
    loadStoryHubSessionDocumentSnapshot,
    type StoryHubSessionDocument,
} from './StoryHubSessionPersistence';
import type { PersistentStash, RunSnapshot, TerminalRunOutcome } from '../types/expedition';

export interface SaveWorldStateSnapshotOptions {
    readonly activeRunLookup?: ActiveRunStorageLookup;
    readonly activeRunIdentity?: ActiveRunTargetIdentity;
}

export interface SaveWorldStateFixedSlice<TDocument> {
    readonly compatibility: FixedKeySaveCompatibilityEntry;
    readonly document: TDocument;
}

export interface SaveWorldStateNullableFixedSlice<TDocument> {
    readonly compatibility: FixedKeySaveCompatibilityEntry;
    readonly document: TDocument | null;
}

export interface SaveWorldStateActiveRunSlice {
    readonly compatibility: ActiveRunSaveCompatibilityEntry;
    readonly keys: ActiveRunCompatibilityKeys;
    readonly document: RunSnapshot | null;
}

export interface SaveWorldStateRunResolutionView {
    readonly boundaryModule: typeof RUN_RESOLUTION_BOUNDARY_MODULE;
    readonly terminalOutcomes: readonly TerminalRunOutcome[];
}

export interface SaveWorldStateSnapshot {
    readonly registry: SaveCompatibilityRegistry;
    readonly storyHubSession: SaveWorldStateFixedSlice<StoryHubSessionDocument>;
    readonly persistentStash: SaveWorldStateNullableFixedSlice<PersistentStash>;
    readonly activeRun: SaveWorldStateActiveRunSlice;
    readonly runResolution: SaveWorldStateRunResolutionView;
}

function applyNullableSaveCompatibilityMigrations<TOwner extends 'persistentStash' | 'activeRun', TDocument>(
    owner: TOwner,
    document: TDocument | null,
): TDocument | null {
    return document ? applySaveCompatibilityMigrations(owner, document) : null;
}

export function createSaveWorldStateSnapshot(options: SaveWorldStateSnapshotOptions = {}): SaveWorldStateSnapshot {
    return {
        registry: SAVE_COMPATIBILITY_REGISTRY,
        storyHubSession: {
            compatibility: SAVE_COMPATIBILITY_REGISTRY.storyHubSession,
            document: applySaveCompatibilityMigrations(
                'storyHubSession',
                loadStoryHubSessionDocumentSnapshot(),
            ),
        },
        persistentStash: {
            compatibility: SAVE_COMPATIBILITY_REGISTRY.persistentStash,
            document: applyNullableSaveCompatibilityMigrations(
                'persistentStash',
                loadPersistentStash(),
            ),
        },
        activeRun: {
            compatibility: SAVE_COMPATIBILITY_REGISTRY.activeRun,
            keys: createActiveRunCompatibilityKeys(options.activeRunLookup, options.activeRunIdentity),
            document: applyNullableSaveCompatibilityMigrations(
                'activeRun',
                loadActiveRun(options.activeRunLookup, options.activeRunIdentity),
            ),
        },
        runResolution: {
            boundaryModule: RUN_RESOLUTION_BOUNDARY_MODULE,
            terminalOutcomes: RUN_RESOLUTION_TERMINAL_OUTCOMES,
        },
    };
}
