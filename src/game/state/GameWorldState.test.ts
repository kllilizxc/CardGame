import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import initialWorldState from '../../../public/data/world/initial-state.json';

import {
    createActiveRunCompatibilityKeys,
} from '../services/SaveCompatibility';
import {
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    loadPersistentStash,
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
    saveHubSessionSnapshot,
    saveStoryRuntimeSession,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
    type StoryHubSessionDocument,
} from '../services/StoryHubSessionPersistence';
import type { RunSnapshot } from '../types/expedition';
import type { StoryState } from '../types/story';
import { ExpeditionState } from './ExpeditionState';
import { createGameWorldState } from './GameWorldState';
import { createPersistentStashFromWorldStateSeed } from './GameWorldStateSeed';
import {
    DEFAULT_EXPEDITION_TARGET,
    createItemStack,
    normalizeExpeditionWorldStateSeed,
    SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
    SYNTHETIC_EXPEDITION_TARGET,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;

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

    keys(): string[] {
        return [...this.values.keys()];
    }
}

let previousLocalStorageDescriptor: PropertyDescriptor | undefined;
let storage: MemoryStorage;

function installMemoryStorage(): void {
    previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    storage = new MemoryStorage();

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: storage,
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
            throw new Error('ambient globalThis.localStorage must not be used by GameWorldState reads');
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

function seedStoryHubSession(nodeId = 'sect_entry_003_help_girl'): void {
    saveHubSessionSnapshot({
        hubId: 'hub.qingyun-town',
        currentLocationId: 'location.qingyun-town.teahouse',
        statusText: 'GameWorldState should pass through the current Hub snapshot.',
        updatedAt: '2026-05-09T06:00:00.000Z',
    });
    saveStoryRuntimeSession({
        hubId: 'hub.qingyun-town',
        actionId: 'action.start-qingyun-entry-story',
        storyGraphFile: 'data/story/story-graph.json',
        storyState: createStoryState(nodeId),
        selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
        statusText: 'GameWorldState should pass through the current Story snapshot.',
        updatedAt: '2026-05-09T06:01:00.000Z',
    });
}

function createRunForTarget(
    targetIdentity: { expeditionId: string; mapId: string },
    entryNodeId = targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'entrance.mountain-gate' : 'entrance.synthetic',
): RunSnapshot {
    const state = ExpeditionState.bootstrap({
        worldState: normalizeExpeditionWorldStateSeed(structuredClone(initialWorldState)),
        starterDeck: structuredClone(starterDeckJson),
        targetIdentity,
    });
    const run = state.createRunSnapshot({
        ...targetIdentity,
        entryNodeId,
    });

    state.applyNodeRewardPreview({
        cards: [{ id: targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'TL_002' : 'AR_001', count: 1 }],
        items: [createItemStack('tool.synthetic-marker', 'tool', 1)],
        spiritStones: 7,
    });

    return {
        ...run,
        carriedDeck: [
            ...run.carriedDeck,
            { id: targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'TL_002' : 'AR_001', count: 1 },
        ],
        carriedItems: [
            ...run.carriedItems,
            createItemStack('tool.synthetic-marker', 'tool', 1),
        ],
        spiritStones: run.spiritStones + 7,
    };
}

function createSeedSources() {
    return {
        worldState: normalizeExpeditionWorldStateSeed(structuredClone(initialWorldState)),
        starterDeck: structuredClone(starterDeckJson),
    };
}

function createStoryHubSessionDocument(nodeId = 'sect_entry_005_injected'): StoryHubSessionDocument {
    const storySession = {
        hubId: 'hub.qingyun-town',
        actionId: 'action.start-qingyun-entry-story',
        storyGraphFile: 'data/story/story-graph.json',
        storyState: createStoryState(nodeId),
        selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
        statusText: 'Injected Story session',
        updatedAt: '2026-05-09T06:01:00.000Z',
    };

    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs: {
            'hub.qingyun-town': {
                hubId: 'hub.qingyun-town',
                currentLocationId: 'location.qingyun-town.teahouse',
                statusText: 'Injected Hub session',
                updatedAt: '2026-05-09T06:00:00.000Z',
            },
        },
        stories: {
            [createStoryRuntimeSessionStorageKey(storySession)]: storySession,
        },
    };
}

describe('GameWorldState', () => {
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

    it('projects stored stash, Story/Hub session, route active run, and run-resolution metadata into one view', () => {
        seedStoryHubSession();
        const defaultRun = createRunForTarget(DEFAULT_TARGET);
        const syntheticRun = createRunForTarget(SYNTHETIC_TARGET);
        const storageKeysBeforeRead = storage.keys().sort();
        const storedStash = loadPersistentStash();

        if (!storedStash) {
            throw new Error('Expected stored persistent stash to exist.');
        }

        const worldState = createGameWorldState({
            ...createSeedSources(),
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        expect(worldState.storyHubSession.document.hubs['hub.qingyun-town']).toMatchObject({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
        });
        expect(Object.keys(worldState.storyHubSession.document.stories)).toEqual([
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json',
        ]);
        expect(worldState.persistentStash.source).toBe('stored-stash');
        expect(worldState.persistentStash.document).toEqual(storedStash);
        expect(worldState.activeRun.identity).toEqual(SYNTHETIC_TARGET);
        expect(worldState.activeRun.keys).toEqual(createActiveRunCompatibilityKeys(undefined, SYNTHETIC_TARGET));
        expect(worldState.activeRun.document?.runId).toBe(syntheticRun.runId);
        expect(worldState.activeRun.document?.routeKey).toBe(createActiveRunRouteKey(SYNTHETIC_TARGET));
        expect(worldState.activeRun.document?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
        expect(worldState.runResolution.boundaryModule).toBe(RUN_RESOLUTION_BOUNDARY_MODULE);
        expect(worldState.runResolution.terminalOutcomes).toEqual(RUN_RESOLUTION_TERMINAL_OUTCOMES);
        expect(storage.getItem(createActiveRunStorageKey(DEFAULT_TARGET))).toContain(defaultRun.runId);
        expect(storage.keys().sort()).toEqual(storageKeysBeforeRead);
    });

    it('uses a seed-fallback stash without saving it when no persistent stash is stored', () => {
        const storageKeysBeforeRead = storage.keys().sort();

        const worldState = createGameWorldState(createSeedSources());

        expect(worldState.persistentStash.source).toBe('seed-fallback');
        expect(worldState.persistentStash.document).toEqual(createPersistentStashFromWorldStateSeed(createSeedSources()));
        expect(worldState.activeRun.identity).toEqual(DEFAULT_TARGET);
        expect(worldState.activeRun.keys).toEqual(createActiveRunCompatibilityKeys());
        expect(worldState.activeRun.document).toBeNull();
        expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
        expect(storage.keys().sort()).toEqual(storageKeysBeforeRead);
    });

    it('preserves the requested active-run identity when the selected route has no active run', () => {
        createRunForTarget(DEFAULT_TARGET);

        const worldState = createGameWorldState({
            ...createSeedSources(),
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        expect(worldState.activeRun.identity).toEqual(SYNTHETIC_TARGET);
        expect(worldState.activeRun.keys.routeKey).toBe(SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY);
        expect(worldState.activeRun.keys.canonicalStorageKey).toBe(
            createActiveRunStorageKey(SYNTHETIC_TARGET),
        );
        expect(worldState.activeRun.document).toBeNull();
    });

    it('deep-clones nested mutable documents so callers cannot mutate later reads or seed inputs', () => {
        seedStoryHubSession('sect_entry_006_clone_source');
        createRunForTarget(DEFAULT_TARGET);
        const seedSources = createSeedSources();
        const firstRead = createGameWorldState(seedSources);

        (firstRead.storyHubSession.document.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ].storyState.visitedNodeIds as string[]).push('mutated-node');
        (firstRead.persistentStash.document.deck as Array<{ id: string; count: number }>)[0].count = 999;
        (firstRead.persistentStash.document.items as Array<{ id: string; itemType: string; count: number }>)[0].count = 888;
        (firstRead.activeRun.document!.carriedDeck as Array<{ id: string; count: number }>)[0].count = 777;
        (firstRead.activeRun.keys.legacyRouteStorageKeys as string[]).push('mutated-legacy-key');
        (firstRead.runResolution.terminalOutcomes as string[]).push('mutated-outcome');

        const secondRead = createGameWorldState(seedSources);

        expect(secondRead.storyHubSession.document.stories[
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json'
        ].storyState.visitedNodeIds).not.toContain('mutated-node');
        expect(secondRead.persistentStash.document.deck[0].count).toBe(starterDeckJson.cards[0].count);
        expect(secondRead.persistentStash.document.items[0].count).toBe(initialWorldState.stash.items[0].count);
        expect(secondRead.activeRun.document?.carriedDeck[0].count).toBe(starterDeckJson.cards[0].count);
        expect(secondRead.activeRun.keys.legacyRouteStorageKeys).toEqual([]);
        expect(secondRead.runResolution.terminalOutcomes).toEqual(RUN_RESOLUTION_TERMINAL_OUTCOMES);
        expect(seedSources.starterDeck.cards[0].count).toBe(starterDeckJson.cards[0].count);
        expect(seedSources.worldState.stash?.items?.[0]?.count).toBe(initialWorldState.stash.items[0].count);
    });

    it('reads injected slices and seed fallback without touching ambient globalThis.localStorage', () => {
        const injectedStorage = new MemoryStorage();
        const run = createRunForTarget(SYNTHETIC_TARGET);
        const activeRunStorageKey = createActiveRunStorageKey(SYNTHETIC_TARGET);
        injectedStorage.setItem(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(createStoryHubSessionDocument()));
        injectedStorage.setItem(activeRunStorageKey, storage.getItem(activeRunStorageKey) ?? JSON.stringify(run));
        const ambientKeysBeforeRead = storage.keys().sort();

        const worldState = withThrowingAmbientLocalStorage(() => createGameWorldState({
            ...createSeedSources(),
            storage: injectedStorage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(worldState.storyHubSession.document.hubs['hub.qingyun-town']).toMatchObject({
            statusText: 'Injected Hub session',
        });
        expect(worldState.persistentStash.source).toBe('seed-fallback');
        expect(worldState.persistentStash.document.deck).toEqual(starterDeckJson.cards);
        expect(worldState.activeRun.document?.runId).toBe(run.runId);
        expect(worldState.activeRun.document?.routeKey).toBe(createActiveRunRouteKey(SYNTHETIC_TARGET));
        expect(storage.keys().sort()).toEqual(ambientKeysBeforeRead);
    });
});
