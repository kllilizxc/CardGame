import { describe, expect, it } from 'bun:test';

import type { ExpeditionRouteIdentity, RunSnapshot } from '../types/expedition';
import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import {
    SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
    SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
} from './SaveWorldStateDocument';
import { serializeSaveWorldStateDocumentJsonText } from './SaveWorldStateDocumentCodec';
import {
    exportSaveWorldStateDocumentJsonTextFromStorage,
    restoreSaveWorldStateDocumentJsonTextToStorage,
} from './SaveWorldStateDocumentTextTransfer';
import { STORY_HUB_SESSION_STORAGE_KEY } from './StoryHubSessionPersistence';

import {
    createRunSnapshot,
    createItemStack,
    createTestPersistentStash,
    createTestStoryHubDocument,
    DEFAULT_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET: ExpeditionRouteIdentity = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET: ExpeditionRouteIdentity = SYNTHETIC_EXPEDITION_TARGET;

type StorageCall =
    | readonly ['getItem', string]
    | readonly ['setItem', string, string]
    | readonly ['removeItem', string];

interface RecordingStorageOptions {
    readonly failOnGet?: boolean;
    readonly failOnSet?: boolean;
    readonly failOnRemove?: boolean;
    readonly transformSetItem?: (key: string, value: string) => string;
}

class RecordingStorage implements Storage {
    private readonly values = new Map<string, string>();
    readonly calls: StorageCall[] = [];

    constructor(private readonly options: RecordingStorageOptions = {}) {}

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        if (this.options.failOnGet) {
            throw new Error(`unexpected getItem(${key})`);
        }

        this.calls.push(['getItem', key]);
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        if (this.options.failOnRemove) {
            throw new Error(`unexpected removeItem(${key})`);
        }

        this.calls.push(['removeItem', key]);
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        if (this.options.failOnSet) {
            throw new Error(`unexpected setItem(${key})`);
        }

        this.calls.push(['setItem', key, value]);
        this.values.set(key, this.options.transformSetItem?.(key, value) ?? value);
    }

    seed(key: string, value: string): void {
        this.values.set(key, value);
    }

    peek(key: string): string | null {
        return this.values.get(key) ?? null;
    }
}

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by save document text transfer');
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

function createTextTransferRunSnapshot(
    identity: ExpeditionRouteIdentity,
    runId: string,
): RunSnapshot {
    return createRunSnapshot(identity, {
        runId,
        currentNodeId: 'entrance.source',
        startingLoadout: {
            cards: [{ id: 'SRC_CARD', count: 1 }],
            items: [],
            spiritStones: 10,
        },
        carriedDeck: [{ id: 'SRC_CARD', count: 3 }],
        carriedItems: [],
        spiritStones: 17,
        visitedNodeIds: ['entrance.source'],
        nodeStates: {
            'entrance.source': {
                nodeId: 'entrance.source',
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
        },
        startedAt: '2026-05-10T00:01:00.000Z',
    });
}

function seedCompleteWorldState(
    storage: RecordingStorage,
    identity: ExpeditionRouteIdentity,
    runId: string,
): RunSnapshot {
    const run = createTextTransferRunSnapshot(identity, runId);

    storage.seed(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(createTestStoryHubDocument(`story for ${runId}`)));
    storage.seed(STASH_STORAGE_KEY, JSON.stringify(createTestPersistentStash({
        stashId: 'stash.source',
        deckRef: 'deck.source',
        deck: [{ id: 'SRC_CARD', count: 2 }],
        items: [createItemStack('source-tool', 'tool', 1)],
        spiritStones: 88,
    })));
    storage.seed(createActiveRunStorageKey(identity), JSON.stringify(run));

    return run;
}

function parseStoredJson(rawValue: string | null): unknown {
    if (rawValue === null) {
        throw new Error('Expected a stored JSON value.');
    }

    return JSON.parse(rawValue);
}

function corruptActiveRunOnSet(identity: ExpeditionRouteIdentity, runId: string) {
    return (key: string, value: string): string => {
        if (key !== createActiveRunStorageKey(identity)) {
            return value;
        }

        return JSON.stringify({
            ...JSON.parse(value),
            runId,
        });
    };
}

describe('SaveWorldStateDocumentTextTransfer', () => {
    it('exports a selected active-run identity from injected source storage as stable JSON text without ambient access', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const syntheticRun = seedCompleteWorldState(sourceStorage, SYNTHETIC_TARGET, 'run-synthetic-source');
        sourceStorage.seed(
            createActiveRunStorageKey(DEFAULT_TARGET),
            JSON.stringify(createTextTransferRunSnapshot(DEFAULT_TARGET, 'run-default-source')),
        );

        const result = withThrowingAmbientLocalStorage(() => exportSaveWorldStateDocumentJsonTextFromStorage({
            sourceStorage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));
        const repeated = withThrowingAmbientLocalStorage(() => exportSaveWorldStateDocumentJsonTextFromStorage({
            sourceStorage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(result.document.worldState.activeRun.keys.routeKey).toBe(SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY);
        expect(result.document.worldState.activeRun.document?.runId).toBe(syntheticRun.runId);
        expect(result.jsonText).toBe(serializeSaveWorldStateDocumentJsonText(result.document));
        expect(repeated.jsonText).toBe(result.jsonText);
        expect(JSON.parse(result.jsonText)).toEqual(result.document);
        expect(sourceStorage.calls).toEqual([
            ['getItem', STORY_HUB_SESSION_STORAGE_KEY],
            ['getItem', STASH_STORAGE_KEY],
            ['getItem', createActiveRunStorageKey(SYNTHETIC_TARGET)],
            ['getItem', STORY_HUB_SESSION_STORAGE_KEY],
            ['getItem', STASH_STORAGE_KEY],
            ['getItem', createActiveRunStorageKey(SYNTHETIC_TARGET)],
        ]);
    });

    it('restores parsed and migrated JSON text into injected target storage and exposes successful verification readback', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage();
        const syntheticRun = seedCompleteWorldState(sourceStorage, SYNTHETIC_TARGET, 'run-synthetic-source');
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, 'target legacy active run must remain untouched');
        const { jsonText } = exportSaveWorldStateDocumentJsonTextFromStorage({
            sourceStorage,
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        const result = withThrowingAmbientLocalStorage(() => restoreSaveWorldStateDocumentJsonTextToStorage(
            jsonText,
            { targetStorage },
        ));

        expect(result.migration.document.worldState.activeRun.document?.runId).toBe(syntheticRun.runId);
        expect(result.migration.report).toMatchObject({
            sourceSchemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
            targetSchemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
            contentType: SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
            appliedDocumentMigrations: [],
            appliedDocumentMigrationCount: 0,
        });
        expect(result.restoreResult.status).toBe('success');
        expect(result.verification.status).toBe('verified');
        expect(result.verification.verified).toBe(true);
        expect(result.verification.differences).toEqual([]);
        expect(parseStoredJson(targetStorage.peek(createActiveRunStorageKey(SYNTHETIC_TARGET)))).toMatchObject({
            runId: syntheticRun.runId,
            routeKey: createActiveRunRouteKey(SYNTHETIC_TARGET),
        });
        expect(targetStorage.peek(ACTIVE_RUN_STORAGE_KEY)).toBe('target legacy active run must remain untouched');
    });

    it('reports verification mismatches when target readback differs from the migrated document', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        seedCompleteWorldState(sourceStorage, DEFAULT_TARGET, 'run-source-expected');
        const targetStorage = new RecordingStorage({
            transformSetItem: corruptActiveRunOnSet(DEFAULT_TARGET, 'run-target-mismatch'),
        });
        const { jsonText } = exportSaveWorldStateDocumentJsonTextFromStorage({
            sourceStorage,
            activeRunIdentity: DEFAULT_TARGET,
        });

        const result = withThrowingAmbientLocalStorage(() => restoreSaveWorldStateDocumentJsonTextToStorage(
            jsonText,
            { targetStorage },
        ));

        expect(result.restoreResult.status).toBe('success');
        expect(result.verification.status).toBe('mismatch');
        expect(result.verification.verified).toBe(false);
        expect(result.verification.differences).toContainEqual({
            kind: 'changed',
            path: '$.worldState.activeRun.document.runId',
            expected: 'run-source-expected',
            actual: 'run-target-mismatch',
        });
    });

    it('rejects malformed JSON text before target writes or verification reads', () => {
        const targetStorage = new RecordingStorage();
        targetStorage.seed(STASH_STORAGE_KEY, 'old target stash');

        expect(() => withThrowingAmbientLocalStorage(() => restoreSaveWorldStateDocumentJsonTextToStorage(
            '{not valid json',
            { targetStorage },
        ))).toThrow('Invalid SaveWorldStateDocument JSON');
        expect(targetStorage.calls).toEqual([]);
        expect(targetStorage.peek(STASH_STORAGE_KEY)).toBe('old target stash');
    });

    it('rejects malformed save documents parsed from JSON text before target writes or verification reads', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage();
        const { document } = exportSaveWorldStateDocumentJsonTextFromStorage({
            sourceStorage,
            activeRunIdentity: DEFAULT_TARGET,
        });
        const malformedJsonText = JSON.stringify({
            ...document,
            contentType: 'application/json',
        });

        expect(() => withThrowingAmbientLocalStorage(() => restoreSaveWorldStateDocumentJsonTextToStorage(
            malformedJsonText,
            { targetStorage },
        ))).toThrow('Unsupported SaveWorldStateDocument contentType');
        expect(targetStorage.calls).toEqual([]);
    });

    it('restores null stash and active-run slices as target removes through parsed JSON text', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage();
        const activeRunStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        sourceStorage.seed(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(createTestStoryHubDocument('empty source')));
        targetStorage.seed(STASH_STORAGE_KEY, 'old target stash');
        targetStorage.seed(activeRunStorageKey, 'old target active run');
        targetStorage.seed(
            ACTIVE_RUN_STORAGE_KEY,
            JSON.stringify(createTextTransferRunSnapshot(SYNTHETIC_TARGET, 'legacy-other-run')),
        );
        const { jsonText } = exportSaveWorldStateDocumentJsonTextFromStorage({
            sourceStorage,
            activeRunIdentity: DEFAULT_TARGET,
        });

        const result = withThrowingAmbientLocalStorage(() => restoreSaveWorldStateDocumentJsonTextToStorage(
            jsonText,
            { targetStorage },
        ));

        expect(result.migration.document.worldState.persistentStash.document).toBeNull();
        expect(result.migration.document.worldState.activeRun.document).toBeNull();
        expect(result.verification.verified).toBe(true);
        expect(targetStorage.peek(STASH_STORAGE_KEY)).toBeNull();
        expect(targetStorage.peek(activeRunStorageKey)).toBeNull();
        expect(parseStoredJson(targetStorage.peek(ACTIVE_RUN_STORAGE_KEY))).toMatchObject({
            runId: 'legacy-other-run',
            routeKey: createActiveRunRouteKey(SYNTHETIC_TARGET),
        });
    });
});
