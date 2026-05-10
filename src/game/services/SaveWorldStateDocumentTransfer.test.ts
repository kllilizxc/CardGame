import { describe, expect, it } from 'bun:test';

import type { RunSnapshot } from '../types/expedition';
import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import type { SaveWorldStateDocumentRestoreOperation } from './SaveWorldStateDocumentRestorePlan';
import {
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
} from './StoryHubSessionPersistence';
import {
    exportSaveWorldStateDocumentFromStorage,
    restoreSaveWorldStateDocumentToStorage,
    transferSaveWorldStateDocument,
} from './SaveWorldStateDocumentTransfer';
import {
    createRunSnapshot,
    createTestPersistentStash,
    createTestStoryHubDocument,
    DEFAULT_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;

type StorageCall =
    | readonly ['getItem', string]
    | readonly ['setItem', string, string]
    | readonly ['removeItem', string];

interface RecordingStorageOptions {
    readonly failOnGet?: boolean;
    readonly failOnSet?: boolean;
    readonly failOnRemove?: boolean;
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
        this.values.set(key, value);
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
            throw new Error('ambient globalThis.localStorage must not be used by save document transfer');
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

function createTransferRunSnapshot(
    identity: typeof DEFAULT_TARGET,
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
    identity: typeof DEFAULT_TARGET,
    runId: string,
): RunSnapshot {
    const run = createTransferRunSnapshot(identity, runId);

    storage.seed(
        STORY_HUB_SESSION_STORAGE_KEY,
        JSON.stringify(createTestStoryHubDocument(`story for ${runId}`)),
    );
    storage.seed(STASH_STORAGE_KEY, JSON.stringify(createTestPersistentStash({
        stashId: 'stash.source',
        deckRef: 'deck.source',
        deck: [{ id: 'SRC_CARD', count: 2 }],
        items: [{ id: 'source-tool', itemType: 'tool', count: 1 }],
        spiritStones: 88,
    })));
    storage.seed(createActiveRunStorageKey(identity), JSON.stringify(run));

    return run;
}

function mutatingCallsFromOperations(
    operations: readonly SaveWorldStateDocumentRestoreOperation[],
): StorageCall[] {
    const calls: StorageCall[] = [];

    for (const operation of operations) {
        if (operation.operation === 'setItem') {
            calls.push(['setItem', operation.storageKey, operation.value]);
        } else if (operation.operation === 'removeItem') {
            calls.push(['removeItem', operation.storageKey]);
        }
    }

    return calls;
}

function parseStoredJson(rawValue: string | null): unknown {
    if (rawValue === null) {
        throw new Error('Expected a stored JSON value.');
    }

    return JSON.parse(rawValue);
}

describe('SaveWorldStateDocumentTransfer', () => {
    it('transfers the selected active-run identity from explicit source to explicit target without cross-storage or ambient access', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage({ failOnGet: true });
        const syntheticRun = seedCompleteWorldState(sourceStorage, SYNTHETIC_TARGET, 'run-synthetic-source');
        sourceStorage.seed(
            createActiveRunStorageKey(DEFAULT_TARGET),
            JSON.stringify(createTransferRunSnapshot(DEFAULT_TARGET, 'run-default-source')),
        );
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, 'target legacy active run must remain untouched');

        const result = withThrowingAmbientLocalStorage(() => transferSaveWorldStateDocument({
            sourceStorage,
            targetStorage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(result.document.worldState.activeRun.keys.routeKey).toBe('expedition:synthetic-expedition:synthetic-map');
        expect(result.document.worldState.activeRun.document?.runId).toBe(syntheticRun.runId);
        expect(sourceStorage.calls).toEqual([
            ['getItem', STORY_HUB_SESSION_STORAGE_KEY],
            ['getItem', STASH_STORAGE_KEY],
            ['getItem', createActiveRunStorageKey(SYNTHETIC_TARGET)],
        ]);
        expect(targetStorage.calls).toEqual(mutatingCallsFromOperations(result.restorePlan.operations));
        expect(targetStorage.peek(createActiveRunStorageKey(DEFAULT_TARGET))).toBeNull();
        expect(parseStoredJson(targetStorage.peek(createActiveRunStorageKey(SYNTHETIC_TARGET)))).toMatchObject({
            runId: syntheticRun.runId,
            routeKey: createActiveRunRouteKey(SYNTHETIC_TARGET),
        });
        expect(targetStorage.peek(ACTIVE_RUN_STORAGE_KEY)).toBe('target legacy active run must remain untouched');
        expect(result.restoreResult.appliedOperations).toEqual(result.restorePlan.operations);
    });

    it('restores null stash and active-run slices as target removes without reading or mutating source', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage({ failOnGet: true });
        const activeRunStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        sourceStorage.seed(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(createTestStoryHubDocument('empty source')));
        targetStorage.seed(STASH_STORAGE_KEY, 'old target stash');
        targetStorage.seed(activeRunStorageKey, 'old target active run');
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, 'legacy target active run must remain untouched');

        const result = withThrowingAmbientLocalStorage(() => transferSaveWorldStateDocument({
            sourceStorage,
            targetStorage,
            activeRunIdentity: DEFAULT_TARGET,
        }));

        expect(result.document.worldState.persistentStash.document).toBeNull();
        expect(result.document.worldState.activeRun.document).toBeNull();
        expect(sourceStorage.calls).toEqual([
            ['getItem', STORY_HUB_SESSION_STORAGE_KEY],
            ['getItem', STASH_STORAGE_KEY],
            ['getItem', activeRunStorageKey],
            ['getItem', ACTIVE_RUN_STORAGE_KEY],
        ]);
        expect(targetStorage.calls).toEqual(mutatingCallsFromOperations(result.restorePlan.operations));
        expect(targetStorage.peek(STASH_STORAGE_KEY)).toBeNull();
        expect(targetStorage.peek(activeRunStorageKey)).toBeNull();
        expect(targetStorage.peek(ACTIVE_RUN_STORAGE_KEY)).toBe('legacy target active run must remain untouched');
    });

    it('cleans corrupt source data on the source storage and restores only fallback/null slices to the target', () => {
        const sourceStorage = new RecordingStorage();
        const targetStorage = new RecordingStorage({ failOnGet: true });
        const activeRunStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        sourceStorage.seed(STORY_HUB_SESSION_STORAGE_KEY, '{not valid story json');
        sourceStorage.seed(STASH_STORAGE_KEY, '{not valid stash json');
        sourceStorage.seed(activeRunStorageKey, '{not valid active run json');
        targetStorage.seed(STASH_STORAGE_KEY, 'old target stash');
        targetStorage.seed(activeRunStorageKey, 'old target active run');

        const result = withThrowingAmbientLocalStorage(() => transferSaveWorldStateDocument({
            sourceStorage,
            targetStorage,
            activeRunIdentity: DEFAULT_TARGET,
        }));

        expect(sourceStorage.calls).toEqual([
            ['getItem', STORY_HUB_SESSION_STORAGE_KEY],
            ['removeItem', STORY_HUB_SESSION_STORAGE_KEY],
            ['getItem', STASH_STORAGE_KEY],
            ['removeItem', STASH_STORAGE_KEY],
            ['getItem', activeRunStorageKey],
            ['removeItem', activeRunStorageKey],
            ['getItem', ACTIVE_RUN_STORAGE_KEY],
        ]);
        expect(sourceStorage.peek(STORY_HUB_SESSION_STORAGE_KEY)).toBeNull();
        expect(sourceStorage.peek(STASH_STORAGE_KEY)).toBeNull();
        expect(sourceStorage.peek(activeRunStorageKey)).toBeNull();
        expect(result.document.worldState.storyHubSession.document).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        });
        expect(result.document.worldState.persistentStash.document).toBeNull();
        expect(result.document.worldState.activeRun.document).toBeNull();
        expect(targetStorage.calls).toEqual(mutatingCallsFromOperations(result.restorePlan.operations));
        expect(parseStoredJson(targetStorage.peek(STORY_HUB_SESSION_STORAGE_KEY))).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        });
        expect(targetStorage.peek(STASH_STORAGE_KEY)).toBeNull();
        expect(targetStorage.peek(activeRunStorageKey)).toBeNull();
    });

    it('rejects a malformed document before performing target writes or removes', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage({ failOnGet: true });
        const document = exportSaveWorldStateDocumentFromStorage({
            sourceStorage,
            activeRunIdentity: DEFAULT_TARGET,
        });
        const malformedDocument = {
            ...document,
            contentType: 'application/json',
        };

        expect(() => withThrowingAmbientLocalStorage(() => restoreSaveWorldStateDocumentToStorage(
            malformedDocument as never,
            { targetStorage },
        ))).toThrow('Invalid SaveWorldStateDocument');
        expect(targetStorage.calls).toEqual([]);
    });
});
