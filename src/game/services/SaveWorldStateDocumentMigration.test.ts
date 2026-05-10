import { describe, expect, it } from 'bun:test';

import { SAVE_COMPATIBILITY_REGISTRY } from './SaveCompatibility';
import {
    createSaveWorldStateDocument,
    SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
    SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
} from './SaveWorldStateDocument';
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

function createCurrentDocument() {
    return createSaveWorldStateDocument(createSaveWorldStateSnapshot({ storage: new MemoryStorage() }));
}

describe('SaveWorldStateDocumentMigration', () => {
    it('returns a pure v1 identity migration result with a cloned document and zero applied document migrations', () => {
        const document = createCurrentDocument();

        const result = migrateSaveWorldStateDocumentToCurrentSchema(document);
        result.document.worldState.storyHubSession.document.hubs['hub.changed'] = {
            hubId: 'hub.changed',
            currentLocationId: 'location.changed',
            updatedAt: '2026-05-10T00:00:00.000Z',
        };

        expect(result.pipelineId).toBe(SAVE_WORLD_STATE_DOCUMENT_MIGRATION_PIPELINE_ID);
        expect(result.document).toEqual({
            ...document,
            worldState: {
                ...document.worldState,
                storyHubSession: {
                    ...document.worldState.storyHubSession,
                    document: {
                        ...document.worldState.storyHubSession.document,
                        hubs: {
                            'hub.changed': {
                                hubId: 'hub.changed',
                                currentLocationId: 'location.changed',
                                updatedAt: '2026-05-10T00:00:00.000Z',
                            },
                        },
                    },
                },
            },
        });
        expect(document.worldState.storyHubSession.document.hubs).toEqual({});
        expect(result.document).not.toBe(document);
        expect(result.document.worldState.storyHubSession.document).not.toBe(document.worldState.storyHubSession.document);
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
    });

    it('rejects unsupported schema and content metadata before returning a migration result', () => {
        const document = createCurrentDocument();

        expect(() => migrateSaveWorldStateDocumentToCurrentSchema({
            ...document,
            schemaVersion: 2,
        })).toThrow('Unsupported SaveWorldStateDocument migration source schemaVersion: 2. Expected 1.');
        expect(() => migrateSaveWorldStateDocumentToCurrentSchema({
            ...document,
            contentType: 'application/json',
        })).toThrow(
            `Unsupported SaveWorldStateDocument contentType: application/json. Expected ${SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE}.`,
        );
        expect(() => migrateSaveWorldStateDocumentToCurrentSchema({
            ...document,
            content: {
                ...document.content,
                source: 'FutureSaveWorldStateSnapshot',
            },
        })).toThrow('Unsupported SaveWorldStateDocument content metadata: source must be SaveWorldStateSnapshot.');
        expect(() => migrateSaveWorldStateDocumentToCurrentSchema({
            ...document,
            content: {
                ...document.content,
                owners: ['storyHubSession', 'persistentStash', 'futureOwner'],
            },
        })).toThrow('Invalid SaveWorldStateDocument: content owners must match current save owners.');
    });
});
