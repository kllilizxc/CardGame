import {
    createActiveRunCompatibilityKeys,
    SAVE_COMPATIBILITY_REGISTRY,
} from './SaveCompatibility';
import { parseActiveRunRouteKey } from './RunPersistence';
import {
    SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
    SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
} from './SaveWorldStateDocument';
import type {
    SaveWorldStateDocumentRestoreNoOpOperation,
    SaveWorldStateDocumentRestoreOperation,
    SaveWorldStateDocumentRestorePlan,
    SaveWorldStateDocumentRestoreRemoveItemOperation,
    SaveWorldStateDocumentRestoreSetItemOperation,
} from './SaveWorldStateDocumentRestorePlan';

export type SaveWorldStateDocumentRestoreStorageAdapter = Pick<Storage, 'setItem' | 'removeItem'>;

export interface SaveWorldStateDocumentRestoreExecutionResult {
    readonly status: 'success';
    readonly appliedOperations: readonly SaveWorldStateDocumentRestoreOperation[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function failPlan(reason: string): never {
    throw new Error(`Invalid SaveWorldStateDocumentRestorePlan: ${reason}`);
}

function validateStorageAdapter(storage: SaveWorldStateDocumentRestoreStorageAdapter): void {
    if (!isRecord(storage)
        || typeof storage.setItem !== 'function'
        || typeof storage.removeItem !== 'function') {
        throw new Error('Invalid SaveWorldStateDocumentRestoreStorageAdapter: setItem and removeItem are required.');
    }
}

function assertNoRouteKey(owner: string, routeKey: unknown): void {
    if (routeKey !== undefined) {
        failPlan(`${owner} operations must not include a routeKey.`);
    }
}

function validateRouteKey(routeKey: unknown) {
    if (!isNonEmptyString(routeKey)) {
        failPlan('activeRun operations must include a routeKey.');
    }

    const identity = parseActiveRunRouteKey(routeKey);

    if (!identity) {
        failPlan('activeRun routeKey is malformed.');
    }

    const compatibilityKeys = createActiveRunCompatibilityKeys(undefined, identity);

    if (routeKey !== compatibilityKeys.routeKey) {
        failPlan('activeRun routeKey must use the canonical route-key format.');
    }

    return compatibilityKeys;
}

function validateSetItemOperation(
    operation: JsonRecord,
): SaveWorldStateDocumentRestoreSetItemOperation {
    if (!isNonEmptyString(operation.storageKey) || typeof operation.value !== 'string') {
        failPlan('setItem operations require a storageKey and string value.');
    }

    switch (operation.owner) {
        case 'storyHubSession':
            assertNoRouteKey(operation.owner, operation.routeKey);

            if (operation.storageKey !== SAVE_COMPATIBILITY_REGISTRY.storyHubSession.storageKey) {
                failPlan('storyHubSession setItem must target the current Story/Hub session storage key.');
            }

            return {
                operation: 'setItem',
                owner: operation.owner,
                storageKey: operation.storageKey,
                value: operation.value,
            };

        case 'persistentStash':
            assertNoRouteKey(operation.owner, operation.routeKey);

            if (operation.storageKey !== SAVE_COMPATIBILITY_REGISTRY.persistentStash.storageKey) {
                failPlan('persistentStash setItem must target the current persistent stash storage key.');
            }

            return {
                operation: 'setItem',
                owner: operation.owner,
                storageKey: operation.storageKey,
                value: operation.value,
            };

        case 'activeRun': {
            const compatibilityKeys = validateRouteKey(operation.routeKey);

            if (operation.storageKey !== compatibilityKeys.canonicalStorageKey) {
                failPlan('activeRun setItem must target the route-keyed active-run storage key.');
            }

            return {
                operation: 'setItem',
                owner: operation.owner,
                routeKey: compatibilityKeys.routeKey,
                storageKey: operation.storageKey,
                value: operation.value,
            };
        }

        default:
            failPlan('setItem owner is not a supported save owner.');
    }
}

function validateRemoveItemOperation(
    operation: JsonRecord,
): SaveWorldStateDocumentRestoreRemoveItemOperation {
    if (!isNonEmptyString(operation.storageKey) || operation.reason !== 'document-null') {
        failPlan('removeItem operations require a storageKey and document-null reason.');
    }

    switch (operation.owner) {
        case 'persistentStash':
            assertNoRouteKey(operation.owner, operation.routeKey);

            if (operation.storageKey !== SAVE_COMPATIBILITY_REGISTRY.persistentStash.storageKey) {
                failPlan('persistentStash removeItem must target the current persistent stash storage key.');
            }

            return {
                operation: 'removeItem',
                owner: operation.owner,
                storageKey: operation.storageKey,
                reason: operation.reason,
            };

        case 'activeRun': {
            const compatibilityKeys = validateRouteKey(operation.routeKey);

            if (operation.storageKey !== compatibilityKeys.canonicalStorageKey) {
                failPlan('activeRun removeItem must target the route-keyed active-run storage key.');
            }

            return {
                operation: 'removeItem',
                owner: operation.owner,
                routeKey: compatibilityKeys.routeKey,
                storageKey: operation.storageKey,
                reason: operation.reason,
            };
        }

        case 'storyHubSession':
            failPlan('storyHubSession restore plans must set the current document, not remove it.');

        default:
            failPlan('removeItem owner is not a supported save owner.');
    }
}

function validateNoOpOperation(
    operation: JsonRecord,
): SaveWorldStateDocumentRestoreNoOpOperation {
    if (operation.owner !== 'activeRun'
        || !isNonEmptyString(operation.storageKey)
        || operation.storageKey !== SAVE_COMPATIBILITY_REGISTRY.activeRun.legacyUnscopedStorageKey
        || operation.reason !== 'legacy-active-run-write-disabled') {
        failPlan('no-op operations are only allowed for the legacy active-run key.');
    }

    const compatibilityKeys = validateRouteKey(operation.routeKey);

    return {
        operation: 'no-op',
        owner: 'activeRun',
        routeKey: compatibilityKeys.routeKey,
        storageKey: operation.storageKey,
        reason: operation.reason,
    };
}

function validateOperation(operation: unknown): SaveWorldStateDocumentRestoreOperation {
    if (!isRecord(operation)) {
        failPlan('operations must be objects.');
    }

    switch (operation.operation) {
        case 'setItem':
            return validateSetItemOperation(operation);
        case 'removeItem':
            return validateRemoveItemOperation(operation);
        case 'no-op':
            return validateNoOpOperation(operation);
        default:
            failPlan('operation must be setItem, removeItem, or no-op.');
    }
}

export function validateSaveWorldStateDocumentRestorePlan(
    plan: unknown,
): SaveWorldStateDocumentRestorePlan {
    if (!isRecord(plan) || !isRecord(plan.document) || !Array.isArray(plan.operations)) {
        failPlan('plan must contain document metadata and operations.');
    }

    if (plan.document.schemaVersion !== SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION
        || plan.document.contentType !== SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE) {
        failPlan('document metadata must match the current SaveWorldStateDocument schema.');
    }

    return {
        document: {
            schemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
            contentType: SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
        },
        operations: plan.operations.map(validateOperation),
    };
}

export class SaveWorldStateDocumentRestoreExecutionError extends Error {
    readonly planOperationIndex: number;
    readonly failedOperation: SaveWorldStateDocumentRestoreOperation;
    readonly appliedOperations: readonly SaveWorldStateDocumentRestoreOperation[];
    override readonly cause: unknown;

    constructor(
        planOperationIndex: number,
        failedOperation: SaveWorldStateDocumentRestoreOperation,
        appliedOperations: readonly SaveWorldStateDocumentRestoreOperation[],
        cause: unknown,
    ) {
        super(
            `Failed to apply SaveWorldStateDocumentRestorePlan operation ${planOperationIndex} `
            + `(${failedOperation.operation} ${failedOperation.storageKey}).`,
        );
        this.name = 'SaveWorldStateDocumentRestoreExecutionError';
        this.planOperationIndex = planOperationIndex;
        this.failedOperation = failedOperation;
        this.appliedOperations = [...appliedOperations];
        this.cause = cause;
    }
}

export function executeSaveWorldStateDocumentRestorePlan(
    plan: SaveWorldStateDocumentRestorePlan,
    storage: SaveWorldStateDocumentRestoreStorageAdapter,
): SaveWorldStateDocumentRestoreExecutionResult {
    const validatedPlan = validateSaveWorldStateDocumentRestorePlan(plan);
    validateStorageAdapter(storage);

    const appliedOperations: SaveWorldStateDocumentRestoreOperation[] = [];

    for (let index = 0; index < validatedPlan.operations.length; index += 1) {
        const operation = validatedPlan.operations[index];

        try {
            if (operation.operation === 'setItem') {
                storage.setItem(operation.storageKey, operation.value);
            } else if (operation.operation === 'removeItem') {
                storage.removeItem(operation.storageKey);
            }

            appliedOperations.push(operation);
        } catch (error) {
            throw new SaveWorldStateDocumentRestoreExecutionError(
                index,
                operation,
                appliedOperations,
                error,
            );
        }
    }

    return {
        status: 'success',
        appliedOperations,
    };
}
