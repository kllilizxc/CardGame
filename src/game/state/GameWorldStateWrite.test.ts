import { afterEach, describe, expect, it } from 'bun:test';

import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import initialWorldState from '../../../public/data/world/initial-state.json';

import { SAVE_COMPATIBILITY_REGISTRY } from '../services/SaveCompatibility';
import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    loadActiveRun,
    resetRunPersistenceForTests,
    STASH_STORAGE_KEY,
} from '../services/RunPersistence';
import {
    RUN_RESOLUTION_BOUNDARY_MODULE,
    RUN_RESOLUTION_TERMINAL_OUTCOMES,
} from '../services/RunResolution';
import {
    createStoryRuntimeSessionStorageKey,
    resetStoryHubSessionPersistenceForTests,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
    type StoryHubSessionDocument,
} from '../services/StoryHubSessionPersistence';
import type { PersistentStash, RunSnapshot } from '../types/expedition';
import type { StoryState } from '../types/story';
import { createGameWorldState } from './GameWorldState';
import {
    applyGameWorldStateWritePlan,
    GAME_WORLD_STATE_WRITE_SLICE_ORDER,
    planGameWorldStateWrite,
    planGameWorldStateWriteFromDocuments,
    planGameWorldStateWriteFromView,
    writeGameWorldStateFromDocuments,
} from './GameWorldStateWrite';
import {
    createItemStack,
    createRunSnapshot,
    OTHER_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const OTHER_TARGET = OTHER_EXPEDITION_TARGET;

const LEGACY_ROUTE_LOOKUP = 'worldMap:destination.synthetic-trial';
const LEGACY_ROUTE_STORAGE_KEY = `${ACTIVE_RUN_STORAGE_KEY}:${LEGACY_ROUTE_LOOKUP}`;

type StorageCall =
    | readonly ['getItem', string]
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
        this.calls.push(['getItem', key]);
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

    clearCalls(): void {
        this.calls.length = 0;
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

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    overrideLocalStorage({
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by aggregate GameWorldState writes');
        },
    });

    try {
        return callback();
    } finally {
        restoreLocalStorage();
    }
}

function createSeedSources() {
    return {
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
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

function createStoryHubSessionDocument(nodeId = 'sect_entry_010_aggregate_write'): StoryHubSessionDocument {
    const storySession = {
        hubId: 'hub.qingyun-town',
        actionId: 'action.start-qingyun-entry-story',
        storyGraphFile: 'data/story/story-graph.json',
        storyState: createStoryState(nodeId),
        selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
        statusText: `Aggregate Story session at ${nodeId}`,
        updatedAt: '2026-05-10T01:01:00.000Z',
    };

    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs: {
            'hub.qingyun-town': {
                hubId: 'hub.qingyun-town',
                currentLocationId: 'location.qingyun-town.teahouse',
                statusText: `Aggregate Hub session for ${nodeId}`,
                updatedAt: '2026-05-10T01:00:00.000Z',
            },
        },
        stories: {
            [createStoryRuntimeSessionStorageKey(storySession)]: storySession,
        },
    };
}

function createPersistentStash(): PersistentStash {
    return {
        stashId: 'aggregate-stash',
        deckRef: 'aggregate-deck',
        deck: [
            { id: 'AR_001', count: 4 },
            { id: 'TL_002', count: 1 },
        ],
        items: [
            createItemStack('tool.return-rope', 'tool', 2),
        ],
        spiritStones: 108,
        lastRunSummary: {
            runId: 'run-finished',
            outcome: 'extract',
            finalNodeId: 'extract.synthetic',
            kept: {
                cards: [{ id: 'TL_002', count: 1 }],
                items: [],
                spiritStones: 18,
            },
            lost: {
                cards: [],
                items: [],
                spiritStones: 0,
            },
            endedAt: '2026-05-10T01:30:00.000Z',
        },
    };
}

function createActiveRun(
    targetIdentity = SYNTHETIC_TARGET,
    runId = 'run-aggregate-active',
    currentNodeId = 'event.synthetic-cache',
): RunSnapshot {
    return createRunSnapshot(targetIdentity, {
        runId,
        currentNodeId,
        startingLoadout: {
            cards: [{ id: 'AR_001', count: 3 }],
            items: [createItemStack('tool.return-rope', 'tool', 1)],
            spiritStones: 36,
        },
        carriedDeck: [
            { id: 'AR_001', count: 3 },
            { id: 'TL_002', count: 1 },
        ],
        carriedItems: [createItemStack('tool.return-rope', 'tool', 1)],
        spiritStones: 54,
        visitedNodeIds: ['entrance.synthetic', currentNodeId],
        nodeStates: {
            'entrance.synthetic': {
                nodeId: 'entrance.synthetic',
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
            [currentNodeId]: {
                nodeId: currentNodeId,
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
        },
        startedAt: '2026-05-10T00:00:00.000Z',
    }) satisfies RunSnapshot;
}

function readJson<T>(storage: Storage, key: string): T | null {
    const rawValue = storage.getItem(key);

    return rawValue ? JSON.parse(rawValue) as T : null;
}

function setCalls(storage: RecordingStorage): StorageCall[] {
    return storage.calls.filter((call) => call[0] === 'setItem');
}

describe('GameWorldStateWrite', () => {
    afterEach(() => {
        restoreLocalStorage();
        resetRunPersistenceForTests();
        resetStoryHubSessionPersistenceForTests();
    });

    it('plans and applies Story/Hub, stash, and specified-route active-run saves in deterministic order without ambient localStorage', () => {
        const targetStorage = new RecordingStorage();
        const storyHubSession = createStoryHubSessionDocument();
        const persistentStash = createPersistentStash();
        const activeRun = {
            ...createActiveRun(SYNTHETIC_TARGET, 'run-save-specified-route'),
            routeKey: LEGACY_ROUTE_LOOKUP,
        };
        targetStorage.seed('unrelated.key', 'keep-me');
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(activeRun));
        targetStorage.seed(LEGACY_ROUTE_STORAGE_KEY, JSON.stringify(activeRun));

        const plan = withThrowingAmbientLocalStorage(() => planGameWorldStateWriteFromDocuments({
            storyHubSession,
            persistentStash,
            activeRun,
            activeRunLookup: LEGACY_ROUTE_LOOKUP,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(plan.owner).toBe('gameWorldState');
        expect(plan.sliceOrder).toEqual(GAME_WORLD_STATE_WRITE_SLICE_ORDER);
        expect(plan.slices.map((slice) => [slice.owner, slice.operation])).toEqual([
            ['storyHubSession', 'save'],
            ['persistentStash', 'save'],
            ['activeRun', 'save'],
        ]);
        expect(plan.slices[0].compatibility.storageKey).toBe(STORY_HUB_SESSION_STORAGE_KEY);
        expect(plan.slices[1].compatibility.storageKey).toBe(STASH_STORAGE_KEY);
        expect(plan.slices[2].compatibility.canonicalStorageKeyPrefix).toBe('cardgame.active-run.v1:');
        expect(plan.slices[2].keys).toMatchObject({
            routeKey: createActiveRunRouteKey(SYNTHETIC_TARGET),
            canonicalStorageKey: createActiveRunStorageKey(SYNTHETIC_TARGET),
            legacyRouteStorageKeys: [LEGACY_ROUTE_STORAGE_KEY],
        });
        expect(plan.runResolution).toEqual({
            boundaryModule: RUN_RESOLUTION_BOUNDARY_MODULE,
            terminalOutcomes: RUN_RESOLUTION_TERMINAL_OUTCOMES,
        });

        storyHubSession.hubs['hub.qingyun-town'].currentLocationId = 'location.mutated-input';
        persistentStash.deck[0].count = 999;
        activeRun.carriedDeck[0].count = 888;

        expect(plan.slices[0].plan.document.hubs['hub.qingyun-town'].currentLocationId)
            .toBe('location.qingyun-town.teahouse');
        if (plan.slices[1].operation !== 'save' || plan.slices[2].plan.operation !== 'save') {
            throw new Error('Expected save plans for aggregate clone assertions.');
        }
        expect(plan.slices[1].plan.document.deck[0].count).toBe(4);
        expect(plan.slices[2].plan.document.carriedDeck[0].count).toBe(3);

        targetStorage.clearCalls();
        const result = withThrowingAmbientLocalStorage(() => applyGameWorldStateWritePlan(plan, targetStorage));
        const setItemCalls = setCalls(targetStorage);

        expect(setItemCalls.map((call) => call[1])).toEqual([
            STORY_HUB_SESSION_STORAGE_KEY,
            STASH_STORAGE_KEY,
            createActiveRunStorageKey(SYNTHETIC_TARGET),
        ]);
        expect(readJson<StoryHubSessionDocument>(targetStorage, STORY_HUB_SESSION_STORAGE_KEY))
            .toEqual(plan.slices[0].plan.document);
        expect(readJson<PersistentStash>(targetStorage, STASH_STORAGE_KEY))
            .toEqual(plan.slices[1].plan.document);
        expect(readJson<RunSnapshot>(targetStorage, createActiveRunStorageKey(SYNTHETIC_TARGET)))
            .toEqual(plan.slices[2].plan.document);
        expect(targetStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(targetStorage.getItem(LEGACY_ROUTE_STORAGE_KEY)).toBeNull();
        expect(targetStorage.getItem('unrelated.key')).toBe('keep-me');
        expect(result.status).toBe('success');

        result.slices[0].result.document.hubs['hub.qingyun-town'].currentLocationId = 'location.mutated-result';
        if (result.slices[1].operation !== 'save' || result.slices[2].result.operation !== 'save') {
            throw new Error('Expected save results for aggregate clone assertions.');
        }
        result.slices[1].result.document.deck[0].count = 777;
        result.slices[2].result.document.carriedDeck[0].count = 666;

        expect(readJson<StoryHubSessionDocument>(targetStorage, STORY_HUB_SESSION_STORAGE_KEY))
            .toEqual(plan.slices[0].plan.document);
        expect(readJson<PersistentStash>(targetStorage, STASH_STORAGE_KEY))
            .toEqual(plan.slices[1].plan.document);
        expect(readJson<RunSnapshot>(targetStorage, createActiveRunStorageKey(SYNTHETIC_TARGET)))
            .toEqual(plan.slices[2].plan.document);
    });

    it('supports nullable persistent-stash documents and specified-route active-run clear when localStorage is absent', () => {
        const targetStorage = new RecordingStorage();
        const storyHubSession = createStoryHubSessionDocument('sect_entry_020_clear_route');
        const syntheticRun = createActiveRun(SYNTHETIC_TARGET, 'run-clear-synthetic');
        const otherRun = createActiveRun(OTHER_TARGET, 'run-keep-other', 'event.other');
        targetStorage.seed(STASH_STORAGE_KEY, JSON.stringify(createPersistentStash()));
        targetStorage.seed(createActiveRunStorageKey(SYNTHETIC_TARGET), JSON.stringify(syntheticRun));
        targetStorage.seed(createActiveRunStorageKey(OTHER_TARGET), JSON.stringify(otherRun));
        targetStorage.seed(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(otherRun));
        targetStorage.seed('unrelated.key', 'keep-me');

        const plan = planGameWorldStateWriteFromDocuments({
            storyHubSession,
            persistentStash: null,
            activeRun: null,
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        expect(plan.slices.map((slice) => [slice.owner, slice.operation])).toEqual([
            ['storyHubSession', 'save'],
            ['persistentStash', 'clear'],
            ['activeRun', 'clear'],
        ]);
        if (plan.slices[1].operation !== 'clear' || plan.slices[2].plan.operation !== 'clear') {
            throw new Error('Expected clear plans for nullable stash and active-run clear.');
        }
        expect(plan.slices[1].plan).toEqual({
            operation: 'clear',
            storageKey: STASH_STORAGE_KEY,
            document: null,
            reason: 'document-null',
        });
        expect(plan.slices[2].plan.canonicalStorageKey).toBe(createActiveRunStorageKey(SYNTHETIC_TARGET));

        targetStorage.clearCalls();
        removeAmbientLocalStorageForTest();
        const result = applyGameWorldStateWritePlan(plan, targetStorage);

        expect(result.slices.map((slice) => [slice.owner, slice.operation])).toEqual([
            ['storyHubSession', 'save'],
            ['persistentStash', 'clear'],
            ['activeRun', 'clear'],
        ]);
        expect(targetStorage.calls.filter((call) => call[0] !== 'getItem')).toEqual([
            ['setItem', STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(plan.slices[0].plan.document)],
            ['removeItem', STASH_STORAGE_KEY],
            ['removeItem', createActiveRunStorageKey(SYNTHETIC_TARGET)],
        ]);
        expect(targetStorage.getItem(STASH_STORAGE_KEY)).toBeNull();
        expect(targetStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBeNull();
        expect(readJson<RunSnapshot>(targetStorage, createActiveRunStorageKey(OTHER_TARGET))).toEqual(otherRun);
        expect(readJson<RunSnapshot>(targetStorage, ACTIVE_RUN_STORAGE_KEY)).toEqual(otherRun);
        expect(targetStorage.getItem('unrelated.key')).toBe('keep-me');
    });

    it('rejects missing explicit storage and incompatible aggregate metadata before writes', () => {
        const targetStorage = new RecordingStorage();
        const plan = planGameWorldStateWriteFromDocuments({
            storyHubSession: createStoryHubSessionDocument('sect_entry_025_reject_metadata'),
            persistentStash: createPersistentStash(),
            activeRun: createActiveRun(SYNTHETIC_TARGET, 'run-reject-metadata'),
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        expect(() => withThrowingAmbientLocalStorage(() => applyGameWorldStateWritePlan(
            plan,
            undefined as unknown as Parameters<typeof applyGameWorldStateWritePlan>[1],
        ))).toThrow('GameWorldState write requires an explicit storage adapter');

        const incompatiblePlan = structuredClone(plan);
        (incompatiblePlan.slices[0].compatibility as { storageKey: string }).storageKey =
            'cardgame.story-hub-session.v999';

        expect(() => applyGameWorldStateWritePlan(incompatiblePlan, targetStorage))
            .toThrow('GameWorldState write attempted to use incompatible storyHubSession compatibility metadata.');
        expect(targetStorage.calls).toEqual([]);
    });

    it('plans from GameWorldState with explicit storage and clones compatibility metadata before applying', () => {
        const storage = new RecordingStorage();
        const storyHubSession = createStoryHubSessionDocument('sect_entry_030_from_view');
        const persistentStash = createPersistentStash();
        const activeRun = createActiveRun(SYNTHETIC_TARGET, 'run-from-view');
        storage.seed(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(storyHubSession));
        storage.seed(STASH_STORAGE_KEY, JSON.stringify(persistentStash));
        storage.seed(createActiveRunStorageKey(SYNTHETIC_TARGET), JSON.stringify(activeRun));

        const worldState = withThrowingAmbientLocalStorage(() => createGameWorldState({
            ...createSeedSources(),
            storage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));
        const fromViewPlan = withThrowingAmbientLocalStorage(() => planGameWorldStateWriteFromView(worldState));
        const fromStoragePlan = withThrowingAmbientLocalStorage(() => planGameWorldStateWrite({
            ...createSeedSources(),
            storage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(fromStoragePlan).toEqual(fromViewPlan);
        expect(fromViewPlan.slices[0].compatibility).toEqual(SAVE_COMPATIBILITY_REGISTRY.storyHubSession);
        expect(fromViewPlan.slices[1].compatibility).toEqual(SAVE_COMPATIBILITY_REGISTRY.persistentStash);
        expect(fromViewPlan.slices[2].compatibility).toEqual(SAVE_COMPATIBILITY_REGISTRY.activeRun);
        expect(fromViewPlan.runResolution).toEqual({
            boundaryModule: RUN_RESOLUTION_BOUNDARY_MODULE,
            terminalOutcomes: RUN_RESOLUTION_TERMINAL_OUTCOMES,
        });

        (worldState.storyHubSession.compatibility as { storageKey: string }).storageKey = 'mutated-story-key';
        (worldState.persistentStash.compatibility as { storageKey: string }).storageKey = 'mutated-stash-key';
        (worldState.activeRun.compatibility as { canonicalStorageKeyPrefix: string }).canonicalStorageKeyPrefix = 'mutated:';
        (worldState.runResolution.terminalOutcomes as string[]).push('mutated-outcome');
        (fromViewPlan.slices[0].compatibility as { storageKey: string }).storageKey = 'mutated-plan-key';

        expect(SAVE_COMPATIBILITY_REGISTRY.storyHubSession.storageKey).toBe(STORY_HUB_SESSION_STORAGE_KEY);
        expect(fromStoragePlan.slices[0].compatibility.storageKey).toBe(STORY_HUB_SESSION_STORAGE_KEY);
        expect(fromStoragePlan.slices[1].compatibility.storageKey).toBe(STASH_STORAGE_KEY);
        expect(fromStoragePlan.slices[2].compatibility.canonicalStorageKeyPrefix).toBe('cardgame.active-run.v1:');
        expect(fromStoragePlan.runResolution.terminalOutcomes).toEqual(RUN_RESOLUTION_TERMINAL_OUTCOMES);
    });

    it('writes document inputs through the aggregate facade without changing current JSON shapes or route ownership', () => {
        const storage = new RecordingStorage();
        const storyHubSession = createStoryHubSessionDocument('sect_entry_040_direct_write');
        const persistentStash = createPersistentStash();
        const activeRun = createActiveRun(SYNTHETIC_TARGET, 'run-direct-write');
        const otherRun = createActiveRun(OTHER_TARGET, 'run-direct-other', 'event.other');
        storage.seed(createActiveRunStorageKey(OTHER_TARGET), JSON.stringify(otherRun));

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStateFromDocuments({
            storage,
            storyHubSession,
            persistentStash,
            activeRun,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(result.status).toBe('success');
        expect(Object.keys(readJson<StoryHubSessionDocument>(storage, STORY_HUB_SESSION_STORAGE_KEY) ?? {}).sort())
            .toEqual(['hubs', 'schemaVersion', 'stories']);
        expect(Object.keys(readJson<PersistentStash>(storage, STASH_STORAGE_KEY) ?? {}).sort()).toEqual([
            'deck',
            'deckRef',
            'items',
            'lastRunSummary',
            'spiritStones',
            'stashId',
        ]);
        expect(Object.keys(readJson<RunSnapshot>(storage, createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? {}).sort())
            .toEqual([
                'carriedDeck',
                'carriedItems',
                'currentNodeId',
                'expeditionId',
                'mapId',
                'nodeStates',
                'routeKey',
                'runId',
                'spiritStones',
                'startedAt',
                'startingLoadout',
                'status',
                'visitedNodeIds',
            ]);
        expect(loadActiveRun(OTHER_TARGET, undefined, storage)).toEqual(otherRun);
        expect(storage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
    });
});
