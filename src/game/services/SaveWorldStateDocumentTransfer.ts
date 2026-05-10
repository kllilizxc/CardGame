import type {
    ActiveRunStorageLookup,
    ActiveRunTargetIdentity,
} from './RunPersistence';
import {
    createSaveWorldStateDocument,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';
import {
    executeSaveWorldStateDocumentRestorePlan,
    type SaveWorldStateDocumentRestoreExecutionResult,
    type SaveWorldStateDocumentRestoreStorageAdapter,
} from './SaveWorldStateDocumentRestoreExecutor';
import {
    createSaveWorldStateDocumentRestorePlan,
    type SaveWorldStateDocumentRestorePlan,
} from './SaveWorldStateDocumentRestorePlan';
import {
    createSaveWorldStateSnapshot,
    type SaveWorldStateSnapshotStorageAdapter,
} from './SaveWorldStateSnapshot';

export type SaveWorldStateDocumentTransferSourceStorageAdapter = SaveWorldStateSnapshotStorageAdapter;
export type SaveWorldStateDocumentTransferTargetStorageAdapter = SaveWorldStateDocumentRestoreStorageAdapter;

export interface SaveWorldStateDocumentExportFromStorageOptions {
    readonly sourceStorage: SaveWorldStateDocumentTransferSourceStorageAdapter;
    readonly activeRunLookup?: ActiveRunStorageLookup;
    readonly activeRunIdentity?: ActiveRunTargetIdentity;
}

export interface SaveWorldStateDocumentRestoreToStorageOptions {
    readonly targetStorage: SaveWorldStateDocumentTransferTargetStorageAdapter;
}

export interface SaveWorldStateDocumentTransferOptions extends
    SaveWorldStateDocumentExportFromStorageOptions,
    SaveWorldStateDocumentRestoreToStorageOptions {}

export interface SaveWorldStateDocumentRestoreToStorageResult {
    readonly restorePlan: SaveWorldStateDocumentRestorePlan;
    readonly restoreResult: SaveWorldStateDocumentRestoreExecutionResult;
}

export interface SaveWorldStateDocumentTransferResult extends SaveWorldStateDocumentRestoreToStorageResult {
    readonly document: SaveWorldStateDocument;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSourceStorageAdapter(storage: unknown): asserts storage is SaveWorldStateDocumentTransferSourceStorageAdapter {
    if (!isRecord(storage)
        || typeof storage.getItem !== 'function'
        || typeof storage.setItem !== 'function'
        || typeof storage.removeItem !== 'function') {
        throw new Error('Invalid SaveWorldStateDocumentTransfer sourceStorage: getItem, setItem, and removeItem are required.');
    }
}

function validateTargetStorageAdapter(storage: unknown): asserts storage is SaveWorldStateDocumentTransferTargetStorageAdapter {
    if (!isRecord(storage)
        || typeof storage.setItem !== 'function'
        || typeof storage.removeItem !== 'function') {
        throw new Error('Invalid SaveWorldStateDocumentTransfer targetStorage: setItem and removeItem are required.');
    }
}

function validateExportOptions(options: unknown): asserts options is SaveWorldStateDocumentExportFromStorageOptions {
    if (!isRecord(options)) {
        throw new Error('Invalid SaveWorldStateDocumentTransfer export options: sourceStorage is required.');
    }

    validateSourceStorageAdapter(options.sourceStorage);
}

function validateRestoreOptions(options: unknown): asserts options is SaveWorldStateDocumentRestoreToStorageOptions {
    if (!isRecord(options)) {
        throw new Error('Invalid SaveWorldStateDocumentTransfer restore options: targetStorage is required.');
    }

    validateTargetStorageAdapter(options.targetStorage);
}

export function exportSaveWorldStateDocumentFromStorage(
    options: SaveWorldStateDocumentExportFromStorageOptions,
): SaveWorldStateDocument {
    validateExportOptions(options);

    return createSaveWorldStateDocument(createSaveWorldStateSnapshot({
        storage: options.sourceStorage,
        activeRunLookup: options.activeRunLookup,
        activeRunIdentity: options.activeRunIdentity,
    }));
}

export function restoreSaveWorldStateDocumentToStorage(
    document: SaveWorldStateDocument,
    options: SaveWorldStateDocumentRestoreToStorageOptions,
): SaveWorldStateDocumentRestoreToStorageResult {
    const restorePlan = createSaveWorldStateDocumentRestorePlan(document);

    validateRestoreOptions(options);

    return {
        restorePlan,
        restoreResult: executeSaveWorldStateDocumentRestorePlan(restorePlan, options.targetStorage),
    };
}

export function transferSaveWorldStateDocument(
    options: SaveWorldStateDocumentTransferOptions,
): SaveWorldStateDocumentTransferResult {
    validateExportOptions(options);
    validateRestoreOptions(options);

    const document = exportSaveWorldStateDocumentFromStorage(options);
    const { restorePlan, restoreResult } = restoreSaveWorldStateDocumentToStorage(document, options);

    return {
        document,
        restorePlan,
        restoreResult,
    };
}
