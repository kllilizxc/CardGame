import { afterEach, describe, expect, it } from 'bun:test';

import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    loadActiveRun,
    resetRunPersistenceForTests,
    type RunPersistenceStorageAdapter,
} from '../services/RunPersistence';
import type { RunSnapshot } from '../types/expedition';
import { createGameWorldState } from './GameWorldState';
import {
    applyGameWorldStateActiveRunPlan,
    clearGameWorldStateActiveRun,
    planGameWorldStateActiveRunClear,
    planGameWorldStateActiveRunWrite,
    planGameWorldStateActiveRunWriteFromDocument,
    planGameWorldStateActiveRunWriteFromView,
    writeGameWorldStateActiveRunPlan,
} from './GameWorldStateActiveRunWrite';
import {
    createRunSnapshot as createRunSnapshotFixture,
    OTHER_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const OTHER_TARGET = OTHER_EXPEDITION_TARGET;

const LEGACY_ROUTE_LOOKUP = 'worldMap:destination.synthetic-trial';
const LEGACY_ROUTE_STORAGE_KEY = `${ACTIVE_RUN_STORAGE_KEY}:${LEGACY_ROUTE_LOOKUP}`;

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

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by GameWorldState active-run writes');
        },
    });

    try {
        return callback();
    } finally {
        restoreLocalStorage();
    }
}

function restoreLocalStorage(): void {
    if (previousLocalStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousLocalStorageDescriptor);
    } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
    }

    previousLocalStorageDescriptor = undefined;
}

function createStoredActiveRun(
    targetIdentity = SYNTHETIC_TARGET,
    runId = 'run-active',
    currentNodeId = 'event.synthetic-cache',
): RunSnapshot {
    return createRunSnapshotFixture(targetIdentity, {
        runId,
        currentNodeId,
        startingLoadout: {
            cards: [{ id: 'AR_001', count: 3 }],
            items: [{ id: 'tool.return-rope', itemType: 'tool', count: 1 }],
            spiritStones: 36,
        },
        carriedDeck: [
            { id: 'AR_001', count: 3 },
            { id: 'TL_002', count: 1 },
        ],
        carriedItems: [{ id: 'tool.return-rope', itemType: 'tool', count: 1 }],
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
    });
}

function sortedJsonKeys(storage: Storage, key: string): string[] {
    return Object.keys(JSON.parse(storage.getItem(key) ?? '{}')).sort();
}

describe('GameWorldStateActiveRunWrite', () => {
    afterEach(() => {
        restoreLocalStorage();
        resetRunPersistenceForTests();
    });

    it('plans and applies an active-run save through explicit storage while normalizing routeKey and preserving JSON shape', () => {
        const storage = new MemoryStorage();
        const activeRun = {
            ...createStoredActiveRun(SYNTHETIC_TARGET, 'run-normalized'),
            routeKey: LEGACY_ROUTE_LOOKUP,
        };
        storage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(activeRun));
        storage.setItem(LEGACY_ROUTE_STORAGE_KEY, JSON.stringify(activeRun));

        const plan = planGameWorldStateActiveRunWriteFromDocument({
            document: activeRun,
            activeRunLookup: LEGACY_ROUTE_LOOKUP,
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        expect(plan.operation).toBe('save');
        expect(plan.routeKey).toBe(SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY);
        expect(plan.canonicalStorageKey).toBe(createActiveRunStorageKey(SYNTHETIC_TARGET));
        expect(plan.legacyUnscopedStorageKey).toBe(ACTIVE_RUN_STORAGE_KEY);
        expect(plan.legacyRouteStorageKeys).toEqual([LEGACY_ROUTE_STORAGE_KEY]);
        expect(plan.document?.routeKey).toBe(SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY);
        expect(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBeNull();

        activeRun.carriedDeck[0].count = 999;

        expect(plan.document?.carriedDeck[0].count).toBe(3);

        const result = withThrowingAmbientLocalStorage(() => writeGameWorldStateActiveRunPlan(plan, storage));
        const storedRun = JSON.parse(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null');

        expect(result.operation).toBe('save');
        expect(result.document).toEqual(storedRun);
        expect(storedRun).toEqual(plan.document);
        expect(storedRun.routeKey).toBe(createActiveRunRouteKey(SYNTHETIC_TARGET));
        expect(storage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(storage.getItem(LEGACY_ROUTE_STORAGE_KEY)).toBeNull();
        expect(sortedJsonKeys(storage, createActiveRunStorageKey(SYNTHETIC_TARGET))).toEqual([
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

        result.document!.carriedDeck[0].count = 123;

        expect(JSON.parse(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null')).toEqual(storedRun);
    });

    it('plans separately from applying and clones the GameWorldState view document', () => {
        const storage = new MemoryStorage();
        const activeRun = createStoredActiveRun(SYNTHETIC_TARGET, 'run-from-view');
        storage.setItem(createActiveRunStorageKey(SYNTHETIC_TARGET), JSON.stringify(activeRun));
        const worldState = createGameWorldState({
            storage,
            activeRunIdentity: SYNTHETIC_TARGET,
            worldState: {
                stash: {
                    stashId: 'seed-stash',
                    deckRef: 'seed-deck',
                    items: [],
                    spiritStones: 0,
                },
            },
            starterDeck: {
                cards: [],
            },
        });

        const plan = withThrowingAmbientLocalStorage(() => planGameWorldStateActiveRunWrite({
            storage,
            activeRunIdentity: SYNTHETIC_TARGET,
            worldState: {
                stash: {
                    stashId: 'seed-stash',
                    deckRef: 'seed-deck',
                    items: [],
                    spiritStones: 0,
                },
            },
            starterDeck: {
                cards: [],
            },
        }));
        const planFromView = planGameWorldStateActiveRunWriteFromView(worldState);

        expect(plan).toEqual(planFromView);
        expect(plan.operation).toBe('save');
        expect(plan.document).toEqual(activeRun);

        (worldState.activeRun.document!.carriedDeck as Array<{ id: string; count: number }>)[0].count = 777;
        plan.document!.carriedDeck[0].count = 888;

        expect(JSON.parse(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null')).toEqual(activeRun);

        const result = withThrowingAmbientLocalStorage(() => applyGameWorldStateActiveRunPlan(plan, storage));
        const storedRun = JSON.parse(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null');

        expect(storedRun.carriedDeck[0].count).toBe(888);

        result.document!.carriedDeck[0].count = 999;

        expect(JSON.parse(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null')).toEqual(storedRun);
    });

    it('plans and applies clear operations through explicit storage while delegating legacy cleanup', () => {
        const storage = new MemoryStorage();
        const activeRun = createStoredActiveRun(SYNTHETIC_TARGET, 'run-clear');
        const otherRun = createStoredActiveRun(OTHER_TARGET, 'run-other', 'event.other');
        storage.setItem(createActiveRunStorageKey(SYNTHETIC_TARGET), JSON.stringify(activeRun));
        storage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(activeRun));
        storage.setItem(LEGACY_ROUTE_STORAGE_KEY, JSON.stringify(activeRun));
        storage.setItem(createActiveRunStorageKey(OTHER_TARGET), JSON.stringify(otherRun));

        const plan = withThrowingAmbientLocalStorage(() => planGameWorldStateActiveRunClear({
            storage,
            activeRunLookup: LEGACY_ROUTE_LOOKUP,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(plan).toMatchObject({
            operation: 'clear',
            document: null,
            reason: 'document-null',
            routeKey: createActiveRunRouteKey(SYNTHETIC_TARGET),
            canonicalStorageKey: createActiveRunStorageKey(SYNTHETIC_TARGET),
            legacyRouteStorageKeys: [LEGACY_ROUTE_STORAGE_KEY],
        });
        expect(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).not.toBeNull();

        const result = withThrowingAmbientLocalStorage(() => clearGameWorldStateActiveRun({
            storage,
            activeRunLookup: LEGACY_ROUTE_LOOKUP,
            activeRunIdentity: SYNTHETIC_TARGET,
        }));

        expect(result).toEqual(plan);
        expect(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBeNull();
        expect(storage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(storage.getItem(LEGACY_ROUTE_STORAGE_KEY)).toBeNull();
        expect(JSON.parse(storage.getItem(createActiveRunStorageKey(OTHER_TARGET)) ?? 'null')).toEqual(otherRun);
    });

    it('rejects identity mismatches before changing storage', () => {
        const storage = new MemoryStorage();
        const activeRun = createStoredActiveRun(SYNTHETIC_TARGET, 'run-identity-mismatch');
        const canonicalStorageKey = createActiveRunStorageKey(SYNTHETIC_TARGET);
        storage.setItem(canonicalStorageKey, JSON.stringify(activeRun));

        expect(() => planGameWorldStateActiveRunWriteFromDocument({
            document: activeRun,
            activeRunIdentity: OTHER_TARGET,
        })).toThrow(
            'Cannot persist active run for synthetic-expedition/synthetic-map under route other-expedition/other-map.',
        );

        const plan = planGameWorldStateActiveRunWriteFromDocument({
            document: activeRun,
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        if (plan.operation !== 'save') {
            throw new Error('Expected active-run identity mismatch fixture to create a save plan.');
        }

        const malformedPlan = {
            ...plan,
            document: {
                ...plan.document!,
                expeditionId: OTHER_TARGET.expeditionId,
            },
        };

        expect(() => writeGameWorldStateActiveRunPlan(malformedPlan, storage)).toThrow(
            'Cannot persist active run for other-expedition/synthetic-map under route synthetic-expedition/synthetic-map.',
        );
        expect(JSON.parse(storage.getItem(canonicalStorageKey) ?? 'null')).toEqual(activeRun);
    });

    it('rejects incompatible metadata, malformed plans, and missing explicit storage adapters', () => {
        const storage = new MemoryStorage();
        const activeRun = createStoredActiveRun(SYNTHETIC_TARGET, 'run-validation');
        storage.setItem(createActiveRunStorageKey(SYNTHETIC_TARGET), JSON.stringify(activeRun));
        const worldState = createGameWorldState({
            storage,
            activeRunIdentity: SYNTHETIC_TARGET,
            worldState: {
                stash: {
                    stashId: 'seed-stash',
                    deckRef: 'seed-deck',
                    items: [],
                    spiritStones: 0,
                },
            },
            starterDeck: {
                cards: [],
            },
        });
        const plan = planGameWorldStateActiveRunWriteFromView(worldState);
        const malformedStorage = {
            getItem: storage.getItem.bind(storage),
            removeItem: storage.removeItem.bind(storage),
        } as unknown as RunPersistenceStorageAdapter;

        (worldState.activeRun.compatibility as { canonicalStorageKeyPrefix: string }).canonicalStorageKeyPrefix = 'cardgame.active-run.v2:';

        expect(() => planGameWorldStateActiveRunWriteFromView(worldState)).toThrow(
            'GameWorldState active-run write attempted to use an incompatible storage boundary.',
        );
        expect(() => planGameWorldStateActiveRunWrite({
            storage: undefined as unknown as RunPersistenceStorageAdapter,
            activeRunIdentity: SYNTHETIC_TARGET,
            worldState: {
                stash: {
                    stashId: 'seed-stash',
                    deckRef: 'seed-deck',
                    items: [],
                    spiritStones: 0,
                },
            },
            starterDeck: {
                cards: [],
            },
        })).toThrow(
            'GameWorldState active-run write requires an explicit storage adapter with getItem, setItem, and removeItem.',
        );
        expect(() => writeGameWorldStateActiveRunPlan(plan, malformedStorage)).toThrow(
            'GameWorldState active-run write requires an explicit storage adapter with getItem, setItem, and removeItem.',
        );
        expect(() => writeGameWorldStateActiveRunPlan({
            ...plan,
            canonicalStorageKey: 'cardgame.active-run.v1:expedition:wrong:wrong',
        }, storage)).toThrow(
            'GameWorldState active-run plan uses an incompatible route-keyed storage boundary.',
        );
    });

    it('creates a clear plan from a null document and leaves other active-run routes readable', () => {
        const storage = new MemoryStorage();
        const otherRun = createStoredActiveRun(OTHER_TARGET, 'run-other-readable', 'event.other');
        storage.setItem(createActiveRunStorageKey(OTHER_TARGET), JSON.stringify(otherRun));

        const plan = planGameWorldStateActiveRunWriteFromDocument({
            document: null,
            activeRunIdentity: SYNTHETIC_TARGET,
        });

        expect(plan.operation).toBe('clear');
        expect(plan.document).toBeNull();

        withThrowingAmbientLocalStorage(() => writeGameWorldStateActiveRunPlan(plan, storage));

        expect(loadActiveRun(OTHER_TARGET, undefined, storage)).toEqual(otherRun);
        expect(storage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBeNull();
    });
});
