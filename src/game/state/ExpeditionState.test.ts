import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import prototypeEventsJson from '../../../public/data/mijing/prototype-events.json';
import prototypeShopJson from '../../../public/data/mijing/prototype-shop.json';
import worldMapJson from '../../../public/data/world/world-map.json';

import {
    ACTIVE_RUN_STORAGE_KEY,
    createActiveRunStorageKey,
    createActiveRunRouteKey,
    loadActiveRun,
    loadPersistentStash,
    resetRunPersistenceForTests,
    savePersistentStash,
    STASH_STORAGE_KEY,
} from '../services/RunPersistence';
import { validateWorldMapDefinition } from '../scenes/worldmap/worldMap';
import type {
    ExpeditionItemStack,
    PersistentStash,
    PrototypeEventDefinition,
    PrototypeShopDefinition,
    RunSnapshot,
} from '../types/expedition';
import { ExpeditionState } from './ExpeditionState';
import {
    DEFAULT_EXPEDITION_TARGET,
    DEFAULT_EXPEDITION_TARGET_ROUTE_KEY,
    SYNTHETIC_EXPEDITION_TARGET,
    SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY,
    createRunSnapshot as createRunSnapshotFixture,
    createTestPersistentStash,
    createItemStacksFromSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';

const DEFAULT_TARGET = DEFAULT_EXPEDITION_TARGET;
const SYNTHETIC_TARGET = SYNTHETIC_EXPEDITION_TARGET;
const LEGACY_ROUTE_LOOKUP = 'worldMap:destination.synthetic-expedition';
const LEGACY_ROUTE_STORAGE_KEY = `${ACTIVE_RUN_STORAGE_KEY}:${LEGACY_ROUTE_LOOKUP}`;
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
}

function withThrowingAmbientLocalStorage<T>(callback: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get(): Storage {
            throw new Error('ambient globalThis.localStorage must not be used by injected ExpeditionState persistence');
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

function createStoredStash(): PersistentStash {
    return createTestPersistentStash({
        stashId: 'player-existing-stash',
        deckRef: 'player-existing-deck',
        deck: [{ id: 'EXISTING_CARD', count: 1 }],
        items: [{ id: 'tool.existing', itemType: 'tool', count: 3 }],
        spiritStones: 777,
        lastRunSummary: {
            runId: 'run-finished',
            outcome: 'extract',
            finalNodeId: 'extract.synthetic',
            kept: {
                cards: [{ id: 'EXISTING_CARD', count: 1 }],
                items: [{ id: 'tool.existing', itemType: 'tool', count: 1 }],
                spiritStones: 12,
            },
            lost: {
                cards: [],
                items: [],
                spiritStones: 0,
            },
            endedAt: '2026-05-10T00:00:00.000Z',
        },
    });
}

function createStoredActiveRun(
    target: { expeditionId: string; mapId: string },
    runId: string,
    currentNodeId: string,
): RunSnapshot {
    return createRunSnapshotFixture(target, {
        runId,
        currentNodeId,
        startingLoadout: {
            cards: [{ id: 'EXISTING_CARD', count: 1 }],
            items: [{ id: 'tool.existing', itemType: 'tool', count: 1 }],
            spiritStones: 12,
        },
        carriedDeck: [{ id: 'EXISTING_CARD', count: 1 }],
        carriedItems: [{ id: 'tool.existing', itemType: 'tool', count: 1 }],
        spiritStones: 12,
        visitedNodeIds: [currentNodeId],
        nodeStates: {
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

function expectCreatedActiveRunJsonShape(storage: Storage, target: { expeditionId: string; mapId: string }): void {
    expect(sortedJsonKeys(storage, createActiveRunStorageKey(target))).toEqual([
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
}

describe('ExpeditionState', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('seeds the persistent starter stash from the world bootstrap data', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(state.activeRun).toBeNull();
        expect(state.persistentStash.stashId).toBe('phase01.starter-stash');
        expect(state.persistentStash.deckRef).toBe('starter-deck');
        expect(state.persistentStash.deck).toEqual(starterDeckJson.cards);
        expect(state.persistentStash.items).toEqual(initialWorldStateStashItems);
        expect(state.persistentStash.spiritStones).toBe(initialWorldState.stash.spiritStones);
    });

    it('saves the seeded stash once and reuses an existing persistent stash on bootstrap', () => {
        const seededState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(loadPersistentStash()).toEqual(seededState.persistentStash);

        const existingStash = {
            ...seededState.persistentStash,
            stashId: 'player-existing-stash',
            deckRef: 'player-existing-deck',
            deck: [{ id: 'EXISTING_CARD', count: 1 }],
            items: [{ id: 'tool.existing', itemType: 'tool', count: 3 }],
            spiritStones: 777,
        };
        savePersistentStash(existingStash);

        const restoredState = ExpeditionState.bootstrap({
            worldState: {
                stash: {
                    stashId: 'seed-that-must-not-replace-existing',
                    deckRef: 'seed-deck-ref',
                    items: [],
                    spiritStones: 1,
                },
            },
            starterDeck: {
                cards: [{ id: 'SEED_CARD', count: 9 }],
            },
        });

        expect(restoredState.persistentStash).toEqual(existingStash);
        expect(loadPersistentStash()).toEqual(existingStash);
    });

    it('persists seed-fallback stash and active runs through an injected storage adapter without touching ambient localStorage', () => {
        const injectedStorage = new MemoryStorage();

        const state = withThrowingAmbientLocalStorage(() => ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET,
            storage: injectedStorage,
        }));
        const run = withThrowingAmbientLocalStorage(() => state.createRunSnapshot({
            ...SYNTHETIC_TARGET,
            entryNodeId: 'entrance.synthetic',
        }));

        expect(JSON.parse(injectedStorage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(state.persistentStash);
        expect(JSON.parse(injectedStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null')?.runId).toBe(run.runId);
        expect(loadPersistentStash()).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)).toBeNull();
    });

    it('creates active-run snapshots through the GameWorldState writer with route normalization, legacy cleanup, and stable JSON shape', () => {
        const injectedStorage = new MemoryStorage();
        const legacyRun = createStoredActiveRun(SYNTHETIC_TARGET, 'run-legacy-before-create', 'event.synthetic');
        injectedStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(legacyRun));
        injectedStorage.setItem(LEGACY_ROUTE_STORAGE_KEY, JSON.stringify({
            ...legacyRun,
            routeKey: LEGACY_ROUTE_LOOKUP,
        }));
        const state = new ExpeditionState(
            createStoredStash(),
            null,
            SYNTHETIC_TARGET,
            LEGACY_ROUTE_LOOKUP,
            injectedStorage,
        );

        const run = withThrowingAmbientLocalStorage(() => state.createRunSnapshot({
            ...SYNTHETIC_TARGET,
            entryNodeId: 'entrance.synthetic',
        }));
        const storedRun = JSON.parse(
            injectedStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET)) ?? 'null',
        ) as RunSnapshot;

        expect(storedRun.runId).toBe(run.runId);
        expect(storedRun.routeKey).toBe(SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY);
        expect(state.activeRun).toEqual(storedRun);
        expect(injectedStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(injectedStorage.getItem(LEGACY_ROUTE_STORAGE_KEY)).toBeNull();
        expectCreatedActiveRunJsonShape(injectedStorage, SYNTHETIC_TARGET);
        expect(loadActiveRun(SYNTHETIC_TARGET, undefined, injectedStorage)?.runId).toBe(run.runId);
        expect(loadActiveRun(SYNTHETIC_TARGET)).toBeNull();
    });

    it('bootstraps a stored stash through the GameWorldState writer without changing JSON shape or other active-run routes', () => {
        const injectedStorage = new MemoryStorage();
        const storedStash = createStoredStash();
        const syntheticRun = createStoredActiveRun(SYNTHETIC_TARGET, 'run-synthetic', 'event.synthetic');
        const defaultRun = createStoredActiveRun(DEFAULT_TARGET, 'run-default', 'entrance.mountain-gate');
        const syntheticActiveRunKey = createActiveRunStorageKey(SYNTHETIC_TARGET);
        const defaultActiveRunKey = createActiveRunStorageKey(DEFAULT_TARGET);
        injectedStorage.setItem(STASH_STORAGE_KEY, JSON.stringify(storedStash));
        injectedStorage.setItem(syntheticActiveRunKey, JSON.stringify(syntheticRun));
        injectedStorage.setItem(defaultActiveRunKey, JSON.stringify(defaultRun));

        const state = withThrowingAmbientLocalStorage(() => ExpeditionState.bootstrap({
            worldState: {
                stash: {
                    stashId: 'seed-that-must-not-replace-existing',
                    deckRef: 'seed-deck-ref',
                    items: [],
                    spiritStones: 1,
                },
            },
            starterDeck: {
                cards: [{ id: 'SEED_CARD', count: 9 }],
            },
            targetIdentity: SYNTHETIC_TARGET,
            storage: injectedStorage,
        }));

        expect(state.persistentStash).toEqual(storedStash);
        expect(state.activeRun?.runId).toBe(syntheticRun.runId);
        expect(JSON.parse(injectedStorage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(storedStash);
        expect(sortedJsonKeys(injectedStorage, STASH_STORAGE_KEY)).toEqual([
            'deck',
            'deckRef',
            'items',
            'lastRunSummary',
            'spiritStones',
            'stashId',
        ]);
        expect(JSON.parse(injectedStorage.getItem(defaultActiveRunKey) ?? 'null')?.runId).toBe(defaultRun.runId);
        expect(loadPersistentStash()).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)).toBeNull();
    });

    it('materializes the seed-fallback stash through the GameWorldState writer with the compatibility JSON shape', () => {
        const injectedStorage = new MemoryStorage();

        const state = withThrowingAmbientLocalStorage(() => ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            storage: injectedStorage,
        }));

        expect(state.persistentStash.stashId).toBe('phase01.starter-stash');
        expect(JSON.parse(injectedStorage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(state.persistentStash);
        expect(sortedJsonKeys(injectedStorage, STASH_STORAGE_KEY)).toEqual([
            'deck',
            'deckRef',
            'items',
            'lastRunSummary',
            'spiritStones',
            'stashId',
        ]);
        expect(state.persistentStash.deck).toEqual(starterDeckJson.cards);
        expect(state.persistentStash.items).toEqual(initialWorldStateStashItems);
        expect(state.persistentStash.spiritStones).toBe(initialWorldState.stash.spiritStones);
    });

    it('cleans corrupt stash and active-run reads on bootstrap before materializing seed fallback', () => {
        const injectedStorage = new MemoryStorage();
        const activeRunKey = createActiveRunStorageKey(SYNTHETIC_TARGET);
        const otherActiveRunKey = createActiveRunStorageKey(DEFAULT_TARGET);
        const defaultRun = createStoredActiveRun(DEFAULT_TARGET, 'run-default', 'entrance.mountain-gate');
        injectedStorage.setItem(STASH_STORAGE_KEY, '{not valid json');
        injectedStorage.setItem(activeRunKey, '{not valid json');
        injectedStorage.setItem(otherActiveRunKey, JSON.stringify(defaultRun));

        const state = withThrowingAmbientLocalStorage(() => ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET,
            storage: injectedStorage,
        }));

        expect(state.activeRun).toBeNull();
        expect(state.persistentStash.stashId).toBe('phase01.starter-stash');
        expect(JSON.parse(injectedStorage.getItem(STASH_STORAGE_KEY) ?? 'null')).toEqual(state.persistentStash);
        expect(injectedStorage.getItem(activeRunKey)).toBeNull();
        expect(JSON.parse(injectedStorage.getItem(otherActiveRunKey) ?? 'null')?.runId).toBe(defaultRun.runId);
    });

    it('creates and persists a run snapshot from the current stash loadout', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(run.currentNodeId).toBe('entrance.mountain-gate');
        expect(run.carriedDeck).toEqual(state.persistentStash.deck);
        expect(run.carriedItems).toEqual(state.persistentStash.items);
        expect(run.spiritStones).toBe(state.persistentStash.spiritStones);
        expect(run.visitedNodeIds).toEqual(['entrance.mountain-gate']);
        expect(run.nodeStates['entrance.mountain-gate']).toEqual({
            nodeId: 'entrance.mountain-gate',
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
        });
        expect(loadActiveRun()?.runId).toBe(run.runId);
    });

    it('normalizes active-run ownership to expeditionId and mapId instead of destination id', () => {
        const outerMountainTarget = DEFAULT_TARGET;
        const jadeCaveTarget = {
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        };
        const outerMountainState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.qingyun-outer-mountain-trial',
            activeRunIdentity: outerMountainTarget,
        });

        const outerMountainRun = outerMountainState.createRunSnapshot({
            ...outerMountainTarget,
            entryNodeId: 'entrance.mountain-gate',
        });
        const jadeCaveState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.jade-cave-trial',
            activeRunIdentity: jadeCaveTarget,
        });

        expect(outerMountainRun.routeKey).toBe(DEFAULT_EXPEDITION_TARGET_ROUTE_KEY);
        expect(jadeCaveState.activeRun).toBeNull();

        const jadeCaveRun = jadeCaveState.createRunSnapshot({
            ...jadeCaveTarget,
            entryNodeId: 'entrance.jade-cave',
        });
        const restoredOuterMountainState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.qingyun-outer-mountain-trial',
            activeRunIdentity: outerMountainTarget,
        });
        const restoredJadeCaveState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.jade-cave-trial',
            activeRunIdentity: jadeCaveTarget,
        });

        expect(jadeCaveRun.routeKey).toBe(createActiveRunRouteKey(jadeCaveTarget));
        expect(loadActiveRun(outerMountainTarget)?.runId).toBe(outerMountainRun.runId);
        expect(loadActiveRun(jadeCaveTarget)?.runId).toBe(jadeCaveRun.runId);
        expect(restoredOuterMountainState.activeRun?.runId).toBe(outerMountainRun.runId);
        expect(restoredJadeCaveState.activeRun?.runId).toBe(jadeCaveRun.runId);
    });

    it('claims one prototype event reward, persists the run, and blocks duplicate claims', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'] as unknown as PrototypeEventDefinition;
        const outcome = event.pool[0];

        const firstClaim = state.claimEventNodeReward(event.nodeId, structuredClone(outcome.rewards));

        expect(firstClaim.status).toBe('claimed');
        expect(state.activeRun?.currentNodeId).toBe(event.nodeId);
        expect(state.activeRun?.spiritStones).toBe(54);
        expect(state.activeRun?.nodeStates[event.nodeId]).toEqual({
            nodeId: event.nodeId,
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
            purchasedOfferIds: [],
        });
        expect(loadActiveRun()?.spiritStones).toBe(54);

        const secondClaim = state.claimEventNodeReward(event.nodeId, structuredClone(outcome.rewards));

        expect(secondClaim.status).toBe('alreadyClaimed');
        expect(state.activeRun?.spiritStones).toBe(54);
        expect(loadActiveRun()?.spiritStones).toBe(54);
        expect(state.persistentStash.spiritStones).toBe(36);
    });

    it('purchases prototype shop offers with run spiritStones and blocks duplicate or unaffordable purchases', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });
        const shop = prototypeShopJson.shopsByNodeId['shop.wandering-peddler'] as unknown as PrototypeShopDefinition;
        const swordOffer = shop.offers.find((offer) => offer.id === 'offer.qingyun-sword');
        const charmOffer = shop.offers.find((offer) => offer.id === 'offer.fly-sword-charm');

        if (!swordOffer || !charmOffer) {
            throw new Error('Expected checked-in prototype shop offers to exist.');
        }

        const purchase = state.purchaseShopOffer(
            shop.nodeId,
            swordOffer.id,
            structuredClone(swordOffer.cost),
            structuredClone(swordOffer.rewards),
        );

        expect(purchase.status).toBe('purchased');
        expect(state.activeRun?.currentNodeId).toBe(shop.nodeId);
        expect(state.activeRun?.spiritStones).toBe(12);
        expect(state.activeRun?.carriedDeck.find((stack) => stack.id === 'AR_001')?.count).toBe(4);
        expect(state.activeRun?.nodeStates[shop.nodeId].purchasedOfferIds).toEqual([swordOffer.id]);
        expect(loadActiveRun()?.nodeStates[shop.nodeId].purchasedOfferIds).toEqual([swordOffer.id]);

        const duplicatePurchase = state.purchaseShopOffer(
            shop.nodeId,
            swordOffer.id,
            structuredClone(swordOffer.cost),
            structuredClone(swordOffer.rewards),
        );
        const unaffordablePurchase = state.purchaseShopOffer(
            shop.nodeId,
            charmOffer.id,
            structuredClone(charmOffer.cost),
            structuredClone(charmOffer.rewards),
        );

        expect(duplicatePurchase.status).toBe('alreadyPurchased');
        expect(unaffordablePurchase.status).toBe('insufficientFunds');
        expect(state.activeRun?.spiritStones).toBe(12);
        expect(state.activeRun?.carriedItems.some((stack) => stack.id === 'artifact_fly_sword_basic')).toBe(false);
        expect(state.persistentStash.deck.find((stack) => stack.id === 'AR_001')?.count).toBe(3);
        expect(state.persistentStash.spiritStones).toBe(36);
    });

    it('records an extract intent for terminal resolution without resolving the run immediately', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });
        const requestedAt = '2026-05-08T00:00:00.000Z';

        const recordResult = state.recordExtractIntent('extract.cliff-rope', requestedAt);

        expect(recordResult.status).toBe('recorded');
        expect(state.activeRun?.status).toBe('inProgress');
        expect(state.activeRun?.currentNodeId).toBe('extract.cliff-rope');
        expect(state.activeRun?.pendingTerminalResolution).toEqual({
            kind: 'extract',
            nodeId: 'extract.cliff-rope',
            requestedAt,
        });
        expect(state.activeRun?.nodeStates['extract.cliff-rope']).toEqual({
            nodeId: 'extract.cliff-rope',
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
            purchasedOfferIds: [],
        });
        expect(loadActiveRun()?.pendingTerminalResolution?.nodeId).toBe('extract.cliff-rope');

        const duplicateResult = state.recordExtractIntent('extract.cliff-rope', '2026-05-08T00:01:00.000Z');

        expect(duplicateResult.status).toBe('alreadyRecorded');
        expect(state.activeRun?.pendingTerminalResolution?.requestedAt).toBe(requestedAt);
    });

    it('loads and persists active runs independently by expeditionId and mapId', () => {
        const defaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: DEFAULT_TARGET,
        });
        const defaultRun = defaultState.createRunSnapshot({
            ...DEFAULT_TARGET,
            entryNodeId: 'entrance.mountain-gate',
        });
        defaultState.applyNodeRewardPreview({
            cards: [{ id: 'TL_002', count: 1 }],
            items: [],
            spiritStones: 9,
        });

        const syntheticState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET,
        });
        const syntheticRun = syntheticState.createRunSnapshot({
            ...SYNTHETIC_TARGET,
            entryNodeId: 'entrance.synthetic',
        });
        syntheticState.applyNodeRewardPreview({
            cards: [{ id: 'AR_001', count: 1 }],
            items: [{ id: 'artifact.synthetic', itemType: 'artifact', count: 1 }],
            spiritStones: 21,
        });

        const resumedDefaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: DEFAULT_TARGET,
        });
        const directDefaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(resumedDefaultState.activeRun?.runId).toBe(defaultRun.runId);
        expect(resumedDefaultState.activeRun?.carriedDeck).toContainEqual({ id: 'TL_002', count: 1 });
        expect(directDefaultState.activeRun?.runId).toBe(defaultRun.runId);
        expect(loadActiveRun(DEFAULT_TARGET)?.runId).toBe(defaultRun.runId);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRun.runId);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.carriedItems).toContainEqual({
            id: 'artifact.synthetic',
            itemType: 'artifact',
            count: 1,
        });
    });

    it('loads and persists active runs independently for checked-in world-map Expedition destinations', () => {
        const outerMountainTarget = getCheckedInExpeditionTarget('destination.qingyun-outer-mountain-trial');
        const jadeCaveTarget = getCheckedInExpeditionTarget('destination.qingyun-jade-cave-trial');
        const outerMountainState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: outerMountainTarget,
        });
        const outerMountainRun = outerMountainState.createRunSnapshot({
            ...outerMountainTarget,
            entryNodeId: 'entrance.mountain-gate',
        });
        const jadeCaveState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: jadeCaveTarget,
        });
        const jadeCaveRun = jadeCaveState.createRunSnapshot({
            ...jadeCaveTarget,
            entryNodeId: 'entrance.mountain-gate',
        });

        const restoredOuterMountainState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: outerMountainTarget,
        });
        const restoredJadeCaveState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: jadeCaveTarget,
        });

        expect(outerMountainRun.routeKey).toBe(DEFAULT_EXPEDITION_TARGET_ROUTE_KEY);
        expect(jadeCaveRun.routeKey).toBe(createActiveRunRouteKey(jadeCaveTarget));
        expect(restoredOuterMountainState.activeRun?.runId).toBe(outerMountainRun.runId);
        expect(restoredJadeCaveState.activeRun?.runId).toBe(jadeCaveRun.runId);
        expect(loadActiveRun(outerMountainTarget)?.runId).toBe(outerMountainRun.runId);
        expect(loadActiveRun(jadeCaveTarget)?.runId).toBe(jadeCaveRun.runId);
    });

    it('clears only the current target active run when returning to the entrance', () => {
        const defaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: DEFAULT_TARGET,
        });
        const defaultRun = defaultState.createRunSnapshot({
            ...DEFAULT_TARGET,
            entryNodeId: 'entrance.mountain-gate',
        });
        const syntheticState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET,
        });
        const syntheticRun = syntheticState.createRunSnapshot({
            ...SYNTHETIC_TARGET,
            entryNodeId: 'entrance.synthetic',
        });

        defaultState.resetToEntranceState();

        expect(loadActiveRun(DEFAULT_TARGET)).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRun.runId);
        expect(defaultRun.runId).not.toBe(syntheticRun.runId);
    });

    it('resets to entrance through the GameWorldState active-run clear writer and removes matching legacy keys', () => {
        const injectedStorage = new MemoryStorage();
        const syntheticRun = createStoredActiveRun(SYNTHETIC_TARGET, 'run-synthetic-clear', 'extract.synthetic');
        const defaultRun = createStoredActiveRun(DEFAULT_TARGET, 'run-default-survives', 'event.default');
        injectedStorage.setItem(createActiveRunStorageKey(SYNTHETIC_TARGET), JSON.stringify(syntheticRun));
        injectedStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(syntheticRun));
        injectedStorage.setItem(LEGACY_ROUTE_STORAGE_KEY, JSON.stringify({
            ...syntheticRun,
            routeKey: LEGACY_ROUTE_LOOKUP,
        }));
        injectedStorage.setItem(createActiveRunStorageKey(DEFAULT_TARGET), JSON.stringify(defaultRun));
        const state = new ExpeditionState(
            createStoredStash(),
            syntheticRun,
            SYNTHETIC_TARGET,
            LEGACY_ROUTE_LOOKUP,
            injectedStorage,
        );

        withThrowingAmbientLocalStorage(() => state.resetToEntranceState());

        expect(state.activeRun).toBeNull();
        expect(injectedStorage.getItem(createActiveRunStorageKey(SYNTHETIC_TARGET))).toBeNull();
        expect(injectedStorage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
        expect(injectedStorage.getItem(LEGACY_ROUTE_STORAGE_KEY)).toBeNull();
        expect(loadActiveRun(DEFAULT_TARGET, undefined, injectedStorage)?.runId).toBe(defaultRun.runId);
        expect(loadActiveRun(SYNTHETIC_TARGET)).toBeNull();
    });
});
