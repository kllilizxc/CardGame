import { afterEach, describe, expect, it } from 'bun:test';

import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import initialWorldState from '../../../public/data/world/initial-state.json';

import { resetRunPersistenceForTests } from '../services/RunPersistence';
import {
    createStoryRuntimeSessionStorageKey,
    loadHubSessionSnapshot,
    loadStoryRuntimeSession,
    resetStoryHubSessionPersistenceForTests,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
    type StoryHubSessionDocument,
    type StoryHubSessionStorageAdapter,
} from '../services/StoryHubSessionPersistence';
import type { StoryState } from '../types/story';
import type { ExpeditionWorldStateSeed, StarterDeckSeed } from './GameWorldStateSeed';
import { createGameWorldState } from './GameWorldState';
import {
    applyGameWorldStateStoryHubSessionPlan,
    clearGameWorldStateStoryRuntimeSessionWithFallbackStorage,
    planGameWorldStateStoryHubSessionWrite,
    planGameWorldStateStoryHubSessionWriteFromDocument,
    planGameWorldStateStoryHubSessionWriteFromView,
    writeGameWorldStateHubSessionSnapshotWithFallbackStorage,
    writeGameWorldStateStoryHubSessionDocument,
    writeGameWorldStateStoryHubSessionPlan,
    writeGameWorldStateStoryRuntimeSessionWithFallbackStorage,
} from './GameWorldStateStoryHubSessionWrite';

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

let previousLocalStorageDescriptor: PropertyDescriptor | undefined;
let localStorageOverrideActive = false;

function overrideLocalStorage(descriptor: PropertyDescriptor): void {
    if (!localStorageOverrideActive) {
        previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
        localStorageOverrideActive = true;
    }

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        ...descriptor,
    });
}

function installMemoryStorage(storage = new MemoryStorage()): MemoryStorage {
    overrideLocalStorage({ value: storage });

    return storage;
}

function removeAmbientLocalStorageForTest(): void {
    if (!localStorageOverrideActive) {
        previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
        localStorageOverrideActive = true;
    }

    delete (globalThis as { localStorage?: Storage }).localStorage;
}

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    overrideLocalStorage({
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by GameWorldState Story/Hub writes');
        },
    });

    try {
        return callback();
    } finally {
        restoreLocalStorage();
    }
}

function restoreLocalStorage(): void {
    if (!localStorageOverrideActive) {
        return;
    }

    if (previousLocalStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousLocalStorageDescriptor);
    } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
    }

    previousLocalStorageDescriptor = undefined;
    localStorageOverrideActive = false;
}

function createSeedSources(): {
    worldState: ExpeditionWorldStateSeed;
    starterDeck: StarterDeckSeed;
} {
    return {
        worldState: structuredClone(initialWorldState) as unknown as ExpeditionWorldStateSeed,
        starterDeck: structuredClone(starterDeckJson) as unknown as StarterDeckSeed,
    };
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

function createStoryHubSessionDocument(nodeId = 'sect_entry_005_injected'): StoryHubSessionDocument {
    const storySession = {
        hubId: 'hub.qingyun-town',
        actionId: 'action.start-qingyun-entry-story',
        storyGraphFile: 'data/story/story-graph.json',
        storyState: createStoryState(nodeId),
        selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
        statusText: `Story session at ${nodeId}`,
        updatedAt: '2026-05-09T06:01:00.000Z',
    };

    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs: {
            'hub.qingyun-town': {
                hubId: 'hub.qingyun-town',
                currentLocationId: 'location.qingyun-town.teahouse',
                statusText: `Hub session for ${nodeId}`,
                updatedAt: '2026-05-09T06:00:00.000Z',
            },
        },
        stories: {
            [createStoryRuntimeSessionStorageKey(storySession)]: storySession,
        },
    };
}

describe('GameWorldStateStoryHubSessionWrite', () => {
    afterEach(() => {
        restoreLocalStorage();
        resetRunPersistenceForTests();
        resetStoryHubSessionPersistenceForTests();
    });

    it('plans from a GameWorldState view and applies through explicit storage without cross-adapter leakage', () => {
        const storage = new MemoryStorage();
        const otherStorage = new MemoryStorage();
        const storedDocument = createStoryHubSessionDocument('sect_entry_010_from_view');
        const otherDocument = createStoryHubSessionDocument('sect_entry_011_other_adapter');
        storage.setItem(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(storedDocument));
        storage.setItem('cardgame.unrelated-key', 'keep-me');
        otherStorage.setItem(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(otherDocument));

        const worldState = withThrowingAmbientLocalStorage(() => createGameWorldState({
            ...createSeedSources(),
            storage,
        }));
        const plan = planGameWorldStateStoryHubSessionWriteFromView(worldState);

        expect(plan.owner).toBe('storyHubSession');
        expect(plan.storageKey).toBe(STORY_HUB_SESSION_STORAGE_KEY);
        expect(plan.schemaVersion).toBe(STORY_HUB_SESSION_SCHEMA_VERSION);
        expect(plan.document).toEqual(storedDocument);
        expect(JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(storedDocument);

        (
            worldState.storyHubSession.document.hubs['hub.qingyun-town'] as { currentLocationId: string }
        ).currentLocationId = 'location.mutated-after-plan';
        plan.document.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ].storyState.visitedNodeIds.push('mutated-plan-node');

        expect(JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(storedDocument);

        const result = withThrowingAmbientLocalStorage(() => applyGameWorldStateStoryHubSessionPlan(plan, storage));
        const storedAfterWrite = JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null');

        expect(storedAfterWrite).toEqual(plan.document);
        expect(JSON.parse(otherStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(otherDocument);
        expect(storage.getItem('cardgame.unrelated-key')).toBe('keep-me');

        result.document.hubs['hub.qingyun-town'].currentLocationId = 'location.mutated-result';
        result.document.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ].storyState.visitedNodeIds.push('mutated-result-node');

        expect(JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(storedAfterWrite);
    });

    it('plans through explicit storage without writing until the apply step', () => {
        const storage = new MemoryStorage();
        const storedDocument = createStoryHubSessionDocument('sect_entry_012_explicit_storage');
        storage.setItem(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(storedDocument));
        const rawBeforePlan = storage.getItem(STORY_HUB_SESSION_STORAGE_KEY);

        const plan = withThrowingAmbientLocalStorage(() => planGameWorldStateStoryHubSessionWrite({
            ...createSeedSources(),
            storage,
        }));

        expect(plan.document).toEqual(storedDocument);
        expect(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBe(rawBeforePlan);

        plan.document.hubs['hub.qingyun-town'].statusText = 'planned write mutation';

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStateStoryHubSessionPlan(plan, storage));

        expect(JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(plan.document);
        expect(result).toEqual(plan);
    });

    it('plans and applies a from-document write while preserving schema version, storage key, and session identity', () => {
        const storage = new MemoryStorage();
        const directStorage = new MemoryStorage();
        const document = createStoryHubSessionDocument('sect_entry_013_from_document');
        const plan = planGameWorldStateStoryHubSessionWriteFromDocument({ document });

        document.hubs['hub.qingyun-town'].currentLocationId = 'location.mutated-input';
        document.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ].storyState.visitedNodeIds.push('mutated-input-node');

        expect(plan.storageKey).toBe(STORY_HUB_SESSION_STORAGE_KEY);
        expect(plan.schemaVersion).toBe(1);
        expect(plan.document.schemaVersion).toBe(STORY_HUB_SESSION_SCHEMA_VERSION);
        expect(plan.document.hubs['hub.qingyun-town'].currentLocationId)
            .toBe('location.qingyun-town.teahouse');
        expect(Object.keys(plan.document.stories)).toEqual([
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json',
        ]);

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStateStoryHubSessionPlan(plan, storage));
        const storedDocument = JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null');

        expect(storedDocument).toEqual(plan.document);
        expect(result.document).toEqual(plan.document);

        result.document.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ].selectedChoiceIds.push('mutated-result-choice');

        expect(JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(storedDocument);

        const directResult = withThrowingAmbientLocalStorage(() => writeGameWorldStateStoryHubSessionDocument({
            document: plan.document,
            storage: directStorage,
        }));

        expect(directResult.document).toEqual(plan.document);
        expect(JSON.parse(directStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(plan.document);
    });

    it('uses the accepted write boundary for default-fallback Hub save, Story save, and Story clear without changing key or JSON shape', () => {
        const ambientStorage = installMemoryStorage();
        const storyKey = {
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        };

        const hubWrite = writeGameWorldStateHubSessionSnapshotWithFallbackStorage({
            snapshot: {
                hubId: 'hub.qingyun-town',
                currentLocationId: 'location.qingyun-town.teahouse',
                statusText: '默认 fallback Hub session',
                updatedAt: '2026-05-09T09:00:00.000Z',
            },
        });
        const storyWrite = writeGameWorldStateStoryRuntimeSessionWithFallbackStorage({
            snapshot: {
                ...storyKey,
                storyState: createStoryState('sect_entry_018_runtime_save'),
                selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
                statusText: '默认 fallback Story session',
                updatedAt: '2026-05-09T09:01:00.000Z',
            },
        });

        expect(hubWrite.owner).toBe('storyHubSession');
        expect(storyWrite.storageKey).toBe(STORY_HUB_SESSION_STORAGE_KEY);
        expect(ambientStorage.length).toBe(1);
        expect(ambientStorage.key(0)).toBe(STORY_HUB_SESSION_STORAGE_KEY);
        expect(JSON.parse(ambientStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {
                'hub.qingyun-town': {
                    hubId: 'hub.qingyun-town',
                    currentLocationId: 'location.qingyun-town.teahouse',
                    statusText: '默认 fallback Hub session',
                    updatedAt: '2026-05-09T09:00:00.000Z',
                },
            },
            stories: {
                [createStoryRuntimeSessionStorageKey(storyKey)]: {
                    ...storyKey,
                    storyState: createStoryState('sect_entry_018_runtime_save'),
                    selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
                    statusText: '默认 fallback Story session',
                    updatedAt: '2026-05-09T09:01:00.000Z',
                },
            },
        });

        const clearResult = clearGameWorldStateStoryRuntimeSessionWithFallbackStorage({
            key: storyKey,
        });

        expect(clearResult.document).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {
                'hub.qingyun-town': {
                    hubId: 'hub.qingyun-town',
                    currentLocationId: 'location.qingyun-town.teahouse',
                    statusText: '默认 fallback Hub session',
                    updatedAt: '2026-05-09T09:00:00.000Z',
                },
            },
            stories: {},
        });
        expect(loadStoryRuntimeSession(storyKey)).toBeNull();
        expect(loadHubSessionSnapshot('hub.qingyun-town')?.currentLocationId)
            .toBe('location.qingyun-town.teahouse');
        expect(ambientStorage.length).toBe(1);
        expect(ambientStorage.key(0)).toBe(STORY_HUB_SESSION_STORAGE_KEY);
    });

    it('keeps the no-localStorage memory fallback on the boundary-backed runtime helpers', () => {
        removeAmbientLocalStorageForTest();
        resetStoryHubSessionPersistenceForTests();

        writeGameWorldStateHubSessionSnapshotWithFallbackStorage({
            snapshot: {
                hubId: 'hub.memory-town',
                currentLocationId: 'location.memory-town.gate',
                updatedAt: '2026-05-09T10:00:00.000Z',
            },
        });

        expect(loadHubSessionSnapshot('hub.memory-town')).toEqual({
            hubId: 'hub.memory-town',
            currentLocationId: 'location.memory-town.gate',
            updatedAt: '2026-05-09T10:00:00.000Z',
        });
    });

    it('can persist a Story/Battle round-trip result snapshot through the Story/Hub write boundary', () => {
        const storage = new MemoryStorage();
        const hubSession = {
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        };
        const document = createStoryHubSessionDocument('sect_entry_019_before_battle');
        const sessionKey = createStoryRuntimeSessionStorageKey(hubSession);
        document.stories[sessionKey] = {
            ...document.stories[sessionKey],
            ...hubSession,
            storyState: createStoryState('sect_entry_020_after_battle'),
            selectedChoiceIds: [
                'sect_entry_001_choice_help_girl',
                'sect_entry_004_choice_trial_bell',
            ],
            statusText: '战斗胜利，剧情已回到：钟鸣之后',
            updatedAt: '2026-05-09T10:03:00.000Z',
        };

        const result = writeGameWorldStateStoryRuntimeSessionWithFallbackStorage({
            storage,
            snapshot: document.stories[sessionKey],
        });

        expect(result.document.stories[sessionKey].storyState.currentNodeId)
            .toBe('sect_entry_020_after_battle');
        expect(JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {
                [sessionKey]: document.stories[sessionKey],
            },
        });
    });

    it('rejects incompatible compatibility metadata before writing', () => {
        const storage = new MemoryStorage();
        const storedDocument = createStoryHubSessionDocument('sect_entry_014_compatibility');
        storage.setItem(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(storedDocument));
        const worldState = createGameWorldState({
            ...createSeedSources(),
            storage,
        });

        (
            worldState.storyHubSession.compatibility as { storageKey: string }
        ).storageKey = 'cardgame.story-hub-session.v2';

        expect(() => planGameWorldStateStoryHubSessionWriteFromView(worldState)).toThrow(
            'GameWorldState storyHubSession write attempted to use an incompatible storage boundary.',
        );
        expect(JSON.parse(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual(storedDocument);
    });

    it('rejects malformed documents, malformed plans, and missing explicit storage adapters', () => {
        const storage = new MemoryStorage();
        const validDocument = createStoryHubSessionDocument('sect_entry_015_validation');
        const mismatchedHubDocument = createStoryHubSessionDocument('sect_entry_016_bad_hub');
        const mismatchedStoryDocument = createStoryHubSessionDocument('sect_entry_017_bad_story');
        const malformedStorage = {
            getItem: storage.getItem.bind(storage),
            setItem: storage.setItem.bind(storage),
        } as unknown as StoryHubSessionStorageAdapter;

        mismatchedHubDocument.hubs['hub.mismatched'] = mismatchedHubDocument.hubs['hub.qingyun-town'];
        delete mismatchedHubDocument.hubs['hub.qingyun-town'];
        mismatchedStoryDocument.stories['wrong-session-key'] = mismatchedStoryDocument.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ];
        delete mismatchedStoryDocument.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ];

        expect(() => planGameWorldStateStoryHubSessionWriteFromDocument({
            document: {
                ...validDocument,
                schemaVersion: 0 as typeof STORY_HUB_SESSION_SCHEMA_VERSION,
            },
        })).toThrow(
            'Invalid StoryHubSessionDocument: expected schemaVersion 1 with matching Hub and Story session identities.',
        );
        expect(() => planGameWorldStateStoryHubSessionWriteFromDocument({
            document: mismatchedHubDocument,
        })).toThrow(
            'Invalid StoryHubSessionDocument: expected schemaVersion 1 with matching Hub and Story session identities.',
        );
        expect(() => planGameWorldStateStoryHubSessionWriteFromDocument({
            document: mismatchedStoryDocument,
        })).toThrow(
            'Invalid StoryHubSessionDocument: expected schemaVersion 1 with matching Hub and Story session identities.',
        );

        const plan = planGameWorldStateStoryHubSessionWriteFromDocument({ document: validDocument });

        expect(() => writeGameWorldStateStoryHubSessionPlan(
            {
                ...plan,
                storageKey: 'cardgame.story-hub-session.v2' as typeof STORY_HUB_SESSION_STORAGE_KEY,
            },
            storage,
        )).toThrow('GameWorldState storyHubSession write plan uses an incompatible storage key.');
        expect(() => writeGameWorldStateStoryHubSessionPlan(plan, malformedStorage)).toThrow(
            'GameWorldState storyHubSession write requires an explicit storage adapter with getItem, setItem, and removeItem.',
        );
        expect(() => planGameWorldStateStoryHubSessionWrite({
            ...createSeedSources(),
            storage: undefined as unknown as StoryHubSessionStorageAdapter,
        })).toThrow(
            'GameWorldState storyHubSession write requires an explicit storage adapter with getItem, setItem, and removeItem.',
        );
        expect(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBeNull();
    });
});
