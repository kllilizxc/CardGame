import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import worldMapJson from '../../../public/data/world/world-map.json';

import { ExpeditionState } from '../state/ExpeditionState';
import { validateWorldMapDefinition } from '../scenes/worldmap/worldMap';
import type { PersistentStash, RunSnapshot } from '../types/expedition';
import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunStorageKey,
    loadActiveRun,
    loadPersistentStash,
    resetRunPersistenceForTests,
    STASH_STORAGE_KEY,
    type RunPersistenceStorageAdapter,
} from './RunPersistence';
import {
    resolveBattleDefeat,
    resolveBattleVictory,
    resolveBossClear,
    resolveExtract,
} from './RunResolution';
import {
    DEFAULT_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
    normalizeExpeditionWorldStateSeed,
    createItemStack,
    createItemStacksFromSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const LEGACY_ROUTE_LOOKUP = 'worldMap:destination.synthetic-expedition';
const LEGACY_ROUTE_STORAGE_KEY = `${ACTIVE_RUN_STORAGE_KEY}:${LEGACY_ROUTE_LOOKUP}`;
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
}

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by injected RunResolution writes');
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

function getCheckedInExpeditionTarget(destinationId: string): { expeditionId: string; mapId: string } {
    const worldMap = validateWorldMapDefinition(worldMapJson);
    const destination = worldMap.destinations.find((candidate) => candidate.id === destinationId);

    if (!destination || destination.kind !== 'expedition') {
        throw new Error(`Expected checked-in Expedition destination: ${destinationId}`);
    }

    return {
        expeditionId: destination.expeditionId,
        mapId: destination.mapId,
    };
}

function startRewardedRun(
    targetIdentity: { expeditionId: string; mapId: string } = DEFAULT_TARGET,
    rewardCardId = 'TL_002',
    entryNodeId = targetIdentity.mapId === DEFAULT_TARGET.mapId ? 'entrance.mountain-gate' : 'entrance.synthetic',
    storage?: Storage,
): ExpeditionState {
    const state = ExpeditionState.bootstrap({
        worldState: createWorldStateSeed(),
        starterDeck: structuredClone(starterDeckJson),
        targetIdentity,
        storage,
    });

    state.createRunSnapshot({
        ...targetIdentity,
        entryNodeId,
    });

    state.applyNodeRewardPreview({
        cards: [{ id: rewardCardId, count: 1 }],
        items: [createItemStack('tool_talisman_basic', 'tool', 1)],
        spiritStones: 18,
    });

    return state;
}

function readStoredPersistentStash(storage: Storage): PersistentStash {
    return JSON.parse(storage.getItem(STASH_STORAGE_KEY) ?? 'null') as PersistentStash;
}

function expectRunResolutionPersistentStashJsonShape(stash: PersistentStash): void {
    expect(Object.keys(stash).sort()).toEqual([
        'deck',
        'deckRef',
        'items',
        'lastRunSummary',
        'spiritStones',
        'stashId',
    ]);
    expect(Array.isArray(stash.deck)).toBe(true);
    expect(Array.isArray(stash.items)).toBe(true);
    expect(typeof stash.spiritStones).toBe('number');

    const summary = stash.lastRunSummary as unknown as Record<string, unknown>;

    expect(Object.keys(summary).sort()).toEqual([
        'endedAt',
        'finalNodeId',
        'kept',
        'lost',
        'outcome',
        'runId',
    ]);
    expect(Object.keys(summary.kept as Record<string, unknown>).sort()).toEqual([
        'cards',
        'items',
        'spiritStones',
    ]);
    expect(Object.keys(summary.lost as Record<string, unknown>).sort()).toEqual([
        'cards',
        'items',
        'spiritStones',
    ]);
}

describe('RunResolution', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('defeat clears the active run and loses all carried run assets from the persistent stash', () => {
        startRewardedRun();

        const summary = resolveBattleDefeat({ finalNodeId: 'battle.mist-foxes' });
        const updatedStash = loadPersistentStash();

        expect(loadActiveRun()).toBeNull();
        expect(updatedStash?.deck).toEqual([]);
        expect(updatedStash?.items).toEqual([]);
        expect(updatedStash?.spiritStones).toBe(0);
        expect(summary.outcome).toBe('defeat');
        expect(summary.finalNodeId).toBe('battle.mist-foxes');
        expect(summary.kept).toEqual({ cards: [], items: [], spiritStones: 0 });
        expect(summary.lost.cards).toContainEqual({ id: 'TL_002', count: 1 });
        expect(summary.lost.items).toContainEqual(createItemStack('tool_talisman_basic', 'tool', 1));
        expect(summary.lost.spiritStones).toBe(54);
        expect(updatedStash?.lastRunSummary).toEqual(summary);
    });

    it('extract clears the active run and banks carried cards, items, and spiritStones without duplicating the starting loadout', () => {
        startRewardedRun();

        const summary = resolveExtract({ finalNodeId: 'extract.cliff-rope' });
        const updatedStash = loadPersistentStash();

        expect(loadActiveRun()).toBeNull();
        expect(updatedStash?.deck).toEqual([...starterDeckJson.cards, { id: 'TL_002', count: 1 }]);
        expect(updatedStash?.items).toEqual([
            ...initialWorldStateStashItems,
            createItemStack('tool_talisman_basic', 'tool', 1),
        ]);
        expect(updatedStash?.spiritStones).toBe(54);
        expect(summary.outcome).toBe('extract');
        expect(summary.kept.cards).toContainEqual({ id: 'TL_002', count: 1 });
        expect(summary.kept.items).toContainEqual(createItemStack('tool_talisman_basic', 'tool', 1));
        expect(summary.kept.spiritStones).toBe(54);
        expect(summary.lost).toEqual({ cards: [], items: [], spiritStones: 0 });
        expect(updatedStash?.lastRunSummary).toEqual(summary);
    });

    it('boss clear uses the boss-clear terminal label and allows a fresh run immediately after resolution', () => {
        const state = startRewardedRun();

        const summary = resolveBossClear({ finalNodeId: 'boss.sealed-guardian' });
        state.resetToEntranceState();
        const freshRun = state.createRunSnapshot({
            ...DEFAULT_TARGET,
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(summary.outcome).toBe('boss-clear');
        expect(summary.finalNodeId).toBe('boss.sealed-guardian');
        expect(loadActiveRun()?.runId).toBe(freshRun.runId);
        expect(freshRun.runId).not.toBe(summary.runId);
        expect(freshRun.carriedDeck).toContainEqual({ id: 'TL_002', count: 1 });
        expect(freshRun.carriedItems).toContainEqual(createItemStack('tool_talisman_basic', 'tool', 1));
        expect(freshRun.spiritStones).toBe(54);
    });

    it('terminal defeat clears only the matching target active run', () => {
        const defaultState = startRewardedRun(DEFAULT_TARGET, 'TL_002');
        const syntheticState = startRewardedRun(SYNTHETIC_TARGET, 'AR_001');
        const syntheticRunId = syntheticState.activeRun?.runId;
        const defaultRunId = defaultState.activeRun?.runId;

        if (!defaultRunId) {
            throw new Error('Expected default active run id to exist.');
        }

        const summary = resolveBattleDefeat({
            targetIdentity: DEFAULT_TARGET,
            finalNodeId: 'battle.mist-foxes',
        });

        expect(summary.runId).toBe(defaultRunId);
        expect(loadActiveRun(DEFAULT_TARGET)).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRunId);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
    });

    it('extract and boss-clear terminal outcomes also clear only the matching target active run', () => {
        for (const scenario of [
            {
                outcome: 'extract' as const,
                finalNodeId: 'extract.cliff-rope',
                resolve: resolveExtract,
            },
            {
                outcome: 'boss-clear' as const,
                finalNodeId: 'boss.sealed-guardian',
                resolve: resolveBossClear,
            },
        ]) {
            resetRunPersistenceForTests();
            startRewardedRun(DEFAULT_TARGET, 'TL_002');
            const syntheticState = startRewardedRun(SYNTHETIC_TARGET, 'AR_001');
            const syntheticRunId = syntheticState.activeRun?.runId;

            const summary = scenario.resolve({
                targetIdentity: DEFAULT_TARGET,
                finalNodeId: scenario.finalNodeId,
            });

            expect(summary.outcome).toBe(scenario.outcome);
            expect(loadActiveRun(DEFAULT_TARGET)).toBeNull();
            expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRunId);
            expect(loadActiveRun(SYNTHETIC_TARGET)?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
        }
    });

    it('terminal resolution for the checked-in outer-mountain route leaves the checked-in jade-cave route active', () => {
        const outerMountainTarget = getCheckedInExpeditionTarget('destination.qingyun-outer-mountain-trial');
        const jadeCaveTarget = getCheckedInExpeditionTarget('destination.qingyun-jade-cave-trial');

        startRewardedRun(outerMountainTarget, 'TL_002', 'entrance.mountain-gate');
        const jadeCaveState = startRewardedRun(jadeCaveTarget, 'AR_001', 'entrance.mountain-gate');
        const jadeCaveRunId = jadeCaveState.activeRun?.runId;

        const summary = resolveExtract({
            targetIdentity: outerMountainTarget,
            finalNodeId: 'extract.cliff-rope',
        });

        expect(summary.outcome).toBe('extract');
        expect(loadActiveRun(outerMountainTarget)).toBeNull();
        expect(loadActiveRun(jadeCaveTarget)?.runId).toBe(jadeCaveRunId);
        expect(loadActiveRun(jadeCaveTarget)?.carriedDeck).toContainEqual({ id: 'AR_001', count: 4 });
    });

    it('terminal outcomes write resolved stash documents through the explicit GameWorldState stash writer plan', () => {
        const scenarios = [
            {
                outcome: 'defeat' as const,
                finalNodeId: 'battle.synthetic-defeat',
                resolve: resolveBattleDefeat,
            },
            {
                outcome: 'extract' as const,
                finalNodeId: 'extract.synthetic',
                resolve: resolveExtract,
            },
            {
                outcome: 'boss-clear' as const,
                finalNodeId: 'boss.synthetic',
                resolve: resolveBossClear,
            },
        ];

        for (const scenario of scenarios) {
            const injectedStorage = new MemoryStorage();
            const otherRouteState = withThrowingAmbientLocalStorage(() => startRewardedRun(
                DEFAULT_TARGET,
                'TL_002',
                'entrance.mountain-gate',
                injectedStorage,
            ));
            const state = withThrowingAmbientLocalStorage(() => startRewardedRun(
                SYNTHETIC_TARGET,
                'AR_001',
                'entrance.synthetic',
                injectedStorage,
            ));
            const otherRouteRunId = otherRouteState.activeRun?.runId;
            const runId = state.activeRun?.runId;

            if (!runId) {
                throw new Error('Expected synthetic active run id to exist.');
            }

            injectedStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(state.activeRun));
            injectedStorage.setItem(LEGACY_ROUTE_STORAGE_KEY, JSON.stringify({
                ...state.activeRun!,
                routeKey: LEGACY_ROUTE_LOOKUP,
            }));

            const summary = withThrowingAmbientLocalStorage(() => scenario.resolve({
                storage: injectedStorage,
                targetIdentity: SYNTHETIC_TARGET,
                activeRunRouteKey: LEGACY_ROUTE_LOOKUP,
                finalNodeId: scenario.finalNodeId,
                endedAt: '2026-05-10T01:00:00.000Z',
            }));
            const storedStash = readStoredPersistentStash(injectedStorage);

            expect(storedStash.lastRunSummary).toEqual(summary);
            expect(summary.runId).toBe(runId);
            expect(summary.outcome).toBe(scenario.outcome);
            expect(summary.finalNodeId).toBe(scenario.finalNodeId);
            expectRunResolutionPersistentStashJsonShape(storedStash);
            expect(loadActiveRun(SYNTHETIC_TARGET, undefined, injectedStorage)).toBeNull();
            expect(injectedStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBeNull();
            expect(injectedStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
            expect(injectedStorage.getItem(LEGACY_ROUTE_STORAGE_KEY)).toBeNull();
            expect(loadActiveRun(DEFAULT_TARGET, undefined, injectedStorage)?.runId).toBe(otherRouteRunId);
            expect(loadPersistentStash()).toBeNull();
            expect(loadActiveRun(SYNTHETIC_TARGET)).toBeNull();

            if (scenario.outcome === 'defeat') {
                expect(storedStash.deck).toEqual([]);
                expect(storedStash.items).toEqual([]);
                expect(storedStash.spiritStones).toBe(0);
                expect(summary.kept).toEqual({ cards: [], items: [], spiritStones: 0 });
                expect(summary.lost.cards).toContainEqual({ id: 'AR_001', count: 4 });
                expect(summary.lost.items).toContainEqual(createItemStack('tool_talisman_basic', 'tool', 1));
                expect(summary.lost.spiritStones).toBe(54);
            } else {
                expect(storedStash.deck).toContainEqual({ id: 'AR_001', count: 4 });
                expect(storedStash.items).toContainEqual(createItemStack('tool_talisman_basic', 'tool', 1));
                expect(storedStash.spiritStones).toBe(54);
                expect(summary.kept.cards).toContainEqual({ id: 'AR_001', count: 4 });
                expect(summary.kept.items).toContainEqual(createItemStack('tool_talisman_basic', 'tool', 1));
                expect(summary.kept.spiritStones).toBe(54);
                expect(summary.lost).toEqual({ cards: [], items: [], spiritStones: 0 });
            }
        }
    });

    it('terminal resolution writes the resolved stash and active-run cleanup to an injected adapter without touching ambient localStorage', () => {
        const injectedStorage = new MemoryStorage();
        const state = startRewardedRun(SYNTHETIC_TARGET, 'AR_001', 'entrance.synthetic', injectedStorage);
        const runId = state.activeRun?.runId;

        const summary = withThrowingAmbientLocalStorage(() => resolveExtract({
            storage: injectedStorage,
            targetIdentity: SYNTHETIC_TARGET,
            finalNodeId: 'extract.synthetic',
            endedAt: '2026-05-10T01:00:00.000Z',
        }));
        const injectedStash = loadPersistentStash(injectedStorage);

        if (!runId) {
            throw new Error('Expected injected active run id to exist.');
        }

        expect(summary.runId).toBe(runId);
        expect(summary.outcome).toBe('extract');
        expect(injectedStash?.lastRunSummary).toEqual(summary);
        expect(injectedStash?.deck).toContainEqual({ id: 'AR_001', count: 4 });
        expect(loadActiveRun(SYNTHETIC_TARGET, undefined, injectedStorage)).toBeNull();
        expect(injectedStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBeNull();
        expect(injectedStorage.getItem(STASH_STORAGE_KEY)).not.toBeNull();
        expect(loadPersistentStash()).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)).toBeNull();
    });

    it('uses the GameWorldState persistent-stash writer storage validation before clearing a terminal run', () => {
        const state = startRewardedRun(DEFAULT_TARGET, 'TL_002');
        const run = state.activeRun!;
        const stash = loadPersistentStash()!;
        const malformedStorage = {
            getItem: () => null,
            removeItem: () => undefined,
        } as unknown as RunPersistenceStorageAdapter;

        expect(() => resolveExtract({
            run,
            stash,
            storage: malformedStorage,
            targetIdentity: DEFAULT_TARGET,
            finalNodeId: 'extract.malformed-storage',
        })).toThrow(
            'GameWorldState persistent-stash write requires an explicit storage adapter with getItem, setItem, and removeItem.',
        );
        expect(loadActiveRun(DEFAULT_TARGET)?.runId).toBe(run.runId);
    });

    it('battle victory persists the continued run under the same target identity', () => {
        const defaultState = startRewardedRun(DEFAULT_TARGET, 'TL_002');
        const syntheticState = startRewardedRun(SYNTHETIC_TARGET, 'AR_001');
        const syntheticRunId = syntheticState.activeRun?.runId;

        const victory = resolveBattleVictory({
            run: {
                ...defaultState.activeRun!,
                currentNodeId: 'battle.mist-foxes',
                pendingEncounter: {
                    runId: defaultState.activeRun!.runId,
                    nodeId: 'battle.mist-foxes',
                    nodeType: 'battle',
                    encounterId: 'test_encounter_01',
                    encounterFile: 'data/encounters/test-enemy.json',
                    runDeck: defaultState.activeRun!.carriedDeck,
                },
            },
            finalNodeId: 'battle.mist-foxes',
            endedAt: '2026-05-08T01:00:00.000Z',
        });

        expect(victory.run.pendingEncounter).toBeNull();
        expect(loadActiveRun(DEFAULT_TARGET)).toEqual(victory.run);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRunId);
    });

    it('battle victory saves through the GameWorldState active-run writer with explicit storage and legacy cleanup', () => {
        const injectedStorage = new MemoryStorage();
        const otherRouteState = withThrowingAmbientLocalStorage(() => startRewardedRun(
            DEFAULT_TARGET,
            'TL_002',
            'entrance.mountain-gate',
            injectedStorage,
        ));
        const state = withThrowingAmbientLocalStorage(() => startRewardedRun(
            SYNTHETIC_TARGET,
            'AR_001',
            'entrance.synthetic',
            injectedStorage,
        ));
        const runWithPendingEncounter: RunSnapshot = {
            ...state.activeRun!,
            routeKey: LEGACY_ROUTE_LOOKUP,
            currentNodeId: 'battle.synthetic',
            pendingEncounter: {
                runId: state.activeRun!.runId,
                nodeId: 'battle.synthetic',
                nodeType: 'battle',
                encounterId: 'test_encounter_01',
                encounterFile: 'data/encounters/test-enemy.json',
                runDeck: state.activeRun!.carriedDeck,
            },
        };
        injectedStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(runWithPendingEncounter));
        injectedStorage.setItem(LEGACY_ROUTE_STORAGE_KEY, JSON.stringify(runWithPendingEncounter));

        const victory = withThrowingAmbientLocalStorage(() => resolveBattleVictory({
            run: runWithPendingEncounter,
            storage: injectedStorage,
            targetIdentity: SYNTHETIC_TARGET,
            activeRunRouteKey: LEGACY_ROUTE_LOOKUP,
            finalNodeId: 'battle.synthetic',
        }));
        const storedRun = JSON.parse(
            injectedStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null',
        ) as RunSnapshot;

        expect(victory.run).toEqual(storedRun);
        expect(storedRun.routeKey).toBe(SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY);
        expect(storedRun.currentNodeId).toBe('battle.synthetic');
        expect(storedRun.pendingEncounter).toBeNull();
        expect(Object.keys(storedRun).sort()).toEqual([
            'carriedDeck',
            'carriedItems',
            'currentNodeId',
            'expeditionId',
            'mapId',
            'nodeStates',
            'pendingEncounter',
            'routeKey',
            'runId',
            'spiritStones',
            'startedAt',
            'startingLoadout',
            'status',
            'visitedNodeIds',
        ]);
        expect(injectedStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(injectedStorage.getItem(LEGACY_ROUTE_STORAGE_KEY)).toBeNull();
        expect(loadActiveRun(DEFAULT_TARGET, undefined, injectedStorage)?.runId).toBe(otherRouteState.activeRun?.runId);
        expect(loadPersistentStash()).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)).toBeNull();
    });
});
