import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { StoryState } from '../types/story';
import {
    clearStoryRuntimeSession,
    createStoryRuntimeSessionStorageKey,
    loadHubSessionSnapshot,
    loadStoryRuntimeSession,
    resetStoryHubSessionPersistenceForTests,
    saveHubSessionSnapshot,
    saveStoryRuntimeSession,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
    writeRawStoryHubSessionForTests,
} from './StoryHubSessionPersistence';

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

function installThrowingAmbientLocalStorage(message: string): void {
    overrideLocalStorage({
        get(): Storage {
            throw new Error(message);
        },
    });
}

function removeAmbientLocalStorageForTest(): void {
    if (!localStorageOverrideActive) {
        previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
        localStorageOverrideActive = true;
    }

    delete (globalThis as { localStorage?: Storage }).localStorage;
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

describe('StoryHubSessionPersistence', () => {
    beforeEach(() => {
        resetStoryHubSessionPersistenceForTests();
    });

    afterEach(() => {
        restoreLocalStorage();
        resetStoryHubSessionPersistenceForTests();
    });

    it('saves and loads versioned Hub location and per-action Story runtime snapshots without sharing mutable references', () => {
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });

        const storyState = createStoryState();
        const selectedChoiceIds = ['sect_entry_001_choice_help_girl'];
        saveStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState,
            selectedChoiceIds,
            statusText: '已选择：注意到队伍中有一名体弱少女，主动上前搭话。',
            updatedAt: '2026-05-09T06:01:00.000Z',
        });

        const loadedHub = loadHubSessionSnapshot('hub.qingyun-town');
        const loadedStory = loadStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });

        expect(loadedHub).toEqual({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });
        expect(loadedStory).toEqual({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState,
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: '已选择：注意到队伍中有一名体弱少女，主动上前搭话。',
            updatedAt: '2026-05-09T06:01:00.000Z',
        });
        expect(loadedStory?.storyState).not.toBe(storyState);
        expect(loadedStory?.selectedChoiceIds).not.toBe(selectedChoiceIds);
    });

    it('falls back to an empty session document when stored JSON is corrupt or the schema version is stale', () => {
        writeRawStoryHubSessionForTests('{not valid json');

        expect(loadHubSessionSnapshot('hub.qingyun-town')).toBeNull();
        expect(loadStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        })).toBeNull();

        writeRawStoryHubSessionForTests(JSON.stringify({ schemaVersion: 0, hubs: {}, stories: {} }));

        expect(loadHubSessionSnapshot('hub.qingyun-town')).toBeNull();
    });

    it('clears one saved story runtime session so restart can reset progress without wiping Hub location', () => {
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });
        saveStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState: createStoryState('sect_entry_004_trial_bell'),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl', 'sect_entry_003_choice_trial_bell'],
            updatedAt: '2026-05-09T06:02:00.000Z',
        });

        clearStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });

        expect(loadStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        })).toBeNull();
        expect(loadHubSessionSnapshot('hub.qingyun-town')?.currentLocationId).toBe('location.qingyun-town.teahouse');
    });

    it('writes, reads, and clears Story/Hub sessions through an injected adapter without touching ambient localStorage', () => {
        const injectedStorage = new MemoryStorage();
        const otherStorage = new MemoryStorage();
        const storyKey = {
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        };
        const otherStoryKey = {
            hubId: 'hub.qingyun-town',
            actionId: 'action.revisit-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        };
        installThrowingAmbientLocalStorage('ambient localStorage must not be used by injected Story/Hub sessions');

        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '注入式 Hub session',
            updatedAt: '2026-05-09T06:00:00.000Z',
        }, injectedStorage);
        saveStoryRuntimeSession({
            ...storyKey,
            storyState: createStoryState('sect_entry_004_injected_storage'),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: '注入式 Story session',
            updatedAt: '2026-05-09T06:01:00.000Z',
        }, injectedStorage);
        saveStoryRuntimeSession({
            ...otherStoryKey,
            storyState: createStoryState('sect_entry_005_second_injected_storage'),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl', 'sect_entry_005_choice_wait'],
            updatedAt: '2026-05-09T06:02:00.000Z',
        }, injectedStorage);
        saveHubSessionSnapshot({
            hubId: 'hub.other-town',
            currentLocationId: 'location.other-town.gate',
            updatedAt: '2026-05-09T07:00:00.000Z',
        }, otherStorage);

        clearStoryRuntimeSession(storyKey, injectedStorage);

        expect(loadHubSessionSnapshot('hub.qingyun-town', injectedStorage)).toEqual({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '注入式 Hub session',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });
        expect(loadStoryRuntimeSession(storyKey, injectedStorage)).toBeNull();
        expect(loadStoryRuntimeSession(otherStoryKey, injectedStorage)?.storyState.currentNodeId)
            .toBe('sect_entry_005_second_injected_storage');
        expect(loadHubSessionSnapshot('hub.qingyun-town', otherStorage)).toBeNull();
        expect(loadHubSessionSnapshot('hub.other-town', otherStorage)?.currentLocationId)
            .toBe('location.other-town.gate');

        const storedDocument = JSON.parse(injectedStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null');
        expect(storedDocument).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {
                'hub.qingyun-town': {
                    hubId: 'hub.qingyun-town',
                    currentLocationId: 'location.qingyun-town.teahouse',
                    statusText: '注入式 Hub session',
                    updatedAt: '2026-05-09T06:00:00.000Z',
                },
            },
            stories: {
                [createStoryRuntimeSessionStorageKey(otherStoryKey)]: {
                    ...otherStoryKey,
                    storyState: createStoryState('sect_entry_005_second_injected_storage'),
                    selectedChoiceIds: ['sect_entry_001_choice_help_girl', 'sect_entry_005_choice_wait'],
                    updatedAt: '2026-05-09T06:02:00.000Z',
                },
            },
        });
    });

    it('cleans corrupt and stale injected documents on read without leaking cleanup to another adapter', () => {
        const corruptStorage = new MemoryStorage();
        const staleStorage = new MemoryStorage();
        const healthyStorage = new MemoryStorage();
        installThrowingAmbientLocalStorage('ambient localStorage must not be used by injected Story/Hub cleanup');
        writeRawStoryHubSessionForTests('{not valid json', corruptStorage);
        writeRawStoryHubSessionForTests(JSON.stringify({
            schemaVersion: 0,
            hubs: {},
            stories: {},
        }), staleStorage);
        saveHubSessionSnapshot({
            hubId: 'hub.healthy',
            currentLocationId: 'location.healthy',
            updatedAt: '2026-05-09T08:00:00.000Z',
        }, healthyStorage);

        expect(loadHubSessionSnapshot('hub.qingyun-town', corruptStorage)).toBeNull();
        expect(loadHubSessionSnapshot('hub.qingyun-town', staleStorage)).toBeNull();

        expect(corruptStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBeNull();
        expect(staleStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBeNull();
        expect(loadHubSessionSnapshot('hub.healthy', healthyStorage)?.currentLocationId).toBe('location.healthy');
        expect(healthyStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).not.toBeNull();
    });

    it('keeps default Story/Hub localStorage behavior when no adapter is injected', () => {
        const ambientStorage = installMemoryStorage();

        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.market',
            updatedAt: '2026-05-09T09:00:00.000Z',
        });

        expect(JSON.parse(ambientStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY) ?? 'null')).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {
                'hub.qingyun-town': {
                    hubId: 'hub.qingyun-town',
                    currentLocationId: 'location.qingyun-town.market',
                    updatedAt: '2026-05-09T09:00:00.000Z',
                },
            },
            stories: {},
        });
        expect(loadHubSessionSnapshot('hub.qingyun-town')?.currentLocationId)
            .toBe('location.qingyun-town.market');
    });

    it('keeps default Story/Hub memory fallback when localStorage is unavailable', () => {
        removeAmbientLocalStorageForTest();
        resetStoryHubSessionPersistenceForTests();

        saveHubSessionSnapshot({
            hubId: 'hub.memory-town',
            currentLocationId: 'location.memory-town.gate',
            updatedAt: '2026-05-09T10:00:00.000Z',
        });

        expect(loadHubSessionSnapshot('hub.memory-town')).toEqual({
            hubId: 'hub.memory-town',
            currentLocationId: 'location.memory-town.gate',
            updatedAt: '2026-05-09T10:00:00.000Z',
        });
    });
});
