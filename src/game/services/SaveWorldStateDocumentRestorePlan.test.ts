import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import { ExpeditionState } from '../state/ExpeditionState';
import type { StoryState } from '../types/story';
import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    resetRunPersistenceForTests,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import {
    createStoryRuntimeSessionStorageKey,
    resetStoryHubSessionPersistenceForTests,
    saveHubSessionSnapshot,
    saveStoryRuntimeSession,
    STORY_HUB_SESSION_STORAGE_KEY,
} from './StoryHubSessionPersistence';
import { createSaveWorldStateSnapshot } from './SaveWorldStateSnapshot';
import {
    createSaveWorldStateDocument,
    parseSaveWorldStateDocument,
    type SaveWorldStateDocument,
} from './SaveWorldStateDocument';
import { createSaveWorldStateDocumentRestorePlan } from './SaveWorldStateDocumentRestorePlan';
import {
    DEFAULT_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
    normalizeExpeditionWorldStateSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
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

describe('SaveWorldStateDocumentRestorePlan', () => {
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

    it('turns null stash and activeRun slices into explicit remove/no-op operations without touching storage', () => {
        const document = createSaveWorldStateDocument(createSaveWorldStateSnapshot());
        storage.setItem(STASH_STORAGE_KEY, 'existing-stash');
        storage.setItem(createActiveRunStorageKey(DEFAULT_TARGET), 'existing-active-run');
        storage.setItem(ACTIVE_RUN_STORAGE_KEY, 'legacy-active-run');
        const storageEntriesBeforePlan = storage.keys()
            .sort()
            .map((key) => [key, storage.getItem(key)] as const);

        const plan = createSaveWorldStateDocumentRestorePlan(document);

        expect(plan.operations).toEqual([
            {
                operation: 'setItem',
                owner: 'storyHubSession',
                storageKey: STORY_HUB_SESSION_STORAGE_KEY,
                value: JSON.stringify(document.worldState.storyHubSession.document),
            },
            {
                operation: 'removeItem',
                owner: 'persistentStash',
                storageKey: STASH_STORAGE_KEY,
                reason: 'document-null',
            },
            {
                operation: 'removeItem',
                owner: 'activeRun',
                routeKey: createActiveRunRouteKey(DEFAULT_TARGET),
                storageKey: createActiveRunStorageKey(DEFAULT_TARGET),
                reason: 'document-null',
            },
            {
                operation: 'no-op',
                owner: 'activeRun',
                routeKey: createActiveRunRouteKey(DEFAULT_TARGET),
                storageKey: ACTIVE_RUN_STORAGE_KEY,
                reason: 'legacy-active-run-write-disabled',
            },
        ]);
        expect(storage.keys()
            .sort()
            .map((key) => [key, storage.getItem(key)] as const)).toEqual(storageEntriesBeforePlan);
    });

    it('rejects malformed documents through the existing SaveWorldStateDocument parser/validator boundary', () => {
        const validDocument = createSaveWorldStateDocument(createSaveWorldStateSnapshot());
        const malformedDocument = {
            ...validDocument,
            worldState: {
                ...validDocument.worldState,
                storyHubSession: {
                    ...validDocument.worldState.storyHubSession,
                    compatibility: {
                        ...validDocument.worldState.storyHubSession.compatibility,
                        storageKey: 'cardgame.story-hub-session.future',
                    },
                },
            },
        };

        expect(() => parseSaveWorldStateDocument(JSON.stringify(malformedDocument)))
            .toThrow('Invalid SaveWorldStateDocument');
        expect(() => createSaveWorldStateDocumentRestorePlan(malformedDocument as unknown as SaveWorldStateDocument))
            .toThrow('Invalid SaveWorldStateDocument');
    });

    it('turns a complete document into stable current-storage setItem operations without writing legacy active-run keys', () => {
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
        startRun(DEFAULT_TARGET);
        const syntheticRunId = startRun(SYNTHETIC_TARGET);
        const storageKeysBeforePlan = storage.keys().sort();
        const document = createSaveWorldStateDocument(
            createSaveWorldStateSnapshot({ activeRunIdentity: SYNTHETIC_TARGET }),
        );

        const plan = createSaveWorldStateDocumentRestorePlan(document);

        expect(plan.operations).toEqual([
            {
                operation: 'setItem',
                owner: 'storyHubSession',
                storageKey: STORY_HUB_SESSION_STORAGE_KEY,
                value: JSON.stringify(document.worldState.storyHubSession.document),
            },
            {
                operation: 'setItem',
                owner: 'persistentStash',
                storageKey: STASH_STORAGE_KEY,
                value: JSON.stringify(document.worldState.persistentStash.document),
            },
            {
                operation: 'setItem',
                owner: 'activeRun',
                routeKey: SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
                storageKey: createActiveRunStorageKey(SYNTHETIC_TARGET),
                value: JSON.stringify(document.worldState.activeRun.document),
            },
            {
                operation: 'no-op',
                owner: 'activeRun',
                routeKey: SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
                storageKey: ACTIVE_RUN_STORAGE_KEY,
                reason: 'legacy-active-run-write-disabled',
            },
        ]);
        expect(document.worldState.activeRun.document?.runId).toBe(syntheticRunId);
        expect(plan.operations).not.toContainEqual(expect.objectContaining({
            operation: 'setItem',
            storageKey: ACTIVE_RUN_STORAGE_KEY,
        }));
        expect(Object.keys(document.worldState.storyHubSession.document.stories)).toEqual([
            createStoryRuntimeSessionStorageKey({
                hubId: 'hub.qingyun-town',
                actionId: 'action.start-qingyun-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
            }),
        ]);
        expect(storage.keys().sort()).toEqual(storageKeysBeforePlan);
    });
});
