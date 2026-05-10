import {
    cloneSaveWorldStateDocument,
    SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
    SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
    SAVE_WORLD_STATE_DOCUMENT_SOURCE,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';
import type { SaveCompatibilityOwner } from './SaveCompatibility';

export const SAVE_WORLD_STATE_DOCUMENT_MIGRATION_PIPELINE_ID = 'SaveWorldStateDocumentMigration.v1';

export interface SaveWorldStateDocumentAppliedMigration {
    readonly id: string;
    readonly description: string;
}

export interface SaveWorldStateDocumentMigrationReport {
    readonly sourceSchemaVersion: typeof SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION;
    readonly targetSchemaVersion: typeof SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION;
    readonly contentType: typeof SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE;
    readonly appliedDocumentMigrations: readonly SaveWorldStateDocumentAppliedMigration[];
    readonly appliedDocumentMigrationCount: 0;
    readonly ownerHookCounts: Record<SaveCompatibilityOwner, number>;
}

export interface SaveWorldStateDocumentMigrationResult {
    readonly pipelineId: typeof SAVE_WORLD_STATE_DOCUMENT_MIGRATION_PIPELINE_ID;
    readonly document: SaveWorldStateDocument;
    readonly report: SaveWorldStateDocumentMigrationReport;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatMetadataValue(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (value === null) {
        return 'null';
    }

    return typeof value;
}

function assertCurrentDocumentMigrationEnvelope(value: unknown): void {
    if (!isRecord(value)) {
        throw new Error('Invalid SaveWorldStateDocument: top-level value must be an object.');
    }

    if (value.schemaVersion !== SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION) {
        throw new Error(
            'Unsupported SaveWorldStateDocument migration source schemaVersion: '
            + `${formatMetadataValue(value.schemaVersion)}. Expected ${SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION}.`,
        );
    }

    if (value.contentType !== SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE) {
        throw new Error(
            'Unsupported SaveWorldStateDocument contentType: '
            + `${formatMetadataValue(value.contentType)}. Expected ${SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE}.`,
        );
    }

    if (!isRecord(value.content)) {
        throw new Error('Unsupported SaveWorldStateDocument content metadata: content must be an object.');
    }

    if (value.content.source !== SAVE_WORLD_STATE_DOCUMENT_SOURCE) {
        throw new Error(
            'Unsupported SaveWorldStateDocument content metadata: '
            + `source must be ${SAVE_WORLD_STATE_DOCUMENT_SOURCE}.`,
        );
    }

    if (value.content.snapshotSchemaVersion !== null) {
        throw new Error('Unsupported SaveWorldStateDocument content metadata: snapshotSchemaVersion must be null.');
    }
}

export function migrateSaveWorldStateDocumentToCurrentSchema(
    document: unknown,
): SaveWorldStateDocumentMigrationResult {
    assertCurrentDocumentMigrationEnvelope(document);

    const migratedDocument = cloneSaveWorldStateDocument(document as SaveWorldStateDocument);

    return {
        pipelineId: SAVE_WORLD_STATE_DOCUMENT_MIGRATION_PIPELINE_ID,
        document: migratedDocument,
        report: {
            sourceSchemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
            targetSchemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
            contentType: SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
            appliedDocumentMigrations: [],
            appliedDocumentMigrationCount: 0,
            ownerHookCounts: { ...migratedDocument.migrationBoundary.ownerHookCounts },
        },
    };
}
