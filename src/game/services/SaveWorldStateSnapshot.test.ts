import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import { ExpeditionState } from '../state/ExpeditionState';
import type { RunSnapshot } from '../types/expedition';
import type { StoryState } from '../types/story';
import {
    applySaveCompatibilityMigrations,
    createActiveRunCompatibilityKeys,
    SAVE_COMPATIBILITY_REGISTRY,
    type SaveMigrationHook,
} from './SaveCompatibility';
import {
    ACTIVE_RUN_STORAGE_KEY,
    ACTIVE_RUN_STORAGE_KEY_PREFIX,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    loadActiveRun,
    loadPersistentStash,
    resetRunPersistenceForTests,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import { RUN_RESOLUTION_TERMINAL_OUTCOMES } from './RunResolution';
import {
    resetStoryHubSessionPersistenceForTests,
    saveHubSessionSnapshot,
    saveStoryRuntimeSession,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
    writeRawStoryHubSessionForTests,
} from './StoryHubSessionPersistence';
import { createSaveWorldStateSnapshot } from './SaveWorldStateSnapshot';
import {
    DEFAULT_EXPEDITION_TARGET,
    DEFAULT_EXPEDITION_TARGET_ROUTE_KEY,
    SYNTHETIC_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
    createItemStacksFromSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const initialWorldStateStashItems = createItemStacksFromSeed(initialWorldState.stash.items);

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
            throw new Error('ambient globalThis.localStorage must not be used by injected snapshot reads');
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
    entryNodeId = targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'entrance.mountain-gate' : 'entrance.synthetic',
    runStorage?: MemoryStorage,
): { state: ExpeditionState; run: RunSnapshot } {
    const state = ExpeditionState.bootstrap({
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
        targetIdentity,
        storage: runStorage,
    });
    const run = state.createRunSnapshot({
        ...targetIdentity,
        entryNodeId,
    });

    return { state, run };
}

function writeStaleActiveRun(targetIdentity: { expeditionId: string; mapId: string }): string {
    const storageKey = createActiveRunStorageKey(targetIdentity);

    storage.setItem(storageKey, JSON.stringify({
        runId: 'run-stale-route',
        expeditionId: 'other-expedition',
        mapId: 'other-map',
    }));

    return storageKey;
}

describe('SaveWorldStateSnapshot', () => {
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

    it('returns the current empty owner fallbacks without creating save keys', () => {
        const storageKeysBeforeSnapshot = storage.keys().sort();

        const snapshot = createSaveWorldStateSnapshot();

        expect(snapshot.storyHubSession.document).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        });
        expect(snapshot.persistentStash.document).toBeNull();
        expect(snapshot.activeRun.keys).toEqual(createActiveRunCompatibilityKeys());
        expect(snapshot.activeRun.document).toBeNull();
        expect(storage.keys().sort()).toEqual(storageKeysBeforeSnapshot);
    });

    it('builds one read-only compatibility view from the existing local persistence slices', () => {
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
        const { state, run } = startRun();
        state.applyNodeRewardPreview({
            cards: [{ id: 'TL_002', count: 1 }],
            items: [],
            spiritStones: 7,
        });
        const storageKeysBeforeSnapshot = storage.keys().sort();

        const snapshot = createSaveWorldStateSnapshot({ activeRunIdentity: DEFAULT_TARGET });

        expect(snapshot.registry).toBe(SAVE_COMPATIBILITY_REGISTRY);
        expect(snapshot.storyHubSession.compatibility).toBe(SAVE_COMPATIBILITY_REGISTRY.storyHubSession);
        expect(snapshot.storyHubSession.compatibility).toMatchObject({
            owner: 'storyHubSession',
            boundaryModule: 'src/game/services/StoryHubSessionPersistence.ts',
            storageKey: STORY_HUB_SESSION_STORAGE_KEY,
            persistedShape: 'StoryHubSessionDocument',
        });
        expect(snapshot.storyHubSession.document.hubs['hub.qingyun-town']).toMatchObject({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
        });
        expect(Object.keys(snapshot.storyHubSession.document.stories)).toEqual([
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json',
        ]);
        expect(snapshot.persistentStash.compatibility).toBe(SAVE_COMPATIBILITY_REGISTRY.persistentStash);
        expect(snapshot.persistentStash.compatibility).toMatchObject({
            owner: 'persistentStash',
            boundaryModule: 'src/game/services/RunPersistence.ts',
            storageKey: STASH_STORAGE_KEY,
            persistedShape: 'PersistentStash',
        });
        expect(snapshot.persistentStash.document).toEqual(loadPersistentStash());
        expect(snapshot.activeRun.compatibility).toBe(SAVE_COMPATIBILITY_REGISTRY.activeRun);
        expect(snapshot.activeRun.compatibility).toMatchObject({
            owner: 'activeRun',
            boundaryModule: 'src/game/services/RunPersistence.ts',
            canonicalStorageKeyPrefix: 'cardgame.active-run.v1:',
            legacyUnscopedStorageKey: 'cardgame.active-run.v1',
            persistedShape: 'RunSnapshot',
        });
        expect(snapshot.activeRun.keys).toEqual(createActiveRunCompatibilityKeys(undefined, DEFAULT_TARGET));
        expect(snapshot.activeRun.document?.runId).toBe(run.runId);
        expect(snapshot.activeRun.document?.carriedDeck).toContainEqual({ id: 'TL_002', count: 1 });
        expect(snapshot.runResolution.boundaryModule).toBe('src/game/services/RunResolution.ts');
        expect(snapshot.runResolution.terminalOutcomes).toBe(RUN_RESOLUTION_TERMINAL_OUTCOMES);
        expect(loadActiveRun(DEFAULT_TARGET)?.runId).toBe(run.runId);
        expect(loadPersistentStash()?.lastRunSummary).toBeNull();
        expect(storage.keys().sort()).toEqual(storageKeysBeforeSnapshot);
    });

    it('builds the current Story/Hub, stash, and route-keyed active-run slices from injected storage without touching ambient localStorage', () => {
        const injectedStorage = new MemoryStorage();
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '注入式读取应只看显式 storage。',
            updatedAt: '2026-05-09T06:00:00.000Z',
        }, injectedStorage);
        saveStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState: createStoryState('sect_entry_004_injected_storage'),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: '注入式 story session',
            updatedAt: '2026-05-09T06:01:00.000Z',
        }, injectedStorage);
        const { state, run } = startRun(SYNTHETIC_TARGET, undefined, injectedStorage);
        state.applyNodeRewardPreview({
            cards: [{ id: 'AR_001', count: 1 }],
            items: [],
            spiritStones: 9,
        });
        const ambientKeysBeforeSnapshot = storage.keys().sort();

        const snapshot = withThrowingAmbientLocalStorage(() => createSaveWorldStateSnapshot({
            storage: injectedStorage,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(snapshot.storyHubSession.document.hubs['hub.qingyun-town']).toMatchObject({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '注入式读取应只看显式 storage。',
        });
        expect(Object.keys(snapshot.storyHubSession.document.stories)).toEqual([
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json',
        ]);
        expect(snapshot.persistentStash.document?.stashId).toBe('phase01.starter-stash');
        expect(snapshot.persistentStash.document?.deck).toEqual(starterDeckJson.cards);
        expect(snapshot.activeRun.keys).toEqual(createActiveRunCompatibilityKeys(undefined, SYNTHETIC_TARGET));
        expect(snapshot.activeRun.document?.runId).toBe(run.runId);
        expect(snapshot.activeRun.document?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
        expect(storage.keys().sort()).toEqual(ambientKeysBeforeSnapshot);
    });

    it('runs the compatibility migration hook chain on loaded snapshot documents without writing storage', () => {
        ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: DEFAULT_TARGET,
        });
        const persistentStashBeforeSnapshot = storage.getItem(STASH_STORAGE_KEY);
        const migrationHook: SaveMigrationHook = {
            description: 'test-only persistent stash read facade marker',
            migrate: <TDocument>(document: TDocument): TDocument => ({
                ...(document as object),
                facadeMigrationMarker: 'applied',
            } as TDocument),
        };
        const persistentStashEntry = SAVE_COMPATIBILITY_REGISTRY.persistentStash as unknown as {
            migrationHooks: readonly SaveMigrationHook[];
        };
        const originalMigrationHooks = persistentStashEntry.migrationHooks;

        persistentStashEntry.migrationHooks = [migrationHook];
        try {
            const snapshot = createSaveWorldStateSnapshot();
            const migratedStash = snapshot.persistentStash.document as typeof snapshot.persistentStash.document & {
                facadeMigrationMarker?: string;
            };

            expect(migratedStash?.facadeMigrationMarker).toBe('applied');
            expect(storage.getItem(STASH_STORAGE_KEY)).toBe(persistentStashBeforeSnapshot);
        } finally {
            persistentStashEntry.migrationHooks = originalMigrationHooks;
        }
    });

    it('selects the requested route-keyed active run while keeping the persistent stash global', () => {
        const defaultRun = startRun(DEFAULT_TARGET).run;
        const syntheticRun = startRun(SYNTHETIC_TARGET).run;

        const syntheticSnapshot = createSaveWorldStateSnapshot({
            activeRunIdentity: SYNTHETIC_TARGET,
        });
        const defaultSnapshot = createSaveWorldStateSnapshot({
            activeRunLookup: createActiveRunRouteKey(DEFAULT_TARGET),
        });

        expect(syntheticSnapshot.activeRun.keys.routeKey).toBe(SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY);
        expect(syntheticSnapshot.activeRun.document?.runId).toBe(syntheticRun.runId);
        expect(defaultSnapshot.activeRun.keys.routeKey).toBe(DEFAULT_EXPEDITION_TARGET_ROUTE_KEY);
        expect(defaultSnapshot.activeRun.document?.runId).toBe(defaultRun.runId);
        expect(syntheticSnapshot.persistentStash.document?.stashId).toBe('phase01.starter-stash');
        expect(syntheticSnapshot.persistentStash.document?.deck).toEqual(starterDeckJson.cards);
        expect(syntheticSnapshot.persistentStash.document?.items).toEqual(initialWorldStateStashItems);
        expect(syntheticSnapshot.persistentStash.document?.spiritStones).toBe(initialWorldState.stash.spiritStones);
        expect(defaultSnapshot.persistentStash.document).toEqual(syntheticSnapshot.persistentStash.document);
    });

    it('uses the current owner fallback semantics for corrupt persisted slices', () => {
        writeRawStoryHubSessionForTests('{not valid json');
        storage.setItem(STASH_STORAGE_KEY, '{not valid json');
        const activeRunStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        storage.setItem(activeRunStorageKey, '{not valid json');

        const snapshot = createSaveWorldStateSnapshot({ activeRunIdentity: DEFAULT_TARGET });

        expect(snapshot.storyHubSession.document).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        });
        expect(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBeNull();
        expect(snapshot.persistentStash.document).toBeNull();
        expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
        expect(snapshot.activeRun.document).toBeNull();
        expect(storage.getItem(activeRunStorageKey)).toBeNull();
    });

    it('cleans corrupt injected Story/Hub, stash, and active-run JSON while keeping ambient localStorage unused', () => {
        const injectedStorage = new MemoryStorage();
        const activeRunStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        injectedStorage.setItem(STORY_HUB_SESSION_STORAGE_KEY, '{not valid json');
        injectedStorage.setItem(STASH_STORAGE_KEY, '{not valid json');
        injectedStorage.setItem(activeRunStorageKey, '{not valid json');

        const snapshot = withThrowingAmbientLocalStorage(() => createSaveWorldStateSnapshot({
            storage: injectedStorage,
            activeRunIdentity: DEFAULT_TARGET,
        }));

        expect(snapshot.storyHubSession.document).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        });
        expect(injectedStorage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBeNull();
        expect(snapshot.persistentStash.document).toBeNull();
        expect(injectedStorage.getItem(STASH_STORAGE_KEY)).toBeNull();
        expect(snapshot.activeRun.document).toBeNull();
        expect(injectedStorage.getItem(activeRunStorageKey)).toBeNull();
    });

    it('migrates and cleans an injected legacy unscoped active run without using ambient localStorage', () => {
        const { run } = startRun(DEFAULT_TARGET);
        const injectedStorage = new MemoryStorage();
        const canonicalStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        injectedStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(run));

        const snapshot = withThrowingAmbientLocalStorage(() => createSaveWorldStateSnapshot({
            storage: injectedStorage,
            activeRunIdentity: DEFAULT_TARGET,
        }));

        expect(snapshot.activeRun.document?.runId).toBe(run.runId);
        expect(injectedStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(JSON.parse(injectedStorage.getItem(canonicalStorageKey) ?? '{}')).toMatchObject({
            runId: run.runId,
            routeKey: createActiveRunRouteKey(DEFAULT_TARGET),
            expeditionId: DEFAULT_TARGET.expeditionId,
            mapId: DEFAULT_TARGET.mapId,
        });
    });

    it('uses the current owner fallback semantics for stale or corrupt persisted slices', () => {
        writeRawStoryHubSessionForTests(JSON.stringify({
            schemaVersion: 0,
            hubs: {},
            stories: {},
        }));
        storage.setItem(STASH_STORAGE_KEY, '{not valid json');
        const staleActiveRunStorageKey = writeStaleActiveRun(DEFAULT_TARGET);

        const snapshot = createSaveWorldStateSnapshot({ activeRunIdentity: DEFAULT_TARGET });

        expect(snapshot.storyHubSession.document).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        });
        expect(storage.getItem(STORY_HUB_SESSION_STORAGE_KEY)).toBeNull();
        expect(snapshot.persistentStash.document).toBeNull();
        expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
        expect(snapshot.activeRun.document).toBeNull();
        expect(storage.getItem(staleActiveRunStorageKey)).toBeNull();
    });

    it('falls back from an injected stale canonical route active run to an injected legacy route key and cleans both stale keys', () => {
        const legacyRouteKey = 'legacy-default-route';
        const legacyRouteStorageKey = `${ACTIVE_RUN_STORAGE_KEY_PREFIX}${legacyRouteKey}`;
        const canonicalStorageKey = createActiveRunStorageKey(DEFAULT_TARGET);
        const { run } = startRun(DEFAULT_TARGET);
        const injectedStorage = new MemoryStorage();
        injectedStorage.setItem(canonicalStorageKey, JSON.stringify({
            runId: 'run-stale-route',
            expeditionId: 'other-expedition',
            mapId: 'other-map',
        }));
        injectedStorage.setItem(legacyRouteStorageKey, JSON.stringify(run));

        const snapshot = withThrowingAmbientLocalStorage(() => createSaveWorldStateSnapshot({
            storage: injectedStorage,
            activeRunLookup: legacyRouteKey,
            activeRunIdentity: DEFAULT_TARGET,
        }));

        expect(snapshot.activeRun.document?.runId).toBe(run.runId);
        expect(snapshot.activeRun.keys).toEqual(createActiveRunCompatibilityKeys(legacyRouteKey, DEFAULT_TARGET));
        expect(injectedStorage.getItem(legacyRouteStorageKey)).toBeNull();
        expect(JSON.parse(injectedStorage.getItem(canonicalStorageKey) ?? '{}')).toMatchObject({
            runId: run.runId,
            routeKey: createActiveRunRouteKey(DEFAULT_TARGET),
        });
    });

    it('keeps default no-op migrations as pass-through for each snapshot owner', () => {
        const { run } = startRun();

        const snapshot = createSaveWorldStateSnapshot({ activeRunIdentity: DEFAULT_TARGET });

        expect(applySaveCompatibilityMigrations('storyHubSession', snapshot.storyHubSession.document))
            .toBe(snapshot.storyHubSession.document);
        expect(applySaveCompatibilityMigrations('persistentStash', snapshot.persistentStash.document))
            .toBe(snapshot.persistentStash.document);
        expect(applySaveCompatibilityMigrations('activeRun', snapshot.activeRun.document))
            .toBe(snapshot.activeRun.document);
        expect(snapshot.activeRun.document?.runId).toBe(run.runId);
        expect(Object.values(snapshot.registry).flatMap((entry) => entry.migrationHooks)).toEqual([]);
    });
});
