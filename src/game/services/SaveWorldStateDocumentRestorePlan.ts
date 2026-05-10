import {
    createActiveRunCompatibilityKeys,
    type SaveCompatibilityOwner,
} from './SaveCompatibility';
import {
    cloneSaveWorldStateDocument,
    SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
    SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';

export type SaveWorldStateDocumentRestoreOperation =
    | SaveWorldStateDocumentRestoreSetItemOperation
    | SaveWorldStateDocumentRestoreRemoveItemOperation
    | SaveWorldStateDocumentRestoreNoOpOperation;

export interface SaveWorldStateDocumentRestoreSetItemOperation {
    readonly operation: 'setItem';
    readonly owner: SaveCompatibilityOwner;
    readonly storageKey: string;
    readonly routeKey?: string;
    readonly value: string;
}

export interface SaveWorldStateDocumentRestoreRemoveItemOperation {
    readonly operation: 'removeItem';
    readonly owner: SaveCompatibilityOwner;
    readonly storageKey: string;
    readonly routeKey?: string;
    readonly reason: 'document-null';
}

export interface SaveWorldStateDocumentRestoreNoOpOperation {
    readonly operation: 'no-op';
    readonly owner: SaveCompatibilityOwner;
    readonly storageKey: string;
    readonly routeKey?: string;
    readonly reason: 'legacy-active-run-write-disabled';
}

export interface SaveWorldStateDocumentRestorePlan {
    readonly document: {
        readonly schemaVersion: typeof SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION;
        readonly contentType: typeof SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE;
    };
    readonly operations: readonly SaveWorldStateDocumentRestoreOperation[];
}

function createSetItemOperation(
    owner: SaveCompatibilityOwner,
    storageKey: string,
    value: unknown,
): SaveWorldStateDocumentRestoreSetItemOperation {
    return {
        operation: 'setItem',
        owner,
        storageKey,
        value: JSON.stringify(value),
    };
}

function createNullableFixedKeyOperation(
    owner: SaveCompatibilityOwner,
    storageKey: string,
    value: unknown | null,
): SaveWorldStateDocumentRestoreSetItemOperation | SaveWorldStateDocumentRestoreRemoveItemOperation {
    if (value === null) {
        return {
            operation: 'removeItem',
            owner,
            storageKey,
            reason: 'document-null',
        };
    }

    return createSetItemOperation(owner, storageKey, value);
}

function createActiveRunOperation(
    document: SaveWorldStateDocument,
): SaveWorldStateDocumentRestoreSetItemOperation | SaveWorldStateDocumentRestoreRemoveItemOperation {
    const compatibilityKeys = createActiveRunCompatibilityKeys(
        undefined,
        document.worldState.activeRun.keys.normalizedIdentity,
    );
    const activeRunDocument = document.worldState.activeRun.document;

    if (activeRunDocument === null) {
        return {
            operation: 'removeItem',
            owner: 'activeRun',
            routeKey: compatibilityKeys.routeKey,
            storageKey: compatibilityKeys.canonicalStorageKey,
            reason: 'document-null',
        };
    }

    return {
        operation: 'setItem',
        owner: 'activeRun',
        routeKey: compatibilityKeys.routeKey,
        storageKey: compatibilityKeys.canonicalStorageKey,
        value: JSON.stringify(activeRunDocument),
    };
}

function createLegacyActiveRunNoOpOperation(
    document: SaveWorldStateDocument,
): SaveWorldStateDocumentRestoreNoOpOperation {
    const compatibilityKeys = createActiveRunCompatibilityKeys(
        undefined,
        document.worldState.activeRun.keys.normalizedIdentity,
    );

    return {
        operation: 'no-op',
        owner: 'activeRun',
        routeKey: compatibilityKeys.routeKey,
        storageKey: document.worldState.activeRun.compatibility.legacyUnscopedStorageKey,
        reason: 'legacy-active-run-write-disabled',
    };
}

export function createSaveWorldStateDocumentRestorePlan(
    document: SaveWorldStateDocument,
): SaveWorldStateDocumentRestorePlan {
    const validatedDocument = cloneSaveWorldStateDocument(document);

    return {
        document: {
            schemaVersion: validatedDocument.schemaVersion,
            contentType: validatedDocument.contentType,
        },
        operations: [
            createSetItemOperation(
                'storyHubSession',
                validatedDocument.worldState.storyHubSession.compatibility.storageKey,
                validatedDocument.worldState.storyHubSession.document,
            ),
            createNullableFixedKeyOperation(
                'persistentStash',
                validatedDocument.worldState.persistentStash.compatibility.storageKey,
                validatedDocument.worldState.persistentStash.document,
            ),
            createActiveRunOperation(validatedDocument),
            createLegacyActiveRunNoOpOperation(validatedDocument),
        ],
    };
}
