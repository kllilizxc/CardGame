import type { SaveWorldStateDocument } from './SaveWorldStateDocument';
import {
    parseSaveWorldStateDocumentJsonText,
    serializeSaveWorldStateDocumentJsonText,
} from './SaveWorldStateDocumentCodec';
import type { SaveWorldStateDocumentMigrationResult } from './SaveWorldStateDocumentMigration';
import {
    exportSaveWorldStateDocumentFromStorage,
    type SaveWorldStateDocumentExportFromStorageOptions,
} from './SaveWorldStateDocumentTransfer';
import {
    restoreAndVerifySaveWorldStateDocumentToStorage,
    type SaveWorldStateDocumentRestoreAndVerifyToStorageResult,
    type SaveWorldStateDocumentTransferVerificationOptions,
} from './SaveWorldStateDocumentTransferVerification';

export type SaveWorldStateDocumentJsonTextExportFromStorageOptions = SaveWorldStateDocumentExportFromStorageOptions;
export type SaveWorldStateDocumentJsonTextRestoreToStorageOptions = SaveWorldStateDocumentTransferVerificationOptions;

export interface SaveWorldStateDocumentJsonTextExportFromStorageResult {
    readonly document: SaveWorldStateDocument;
    readonly jsonText: string;
}

export interface SaveWorldStateDocumentJsonTextRestoreToStorageResult
    extends SaveWorldStateDocumentRestoreAndVerifyToStorageResult {
    readonly migration: SaveWorldStateDocumentMigrationResult;
}

export function exportSaveWorldStateDocumentJsonTextFromStorage(
    options: SaveWorldStateDocumentJsonTextExportFromStorageOptions,
): SaveWorldStateDocumentJsonTextExportFromStorageResult {
    const document = exportSaveWorldStateDocumentFromStorage(options);

    return {
        document,
        jsonText: serializeSaveWorldStateDocumentJsonText(document),
    };
}

export function restoreSaveWorldStateDocumentJsonTextToStorage(
    jsonText: string,
    options: SaveWorldStateDocumentJsonTextRestoreToStorageOptions,
): SaveWorldStateDocumentJsonTextRestoreToStorageResult {
    const migration = parseSaveWorldStateDocumentJsonText(jsonText);
    const restoreAndVerifyResult = restoreAndVerifySaveWorldStateDocumentToStorage(
        migration.document,
        options,
    );

    return {
        migration,
        ...restoreAndVerifyResult,
    };
}
