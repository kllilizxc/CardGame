import { describe, expect, it } from 'bun:test';

import { SAVE_COMPATIBILITY_REGISTRY } from './SaveCompatibility';
import {
    createSaveWorldStateDocument,
    SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
    SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';
import {
    parseSaveWorldStateDocumentJsonText,
    serializeSaveWorldStateDocumentJsonText,
} from './SaveWorldStateDocumentCodec';
import {
    migrateSaveWorldStateDocumentToCurrentSchema,
    SAVE_WORLD_STATE_DOCUMENT_MIGRATION_PIPELINE_ID,
} from './SaveWorldStateDocumentMigration';
import { createSaveWorldStateSnapshot } from './SaveWorldStateSnapshot';

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

function createCurrentDocument(): SaveWorldStateDocument {
    return createSaveWorldStateDocument(createSaveWorldStateSnapshot({ storage: new MemoryStorage() }));
}

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by save document JSON codec');
        },
    });

    try {
        return callback();
    } finally {
        if (descriptor) {
            Object.defineProperty(globalThis, 'localStorage', descriptor);
        } else {
            delete (globalThis as { localStorage?: Storage }).localStorage;
        }
    }
}

describe('SaveWorldStateDocumentCodec', () => {
    it('serializes validated current documents as stable pretty JSON text', () => {
        const document = createCurrentDocument();

        const firstJsonText = serializeSaveWorldStateDocumentJsonText(document);
        const secondJsonText = serializeSaveWorldStateDocumentJsonText(document);

        expect(firstJsonText).toBe(`${JSON.stringify(document, null, 2)}\n`);
        expect(secondJsonText).toBe(firstJsonText);
        expect(firstJsonText).toContain('\n  "schemaVersion": 1,');
        expect(JSON.parse(firstJsonText)).toEqual(document);
    });

    it('parses exported JSON through the migration pipeline into a cloned current document and report', () => {
        const document = createCurrentDocument();
        const jsonText = serializeSaveWorldStateDocumentJsonText(document);

        const result = parseSaveWorldStateDocumentJsonText(jsonText);
        const expectedMigration = migrateSaveWorldStateDocumentToCurrentSchema(JSON.parse(jsonText));
        result.document.worldState.storyHubSession.document.hubs['hub.changed'] = {
            hubId: 'hub.changed',
            currentLocationId: 'location.changed',
            updatedAt: '2026-05-10T00:00:00.000Z',
        };

        expect(result.pipelineId).toBe(SAVE_WORLD_STATE_DOCUMENT_MIGRATION_PIPELINE_ID);
        expect(result.report).toEqual(expectedMigration.report);
        expect(result.report).toEqual({
            sourceSchemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
            targetSchemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
            contentType: SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
            appliedDocumentMigrations: [],
            appliedDocumentMigrationCount: 0,
            ownerHookCounts: {
                storyHubSession: SAVE_COMPATIBILITY_REGISTRY.storyHubSession.migrationHooks.length,
                persistentStash: SAVE_COMPATIBILITY_REGISTRY.persistentStash.migrationHooks.length,
                activeRun: SAVE_COMPATIBILITY_REGISTRY.activeRun.migrationHooks.length,
            },
        });
        expect(expectedMigration.document).toEqual(document);
        expect(result.document).not.toBe(document);
        expect(result.document.worldState.storyHubSession.document).not.toBe(
            document.worldState.storyHubSession.document,
        );
        expect(document.worldState.storyHubSession.document.hubs).toEqual({});
    });

    it('returns independent document instances for repeated parses of the same JSON text', () => {
        const document = createCurrentDocument();
        const jsonText = serializeSaveWorldStateDocumentJsonText(document);

        const firstResult = parseSaveWorldStateDocumentJsonText(jsonText);
        const secondResult = parseSaveWorldStateDocumentJsonText(jsonText);
        firstResult.document.worldState.storyHubSession.document.hubs['hub.first'] = {
            hubId: 'hub.first',
            currentLocationId: 'location.first',
            updatedAt: '2026-05-10T00:00:00.000Z',
        };

        expect(secondResult.document).toEqual(document);
        expect(secondResult.document.worldState.storyHubSession.document.hubs).toEqual({});
        expect(firstResult.document.worldState.storyHubSession.document).not.toBe(
            secondResult.document.worldState.storyHubSession.document,
        );
    });

    it('rejects malformed JSON text before migration', () => {
        expect(() => parseSaveWorldStateDocumentJsonText('{not valid json'))
            .toThrow('Invalid SaveWorldStateDocument JSON');
    });

    it('rejects invalid current metadata during export and import', () => {
        const document = createCurrentDocument();
        const malformedDocument = {
            ...document,
            content: {
                ...document.content,
                owners: ['storyHubSession'],
            },
        };

        expect(() => serializeSaveWorldStateDocumentJsonText(malformedDocument as never))
            .toThrow('Invalid SaveWorldStateDocument');
        expect(() => parseSaveWorldStateDocumentJsonText(JSON.stringify(malformedDocument)))
            .toThrow('Invalid SaveWorldStateDocument');
    });

    it('rejects unsupported schema envelopes through the migration pipeline', () => {
        const document = createCurrentDocument();

        expect(() => parseSaveWorldStateDocumentJsonText(JSON.stringify({
            ...document,
            schemaVersion: 2,
        }))).toThrow('Unsupported SaveWorldStateDocument migration source schemaVersion: 2. Expected 1.');
    });

    it('does not access ambient localStorage while serializing or parsing JSON text', () => {
        const document = createCurrentDocument();
        const jsonText = serializeSaveWorldStateDocumentJsonText(document);

        const result = withThrowingAmbientLocalStorage(() => ({
            exported: serializeSaveWorldStateDocumentJsonText(document),
            imported: parseSaveWorldStateDocumentJsonText(jsonText),
        }));

        expect(result.exported).toBe(jsonText);
        expect(result.imported.document).toEqual(document);
    });
});
