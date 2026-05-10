import {
    validateSaveWorldStateDocument,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';
import {
    migrateSaveWorldStateDocumentToCurrentSchema,
    type SaveWorldStateDocumentMigrationResult,
} from './SaveWorldStateDocumentMigration';

export const SAVE_WORLD_STATE_DOCUMENT_JSON_INDENT = 2;

function parseJsonText(rawValue: string): unknown {
    try {
        return JSON.parse(rawValue);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid SaveWorldStateDocument JSON: ${error.message}`);
        }

        throw error;
    }
}

export function serializeSaveWorldStateDocumentJsonText(
    document: SaveWorldStateDocument,
): string {
    const validatedDocument = validateSaveWorldStateDocument(document);

    return `${JSON.stringify(validatedDocument, null, SAVE_WORLD_STATE_DOCUMENT_JSON_INDENT)}\n`;
}

export function parseSaveWorldStateDocumentJsonText(
    rawValue: string,
): SaveWorldStateDocumentMigrationResult {
    return migrateSaveWorldStateDocumentToCurrentSchema(parseJsonText(rawValue));
}
