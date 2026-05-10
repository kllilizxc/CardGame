import { describe, expect, it } from 'bun:test';

import type { RunSnapshot } from '../types/expedition';
import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import { STORY_HUB_SESSION_STORAGE_KEY } from './StoryHubSessionPersistence';
import {
    exportSaveWorldStateDocumentFromStorage,
    restoreSaveWorldStateDocumentToStorage,
} from './SaveWorldStateDocumentTransfer';
import {
    restoreAndVerifySaveWorldStateDocumentToStorage,
    verifySaveWorldStateDocumentTransferReadback,
} from './SaveWorldStateDocumentTransferVerification';
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
            throw new Error('ambient globalThis.localStorage must not be used by save document transfer verification');
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

    storage.seed(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(createTestStoryHubDocument(`story for ${runId}`)));
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

function parseStoredJson(rawValue: string | null): unknown {
    if (rawValue === null) {
        throw new Error('Expected a stored JSON value.');
    }

    return JSON.parse(rawValue);
}

describe('SaveWorldStateDocumentTransferVerification', () => {
    it('restores and verifies the selected active-run identity through injected target readback without ambient storage', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage();
        const syntheticRun = seedCompleteWorldState(sourceStorage, SYNTHETIC_TARGET, 'run-synthetic-source');
        sourceStorage.seed(
            createActiveRunStorageKey(DEFAULT_TARGET),
            JSON.stringify(createTransferRunSnapshot(DEFAULT_TARGET, 'run-default-source')),
        );
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, 'target legacy active run must remain untouched');
        const document = exportSaveWorldStateDocumentFromStorage({
            sourceStorage,
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        const result = withThrowingAmbientLocalStorage(() => restoreAndVerifySaveWorldStateDocumentToStorage(
            document,
            { targetStorage },
        ));

        expect(result.restoreResult.status).toBe('success');
        expect(result.verification.verified).toBe(true);
        expect(result.verification.status).toBe('verified');
        expect(result.verification.differences).toEqual([]);
        expect(result.verification.actualDocument.worldState.activeRun.keys.routeKey).toBe(
            'expedition:synthetic-expedition:synthetic-map',
        );
        expect(result.verification.actualDocument.worldState.activeRun.document?.runId).toBe(syntheticRun.runId);
        expect(parseStoredJson(targetStorage.peek(createActiveRunStorageKey(SYNTHETIC_TARGET)))).toMatchObject({
            runId: syntheticRun.runId,
            routeKey: createActiveRunRouteKey(SYNTHETIC_TARGET),
        });
        expect(targetStorage.peek(createActiveRunStorageKey(DEFAULT_TARGET))).toBeNull();
        expect(targetStorage.peek(ACTIVE_RUN_STORAGE_KEY)).toBe('target legacy active run must remain untouched');
    });

    it('restores null stash and active-run slices as removes and verifies the readback document', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage();
        const activeRunStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        sourceStorage.seed(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(createTestStoryHubDocument('empty source')));
        targetStorage.seed(STASH_STORAGE_KEY, 'old target stash');
        targetStorage.seed(activeRunStorageKey, 'old target active run');
        targetStorage.seed(
            ACTIVE_RUN_STORAGE_KEY,
            JSON.stringify(createTransferRunSnapshot(SYNTHETIC_TARGET, 'legacy-other-run')),
        );
        const document = exportSaveWorldStateDocumentFromStorage({
            sourceStorage,
            activeRunIdentity: DEFAULT_TARGET,
        });

        const result = withThrowingAmbientLocalStorage(() => restoreAndVerifySaveWorldStateDocumentToStorage(
            document,
            { targetStorage },
        ));

        expect(result.verification.verified).toBe(true);
        expect(result.verification.differences).toEqual([]);
        expect(result.verification.actualDocument.worldState.persistentStash.document).toBeNull();
        expect(result.verification.actualDocument.worldState.activeRun.document).toBeNull();
        expect(targetStorage.peek(STASH_STORAGE_KEY)).toBeNull();
        expect(targetStorage.peek(activeRunStorageKey)).toBeNull();
        expect(parseStoredJson(targetStorage.peek(ACTIVE_RUN_STORAGE_KEY))).toMatchObject({
            runId: 'legacy-other-run',
            routeKey: createActiveRunRouteKey(SYNTHETIC_TARGET),
        });
    });

    it('reports target readback slice mismatches against the expected document', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage();
        const expectedRun = seedCompleteWorldState(sourceStorage, DEFAULT_TARGET, 'run-source-expected');
        const document = exportSaveWorldStateDocumentFromStorage({
            sourceStorage,
            activeRunIdentity: DEFAULT_TARGET,
        });
        restoreSaveWorldStateDocumentToStorage(document, { targetStorage });
        targetStorage.seed(
            createActiveRunStorageKey(DEFAULT_TARGET),
            JSON.stringify(createTransferRunSnapshot(DEFAULT_TARGET, 'run-target-mismatch')),
        );

        const verification = withThrowingAmbientLocalStorage(() => verifySaveWorldStateDocumentTransferReadback(
            document,
            { targetStorage },
        ));

        expect(verification.verified).toBe(false);
        expect(verification.status).toBe('mismatch');
        expect(verification.differences).toContainEqual({
            kind: 'changed',
            path: '$.worldState.activeRun.document.runId',
            expected: expectedRun.runId,
            actual: 'run-target-mismatch',
        });
    });

    it('rejects malformed documents before target writes or verification reads', () => {
        const sourceStorage = new RecordingStorage({ failOnSet: true, failOnRemove: true });
        const targetStorage = new RecordingStorage();
        const document = exportSaveWorldStateDocumentFromStorage({
            sourceStorage,
            activeRunIdentity: DEFAULT_TARGET,
        });
        const malformedDocument = {
            ...document,
            contentType: 'application/json',
        };

        expect(() => withThrowingAmbientLocalStorage(() => restoreAndVerifySaveWorldStateDocumentToStorage(
            malformedDocument as never,
            { targetStorage },
        ))).toThrow('Invalid SaveWorldStateDocument');
        expect(targetStorage.calls).toEqual([]);
    });
});
