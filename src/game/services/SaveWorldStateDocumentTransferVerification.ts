import {
    cloneSaveWorldStateDocument,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';
import {
    exportSaveWorldStateDocumentFromStorage,
    restoreSaveWorldStateDocumentToStorage,
    type SaveWorldStateDocumentRestoreToStorageResult,
    type SaveWorldStateDocumentTransferSourceStorageAdapter,
    type SaveWorldStateDocumentTransferTargetStorageAdapter,
} from './SaveWorldStateDocumentTransfer';

export type SaveWorldStateDocumentTransferVerificationStorageAdapter =
    SaveWorldStateDocumentTransferSourceStorageAdapter
    & SaveWorldStateDocumentTransferTargetStorageAdapter;

export type SaveWorldStateDocumentTransferVerificationStatus = 'verified' | 'mismatch';

export type SaveWorldStateDocumentTransferVerificationDifferenceKind =
    | 'changed'
    | 'missing'
    | 'unexpected';

export interface SaveWorldStateDocumentTransferVerificationDifference {
    readonly kind: SaveWorldStateDocumentTransferVerificationDifferenceKind;
    readonly path: string;
    readonly expected: unknown;
    readonly actual: unknown;
}

export interface SaveWorldStateDocumentTransferVerificationOptions {
    readonly targetStorage: SaveWorldStateDocumentTransferVerificationStorageAdapter;
}

export interface SaveWorldStateDocumentTransferVerificationResult {
    readonly status: SaveWorldStateDocumentTransferVerificationStatus;
    readonly verified: boolean;
    readonly expectedDocument: SaveWorldStateDocument;
    readonly actualDocument: SaveWorldStateDocument;
    readonly differences: readonly SaveWorldStateDocumentTransferVerificationDifference[];
}

export interface SaveWorldStateDocumentRestoreAndVerifyToStorageResult
    extends SaveWorldStateDocumentRestoreToStorageResult {
    readonly verification: SaveWorldStateDocumentTransferVerificationResult;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateVerificationOptions(
    options: unknown,
): asserts options is SaveWorldStateDocumentTransferVerificationOptions {
    if (!isRecord(options)
        || !isRecord(options.targetStorage)
        || typeof options.targetStorage.getItem !== 'function'
        || typeof options.targetStorage.setItem !== 'function'
        || typeof options.targetStorage.removeItem !== 'function') {
        throw new Error(
            'Invalid SaveWorldStateDocumentTransferVerification options: '
            + 'targetStorage with getItem, setItem, and removeItem is required.',
        );
    }
}

function createChangedDifference(
    path: string,
    expected: unknown,
    actual: unknown,
): SaveWorldStateDocumentTransferVerificationDifference {
    return {
        kind: 'changed',
        path,
        expected,
        actual,
    };
}

function createMissingDifference(
    path: string,
    expected: unknown,
): SaveWorldStateDocumentTransferVerificationDifference {
    return {
        kind: 'missing',
        path,
        expected,
        actual: undefined,
    };
}

function createUnexpectedDifference(
    path: string,
    actual: unknown,
): SaveWorldStateDocumentTransferVerificationDifference {
    return {
        kind: 'unexpected',
        path,
        expected: undefined,
        actual,
    };
}

function formatPathSegment(path: string, segment: string): string {
    if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
        return `${path}.${segment}`;
    }

    return `${path}[${JSON.stringify(segment)}]`;
}

function diffJsonValues(
    expected: unknown,
    actual: unknown,
    path: string,
): SaveWorldStateDocumentTransferVerificationDifference[] {
    if (Object.is(expected, actual)) {
        return [];
    }

    if (Array.isArray(expected) && Array.isArray(actual)) {
        const differences: SaveWorldStateDocumentTransferVerificationDifference[] = [];
        const maxLength = Math.max(expected.length, actual.length);

        for (let index = 0; index < maxLength; index += 1) {
            const itemPath = `${path}[${index}]`;

            if (index >= expected.length) {
                differences.push(createUnexpectedDifference(itemPath, actual[index]));
            } else if (index >= actual.length) {
                differences.push(createMissingDifference(itemPath, expected[index]));
            } else {
                differences.push(...diffJsonValues(expected[index], actual[index], itemPath));
            }
        }

        return differences;
    }

    if (isRecord(expected) && isRecord(actual)) {
        const differences: SaveWorldStateDocumentTransferVerificationDifference[] = [];
        const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();

        for (const key of keys) {
            const itemPath = formatPathSegment(path, key);
            const hasExpected = Object.prototype.hasOwnProperty.call(expected, key);
            const hasActual = Object.prototype.hasOwnProperty.call(actual, key);

            if (!hasExpected) {
                differences.push(createUnexpectedDifference(itemPath, actual[key]));
            } else if (!hasActual) {
                differences.push(createMissingDifference(itemPath, expected[key]));
            } else {
                differences.push(...diffJsonValues(expected[key], actual[key], itemPath));
            }
        }

        return differences;
    }

    return [createChangedDifference(path, expected, actual)];
}

export function verifySaveWorldStateDocumentTransferReadback(
    expectedDocument: SaveWorldStateDocument,
    options: SaveWorldStateDocumentTransferVerificationOptions,
): SaveWorldStateDocumentTransferVerificationResult {
    const validatedExpectedDocument = cloneSaveWorldStateDocument(expectedDocument);
    validateVerificationOptions(options);

    const actualDocument = exportSaveWorldStateDocumentFromStorage({
        sourceStorage: options.targetStorage,
        activeRunIdentity: validatedExpectedDocument.worldState.activeRun.keys.normalizedIdentity,
    });
    const differences = diffJsonValues(validatedExpectedDocument, actualDocument, '$');
    const verified = differences.length === 0;

    return {
        status: verified ? 'verified' : 'mismatch',
        verified,
        expectedDocument: validatedExpectedDocument,
        actualDocument,
        differences,
    };
}

export function restoreAndVerifySaveWorldStateDocumentToStorage(
    document: SaveWorldStateDocument,
    options: SaveWorldStateDocumentTransferVerificationOptions,
): SaveWorldStateDocumentRestoreAndVerifyToStorageResult {
    const validatedDocument = cloneSaveWorldStateDocument(document);
    validateVerificationOptions(options);
    const { restorePlan, restoreResult } = restoreSaveWorldStateDocumentToStorage(
        validatedDocument,
        { targetStorage: options.targetStorage },
    );

    return {
        restorePlan,
        restoreResult,
        verification: verifySaveWorldStateDocumentTransferReadback(validatedDocument, options),
    };
}
