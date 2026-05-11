import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import { ExpeditionState } from '../state/ExpeditionState';
import type { StoryState } from '../types/story';
import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunStorageKey,
    resetRunPersistenceForTests,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import {
    resetStoryHubSessionPersistenceForTests,
    saveHubSessionSnapshot,
    saveStoryRuntimeSession,
    STORY_HUB_SESSION_STORAGE_KEY,
} from './StoryHubSessionPersistence';
import { createSaveWorldStateSnapshot } from './SaveWorldStateSnapshot';
import {
    createSaveWorldStateDocument,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';
import { createSaveWorldStateDocumentRestorePlan } from './SaveWorldStateDocumentRestorePlan';
import {
    executeSaveWorldStateDocumentRestorePlan,
    SaveWorldStateDocumentRestoreExecutionError,
} from './SaveWorldStateDocumentRestoreExecutor';
import {
    DEFAULT_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
    normalizeExpeditionWorldStateSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const createWorldStateSeed = () => normalizeExpeditionWorldStateSeed(structuredClone(initialWorldState));

type StorageCall =
    | readonly ['setItem', string, string]
    | readonly ['removeItem', string];

class RecordingStorage implements Storage {
    private readonly values = new Map<string, string>();
    readonly calls: StorageCall[] = [];

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
        this.calls.push(['removeItem', key]);
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.calls.push(['setItem', key, value]);
        this.values.set(key, value);
    }

    keys(): string[] {
        return [...this.values.keys()];
    }

    seed(key: string, value: string): void {
        this.values.set(key, value);
    }
}

class FailingStorage extends RecordingStorage {
    constructor(private readonly failOnCallNumber: number) {
        super();
    }

    override removeItem(key: string): void {
        if (this.calls.length + 1 === this.failOnCallNumber) {
            throw new Error(`remove failed for ${key}`);
        }

        super.removeItem(key);
    }

    override setItem(key: string, value: string): void {
        if (this.calls.length + 1 === this.failOnCallNumber) {
            throw new Error(`set failed for ${key}`);
        }

        super.setItem(key, value);
    }
}

let previousLocalStorageDescriptor: PropertyDescriptor | undefined;

function installMemoryStorage(): void {
    previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const sourceStorage = new RecordingStorage();

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: sourceStorage,
    });
}

function restoreLocalStorage(): void {
    if (previousLocalStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousLocalStorageDescriptor);
    } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
    }
}

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by injected save read/write flow');
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

function createStoryState(nodeId = 'sect_entry_003_help_girl'): StoryState {
    return {
        storyId: 'story.qingyun-entry',
        currentLocationId: 'location.qingyun-gate',
        currentSublocationId: 'sublocation.qingyun.queue-edge',
        currentNodeId: nodeId,
        visitedNodeIds: ['sect_entry_001', nodeId],
        triggeredDialogueIds: ['dialogue.frail_girl.intro'],
        flags: {
            'story.sect_entry.helped_frail_girl': true,
        },
        attributes: {
            心性: 56,
        },
        relations: {
            'npc.frail-girl': 5,
        },
    };
}

function startRun(
    targetIdentity: { expeditionId: string; mapId: string } = DEFAULT_TARGET,
    runStorage?: RecordingStorage,
    entryNodeId = targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'entrance.mountain-gate' : 'entrance.synthetic',
): string {
    const state = ExpeditionState.bootstrap({
        worldState: createWorldStateSeed(),
        starterDeck: structuredClone(starterDeckJson),
        targetIdentity,
        storage: runStorage,
    });
    const run = state.createRunSnapshot({
        ...targetIdentity,
        entryNodeId,
    });

    state.applyNodeRewardPreview({
        cards: [{ id: targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'TL_002' : 'AR_001', count: 1 }],
        items: [],
        spiritStones: 7,
    });

    return run.runId;
}

function createCompleteRestorePlan() {
    saveHubSessionSnapshot({
        hubId: 'hub.qingyun-town',
        currentLocationId: 'location.qingyun-town.teahouse',
        statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
        updatedAt: '2026-05-09T06:00:00.000Z',
    });
    saveStoryRuntimeSession({
        hubId: 'hub.qingyun-town',
        actionId: 'action.start-qingyun-entry-story',
        storyGraphFile: 'data/story/story-graph.json',
        storyState: createStoryState(),
        selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
        statusText: '已选择：注意到队伍中有一名体弱少女，主动上前搭话。',
        updatedAt: '2026-05-09T06:01:00.000Z',
    });
    startRun(SYNTHETIC_TARGET);
    const document = createSaveWorldStateDocument(
        createSaveWorldStateSnapshot({ activeRunIdentity: SYNTHETIC_TARGET }),
    );

    return createSaveWorldStateDocumentRestorePlan(document);
}

describe('SaveWorldStateDocumentRestoreExecutor', () => {
    beforeEach(() => {
        installMemoryStorage();
        resetRunPersistenceForTests();
        resetStoryHubSessionPersistenceForTests();
    });

    afterEach(() => {
        resetRunPersistenceForTests();
        resetStoryHubSessionPersistenceForTests();
        restoreLocalStorage();
    });

    it('applies setItem descriptors to the injected storage in order while keeping legacy active-run as an explicit no-op', () => {
        const plan = createCompleteRestorePlan();
        const targetStorage = new RecordingStorage();
        targetStorage.seed('unrelated.key', 'unrelated');
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, 'legacy-active-run');

        const result = executeSaveWorldStateDocumentRestorePlan(plan, targetStorage);

        expect(targetStorage.calls).toEqual([
            ['setItem', STORY_HUB_SESSION_STORAGE_KEY, plan.operations[0].operation === 'setItem' ? plan.operations[0].value : ''],
            ['setItem', STASH_STORAGE_KEY, plan.operations[1].operation === 'setItem' ? plan.operations[1].value : ''],
            [
                'setItem',
                createActiveRunStorageKey(SYNTHETIC_TARGET),
                plan.operations[2].operation === 'setItem' ? plan.operations[2].value : '',
            ],
        ]);
        expect(targetStorage.getItem('unrelated.key')).toBe('unrelated');
        expect(targetStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBe('legacy-active-run');
        expect(result).toEqual({
            status: 'success',
            appliedOperations: plan.operations,
        });
    });

    it('applies removeItem descriptors for null stash and route-keyed active-run slices without touching other keys', () => {
        const document = createSaveWorldStateDocument(createSaveWorldStateSnapshot());
        const plan = createSaveWorldStateDocumentRestorePlan(document);
        const targetStorage = new RecordingStorage();
        const activeRunStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        targetStorage.seed(STASH_STORAGE_KEY, 'old-stash');
        targetStorage.seed(activeRunStorageKey, 'old-active-run');
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, 'legacy-active-run');
        targetStorage.seed('unrelated.key', 'unrelated');

        executeSaveWorldStateDocumentRestorePlan(plan, targetStorage);

        expect(targetStorage.calls).toEqual([
            ['setItem', STORY_HUB_SESSION_STORAGE_KEY, plan.operations[0].operation === 'setItem' ? plan.operations[0].value : ''],
            ['removeItem', STASH_STORAGE_KEY],
            ['removeItem', activeRunStorageKey],
        ]);
        expect(targetStorage.getItem(STASH_STORAGE_KEY)).toBeNull();
        expect(targetStorage.getItem(activeRunStorageKey)).toBeNull();
        expect(targetStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBe('legacy-active-run');
        expect(targetStorage.getItem('unrelated.key')).toBe('unrelated');
    });

    it('executes against only the injected storage and does not require browser localStorage at restore time', () => {
        const plan = createCompleteRestorePlan();
        restoreLocalStorage();
        const targetStorage = new RecordingStorage();

        executeSaveWorldStateDocumentRestorePlan(plan, targetStorage);

        expect(targetStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBe(
            plan.operations[0].operation === 'setItem' ? plan.operations[0].value : '',
        );
        expect(targetStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBe(
            plan.operations[2].operation === 'setItem' ? plan.operations[2].value : '',
        );
    });

    it('round-trips snapshot document creation and restore through injected storages without touching ambient localStorage', () => {
        const sourceStorage = new RecordingStorage();
        const targetStorage = new RecordingStorage();
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: 'round-trip source session',
            updatedAt: '2026-05-09T06:00:00.000Z',
        }, sourceStorage);
        saveStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState: createStoryState('sect_entry_006_restore_injected_storage'),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: 'round-trip source story',
            updatedAt: '2026-05-09T06:01:00.000Z',
        }, sourceStorage);
        const syntheticRunId = startRun(SYNTHETIC_TARGET, sourceStorage);

        const restoredSnapshot = withThrowingAmbientLocalStorage(() => {
            const sourceDocument = createSaveWorldStateDocument(createSaveWorldStateSnapshot({
                storage: sourceStorage,
                activeRunIdentity: SYNTHETIC_TARGET,
            }));
            const plan = createSaveWorldStateDocumentRestorePlan(sourceDocument);

            executeSaveWorldStateDocumentRestorePlan(plan, targetStorage);

            return createSaveWorldStateSnapshot({
                storage: targetStorage,
                activeRunIdentity: SYNTHETIC_TARGET,
            });
        });

        expect(restoredSnapshot.storyHubSession.document.hubs['hub.qingyun-town']).toMatchObject({
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: 'round-trip source session',
        });
        expect(restoredSnapshot.persistentStash.document?.stashId).toBe('phase01.starter-stash');
        expect(restoredSnapshot.activeRun.document?.runId).toBe(syntheticRunId);
        expect(targetStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(targetStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).not.toBeNull();
    });

    it('rejects malformed plan descriptors before performing any storage write', () => {
        const plan = createCompleteRestorePlan();
        const malformedPlan = {
            ...plan,
            operations: [
                {
                    operation: 'setItem',
                    owner: 'activeRun',
                    routeKey: plan.operations[2].routeKey,
                    storageKey: ACTIVE_RUN_STORAGE_KEY,
                    value: '{}',
                },
            ],
        };
        const targetStorage = new RecordingStorage();

        expect(() => executeSaveWorldStateDocumentRestorePlan(malformedPlan as never, targetStorage))
            .toThrow('Invalid SaveWorldStateDocumentRestorePlan');
        expect(targetStorage.calls).toEqual([]);
    });

    it('preserves existing document validation as the boundary for malformed documents', () => {
        const document = createSaveWorldStateDocument(createSaveWorldStateSnapshot());
        const malformedDocument = {
            ...document,
            worldState: {
                ...document.worldState,
                storyHubSession: {
                    ...document.worldState.storyHubSession,
                    document: {
                        ...document.worldState.storyHubSession.document,
                        schemaVersion: 99,
                    },
                },
            },
        };

        expect(() => createSaveWorldStateDocumentRestorePlan(malformedDocument as unknown as SaveWorldStateDocument))
            .toThrow('Invalid SaveWorldStateDocument');
    });

    it('throws a contextual execution error when injected storage fails after earlier ordered writes', () => {
        const plan = createCompleteRestorePlan();
        const failingStorage = new FailingStorage(2);

        try {
            executeSaveWorldStateDocumentRestorePlan(plan, failingStorage);
        } catch (error) {
            expect(error).toBeInstanceOf(SaveWorldStateDocumentRestoreExecutionError);
            const executionError = error as SaveWorldStateDocumentRestoreExecutionError;
            expect(executionError.planOperationIndex).toBe(1);
            expect(executionError.failedOperation).toEqual(plan.operations[1]);
            expect(executionError.appliedOperations).toEqual([plan.operations[0]]);
            expect(executionError.cause).toBeInstanceOf(Error);
            expect((executionError.cause as Error).message).toContain('failed');
            return;
        }

        throw new Error('Expected restore execution to fail.');
    });
});
