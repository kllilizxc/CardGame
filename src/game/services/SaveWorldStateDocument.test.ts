import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import { ExpeditionState } from '../state/ExpeditionState';
import type { ExpeditionItemStack } from '../types/expedition';
import type { StoryState } from '../types/story';
import {
    createActiveRunCompatibilityKeys,
    SAVE_COMPATIBILITY_REGISTRY,
} from './SaveCompatibility';
import {
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
    createStoryRuntimeSessionStorageKey,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
} from './StoryHubSessionPersistence';
import { createSaveWorldStateSnapshot } from './SaveWorldStateSnapshot';
import {
    cloneSaveWorldStateDocument,
    createSaveWorldStateDocument,
    migrateSaveWorldStateDocument,
    parseSaveWorldStateDocument,
    SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
    SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
    validateSaveWorldStateDocument,
} from './SaveWorldStateDocument';
import {
    DEFAULT_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
    normalizeExpeditionWorldStateSeed,
    createItemStacksFromSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const initialWorldStateStashItems = createItemStacksFromSeed(initialWorldState.stash.items);
const createWorldStateSeed = () => normalizeExpeditionWorldStateSeed(structuredClone(initialWorldState));

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
            throw new Error('ambient globalThis.localStorage must not be used by injected document creation');
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
): string {
    const state = ExpeditionState.bootstrap({
        worldState: createWorldStateSeed(),
        starterDeck: structuredClone(starterDeckJson),
        targetIdentity,
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

function copyCurrentPersistenceInto(
    targetStorage: MemoryStorage,
    targetIdentity: { expeditionId: string; mapId: string },
): void {
    for (const key of [
        STORY_HUB_SESSION_STORAGE_KEY,
        STASH_STORAGE_KEY,
        createActiveRunStorageKey(targetIdentity),
    ]) {
        const rawValue = storage.getItem(key);

        if (rawValue !== null) {
            targetStorage.setItem(key, rawValue);
        }
    }
}

describe('SaveWorldStateDocument', () => {
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

    it('converts an empty read-only snapshot into a versioned in-memory document without creating storage keys', () => {
        const storageKeysBeforeSnapshot = storage.keys().sort();
        const snapshot = createSaveWorldStateSnapshot();

        const document = createSaveWorldStateDocument(snapshot);

        expect(document.schemaVersion).toBe(SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION);
        expect(document.contentType).toBe(SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE);
        expect(document.content).toMatchObject({
            source: 'SaveWorldStateSnapshot',
            snapshotSchemaVersion: null,
            owners: ['storyHubSession', 'persistentStash', 'activeRun'],
        });
        expect(document.migrationBoundary).toEqual({
            kind: 'no-op',
            documentMigrationCount: 0,
            ownerHookCounts: {
                storyHubSession: 0,
                persistentStash: 0,
                activeRun: 0,
            },
        });
        expect(document.worldState.storyHubSession.document).toEqual({
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        });
        expect(document.worldState.persistentStash.document).toBeNull();
        expect(document.worldState.activeRun.keys).toEqual(createActiveRunCompatibilityKeys());
        expect(document.worldState.activeRun.document).toBeNull();
        expect(storage.keys().sort()).toEqual(storageKeysBeforeSnapshot);
    });

    it('captures Story/Hub session, global stash, and requested route-keyed active run slices as serializable content', () => {
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
        const defaultRunId = startRun(DEFAULT_TARGET);
        const syntheticRunId = startRun(SYNTHETIC_TARGET);
        const storageKeysBeforeDocument = storage.keys().sort();
        const snapshot = createSaveWorldStateSnapshot({ activeRunIdentity: SYNTHETIC_TARGET });

        const document = createSaveWorldStateDocument(snapshot);
        const serialized = JSON.stringify(document);

        expect(document.worldState.storyHubSession.compatibility).toMatchObject({
            owner: 'storyHubSession',
            boundaryModule: 'src/game/services/StoryHubSessionPersistence.ts',
            storageKey: STORY_HUB_SESSION_STORAGE_KEY,
            documentSchemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            persistedShape: 'StoryHubSessionDocument',
            migrationHooks: [],
        });
        expect(document.worldState.storyHubSession.document.hubs['hub.qingyun-town']).toMatchObject({
            currentLocationId: 'location.qingyun-town.teahouse',
        });
        expect(Object.keys(document.worldState.storyHubSession.document.stories)).toEqual([
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json',
        ]);
        expect(document.worldState.persistentStash.compatibility).toMatchObject({
            owner: 'persistentStash',
            storageKey: STASH_STORAGE_KEY,
            persistedShape: 'PersistentStash',
            migrationHooks: [],
        });
        expect(document.worldState.persistentStash.document).toEqual(loadPersistentStash());
        expect(document.worldState.persistentStash.document?.deck).toEqual(starterDeckJson.cards);
        expect(document.worldState.persistentStash.document?.items).toEqual(initialWorldStateStashItems);
        expect(document.worldState.activeRun.compatibility).toMatchObject({
            owner: 'activeRun',
            canonicalStorageKeyPrefix: 'cardgame.active-run.v1:',
            legacyUnscopedStorageKey: 'cardgame.active-run.v1',
            persistedShape: 'RunSnapshot',
            migrationHooks: [],
        });
        expect(document.worldState.activeRun.keys).toEqual(createActiveRunCompatibilityKeys(undefined, SYNTHETIC_TARGET));
        expect(document.worldState.activeRun.document?.runId).toBe(syntheticRunId);
        expect(document.worldState.activeRun.document?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
        expect(loadActiveRun(DEFAULT_TARGET)?.runId).toBe(defaultRunId);
        expect(document.worldState.runResolution.terminalOutcomes).toEqual(RUN_RESOLUTION_TERMINAL_OUTCOMES);
        expect(serialized).toContain(SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE);
        expect(serialized).not.toContain('migrate');
        expect(storage.keys().sort()).toEqual(storageKeysBeforeDocument);
    });

    it('creates a serializable document from injected snapshot storage without consulting ambient localStorage', () => {
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: 'document should come from injected storage',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });
        saveStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState: createStoryState('sect_entry_005_document_injected_storage'),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: 'document injection story',
            updatedAt: '2026-05-09T06:01:00.000Z',
        });
        const syntheticRunId = startRun(SYNTHETIC_TARGET);
        const injectedStorage = new MemoryStorage();
        copyCurrentPersistenceInto(injectedStorage, SYNTHETIC_TARGET);
        const ambientKeysBeforeDocument = storage.keys().sort();

        const document = withThrowingAmbientLocalStorage(() => createSaveWorldStateDocument(
            createSaveWorldStateSnapshot({
                storage: injectedStorage,
                activeRunIdentity: SYNTHETIC_TARGET,
            }),
        ));

        expect(document.worldState.storyHubSession.document.hubs['hub.qingyun-town']).toMatchObject({
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: 'document should come from injected storage',
        });
        expect(Object.keys(document.worldState.storyHubSession.document.stories)).toEqual([
            'hub.qingyun-town|action.start-qingyun-entry-story|data%2Fstory%2Fstory-graph.json',
        ]);
        expect(document.worldState.persistentStash.document?.deck).toEqual(starterDeckJson.cards);
        expect(document.worldState.activeRun.keys).toEqual(createActiveRunCompatibilityKeys(undefined, SYNTHETIC_TARGET));
        expect(document.worldState.activeRun.document?.runId).toBe(syntheticRunId);
        expect(document.worldState.activeRun.document?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
        expect(storage.keys().sort()).toEqual(ambientKeysBeforeDocument);
    });

    it('clones and parses documents without sharing mutable nested references', () => {
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });
        startRun(DEFAULT_TARGET);
        const document = createSaveWorldStateDocument(
            createSaveWorldStateSnapshot({ activeRunIdentity: DEFAULT_TARGET }),
        );

        const cloned = cloneSaveWorldStateDocument(document);
        cloned.worldState.storyHubSession.document.hubs['hub.qingyun-town'].currentLocationId = 'location.changed';
        cloned.worldState.activeRun.document!.carriedDeck[0].count += 99;
        const parsed = parseSaveWorldStateDocument(JSON.stringify(document));

        expect(document.worldState.storyHubSession.document.hubs['hub.qingyun-town'].currentLocationId)
            .toBe('location.qingyun-town.teahouse');
        expect(document.worldState.activeRun.document?.carriedDeck[0].count).toBe(starterDeckJson.cards[0].count);
        expect(parsed).toEqual(document);
        expect(parsed).not.toBe(document);
        expect(parsed.worldState.storyHubSession.document).not.toBe(document.worldState.storyHubSession.document);
        expect(parsed.worldState.activeRun.document).not.toBe(document.worldState.activeRun.document);
    });

    it('rejects malformed documents during validation and parse', () => {
        const validDocument = createSaveWorldStateDocument(createSaveWorldStateSnapshot());
        startRun(DEFAULT_TARGET);
        const activeRunDocument = createSaveWorldStateDocument(
            createSaveWorldStateSnapshot({ activeRunIdentity: DEFAULT_TARGET }),
        );
        const malformedDocuments: unknown[] = [
            null,
            { ...validDocument, schemaVersion: 0 },
            { ...validDocument, contentType: 'application/json' },
            { ...validDocument, content: { ...validDocument.content, owners: ['storyHubSession'] } },
            {
                ...validDocument,
                migrationBoundary: {
                    ...validDocument.migrationBoundary,
                    ownerHookCounts: {
                        ...validDocument.migrationBoundary.ownerHookCounts,
                        storyHubSession: SAVE_COMPATIBILITY_REGISTRY.storyHubSession.migrationHooks.length + 1,
                    },
                },
            },
            {
                ...validDocument,
                worldState: {
                    ...validDocument.worldState,
                    storyHubSession: {
                        ...validDocument.worldState.storyHubSession,
                        compatibility: {
                            ...validDocument.worldState.storyHubSession.compatibility,
                            migrationHooks: [{ description: 'unexpected future migration' }],
                        },
                    },
                },
            },
            {
                ...validDocument,
                worldState: {
                    ...validDocument.worldState,
                    activeRun: {
                        ...validDocument.worldState.activeRun,
                        compatibility: {
                            ...validDocument.worldState.activeRun.compatibility,
                            migrationHooks: [{ description: 'unexpected active run migration' }],
                        },
                    },
                },
            },
            { ...validDocument, worldState: { ...validDocument.worldState, activeRun: undefined } },
            {
                ...validDocument,
                worldState: {
                    ...validDocument.worldState,
                    storyHubSession: {
                        ...validDocument.worldState.storyHubSession,
                        document: { schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION, hubs: [], stories: {} },
                    },
                },
            },
            {
                ...validDocument,
                worldState: {
                    ...validDocument.worldState,
                    storyHubSession: {
                        ...validDocument.worldState.storyHubSession,
                        document: {
                            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
                            hubs: {},
                            stories: {
                                [createStoryRuntimeSessionStorageKey({
                                    hubId: 'hub.wrong',
                                    actionId: 'action.wrong',
                                    storyGraphFile: 'data/story/story-graph.json',
                                })]: {
                                    hubId: 'hub.qingyun-town',
                                    actionId: 'action.start-qingyun-entry-story',
                                    storyGraphFile: 'data/story/story-graph.json',
                                    storyState: createStoryState(),
                                    selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
                                    updatedAt: '2026-05-09T06:01:00.000Z',
                                },
                            },
                        },
                    },
                },
            },
            {
                ...validDocument,
                worldState: {
                    ...validDocument.worldState,
                    activeRun: {
                        ...validDocument.worldState.activeRun,
                        keys: {
                            ...validDocument.worldState.activeRun.keys,
                            routeKey: 'not-a-route-key',
                        },
                    },
                },
            },
            {
                ...activeRunDocument,
                worldState: {
                    ...activeRunDocument.worldState,
                    activeRun: {
                        ...activeRunDocument.worldState.activeRun,
                        keys: createActiveRunCompatibilityKeys(undefined, {
                            expeditionId: 'synthetic-route-owner',
                            mapId: 'synthetic-route-map',
                        }),
                    },
                },
            },
        ];

        for (const malformedDocument of malformedDocuments) {
            expect(() => validateSaveWorldStateDocument(malformedDocument))
                .toThrow('Invalid SaveWorldStateDocument');
        }
        expect(() => parseSaveWorldStateDocument('{not valid json'))
            .toThrow('Invalid SaveWorldStateDocument JSON');
        expect(() => parseSaveWorldStateDocument(JSON.stringify({ ...validDocument, schemaVersion: 99 })))
            .toThrow('Invalid SaveWorldStateDocument');
    });

    it('keeps the document migration boundary explicit and no-op for the current schema', () => {
        startRun(DEFAULT_TARGET);
        const storageKeysBeforeMigration = storage.keys().sort();
        const document = createSaveWorldStateDocument(
            createSaveWorldStateSnapshot({ activeRunIdentity: DEFAULT_TARGET }),
        );

        const migrated = migrateSaveWorldStateDocument(document);

        expect(Object.values(SAVE_COMPATIBILITY_REGISTRY).flatMap((entry) => entry.migrationHooks)).toEqual([]);
        expect(migrated).toEqual(document);
        expect(migrated).not.toBe(document);
        expect(migrated.worldState.activeRun.document).not.toBe(document.worldState.activeRun.document);
        expect(migrated.migrationBoundary).toEqual({
            kind: 'no-op',
            documentMigrationCount: 0,
            ownerHookCounts: {
                storyHubSession: 0,
                persistentStash: 0,
                activeRun: 0,
            },
        });
        expect(storage.keys().sort()).toEqual(storageKeysBeforeMigration);
    });
});
