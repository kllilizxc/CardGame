import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import prototypeEventsJson from '../../../public/data/mijing/prototype-events.json';
import prototypeShopJson from '../../../public/data/mijing/prototype-shop.json';
import worldMapJson from '../../../public/data/world/world-map.json';

import {
    createActiveRunStorageKey,
    loadActiveRun,
    loadPersistentStash,
    resetRunPersistenceForTests,
    savePersistentStash,
    STASH_STORAGE_KEY,
} from '../services/RunPersistence';
import { resolveBattleDefeat, resolveExtract } from '../services/RunResolution';
import { validateWorldMapDefinition } from '../scenes/worldmap/worldMap';
import { getSelectedDeckCards } from './PersistentStashDecks';
import { indexItemActionPolicies } from './ItemActionRules';
import type { RunRewardBundle } from '../types/expedition';
import type { ExpeditionWorldStateSeed } from './GameWorldStateSeed';
import { ExpeditionState } from './ExpeditionState';

const DEFAULT_TARGET = {
    expeditionId: 'phase01-first-playable-expedition',
    mapId: 'phase01-prototype-map',
};

const SYNTHETIC_TARGET = {
    expeditionId: 'synthetic-expedition',
    mapId: 'synthetic-map',
};

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
        expect(state.persistentStash.cards).toEqual(starterDeckJson.cards);
        expect(state.persistentStash.savedDecks).toEqual([
            { id: 'starter-deck', name: starterDeckJson.name, cards: starterDeckJson.cards },
        ]);
        expect(state.persistentStash.selectedDeckId).toBe('starter-deck');
        expect(state.persistentStash.items).toEqual(initialWorldState.stash.items);
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
            cards: [{ id: 'EXISTING_CARD', count: 1 }],
            savedDecks: [{ id: 'player-existing-deck', name: 'player-existing-deck', cards: [{ id: 'EXISTING_CARD', count: 1 }] }],
            selectedDeckId: 'player-existing-deck',
            items: [{ id: 'tool.existing', itemType: 'tool' as const, count: 3 }],
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
        expect(run.carriedDeck).toEqual(getSelectedDeckCards(state.persistentStash));
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

        expect(outerMountainRun.routeKey).toBe('expedition:phase01-first-playable-expedition:phase01-prototype-map');
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

        expect(jadeCaveRun.routeKey).toBe('expedition:phase01-jade-cave-expedition:phase01-jade-cave-map');
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
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'];
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
        const shop = prototypeShopJson.shopsByNodeId['shop.wandering-peddler'];
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
        expect(state.persistentStash.cards.find((stack) => stack.id === 'AR_001')?.count).toBe(3);
        expect(state.persistentStash.spiritStones).toBe(36);
    });

    it('exchanges materials atomically at bag capacity and cannot spend them twice', () => {
        const state = ExpeditionState.bootstrap({
            worldState: { ...structuredClone(initialWorldState), stash: {
                ...structuredClone(initialWorldState.stash), itemSlotCapacity: 2,
            } } as unknown as ExpeditionWorldStateSeed,
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({ ...DEFAULT_TARGET, entryNodeId: 'entrance.mountain-gate' });
        const nodeId = 'shop.material-exchange';
        const rewards: RunRewardBundle = { cards: [], items: [
            { id: 'artifact_fly_sword_basic', itemType: 'artifact', count: 1 },
        ], spiritStones: 0 };
        const insufficientCost = { spiritStones: 4, items: [
            { id: 'consumable.spirit-salve', itemType: 'consumable' as const, count: 3 },
        ] };
        const before = structuredClone(state.activeRun!);

        expect(state.purchaseShopOffer(nodeId, 'offer.exchange', insufficientCost, rewards).status).toBe('insufficientItems');
        expect(state.activeRun).toEqual(before);
        expect(loadActiveRun()).toEqual(before);

        const overfullCost = { ...insufficientCost, items: [{ ...insufficientCost.items[0], count: 1 }] };
        expect(state.purchaseShopOffer(nodeId, 'offer.exchange', overfullCost, rewards).status).toBe('inventoryFull');
        expect(state.activeRun).toEqual(before);

        const cost = { ...insufficientCost, items: [{ ...insufficientCost.items[0], count: 2 }] };
        expect(state.purchaseShopOffer(nodeId, 'offer.exchange', cost, rewards).status).toBe('purchased');
        expect(state.activeRun?.spiritStones).toBe(before.spiritStones - 4);
        expect(state.activeRun?.carriedItems).toEqual([
            { id: 'tool.return-rope', itemType: 'tool', count: 1 },
            { id: 'artifact_fly_sword_basic', itemType: 'artifact', count: 1 },
        ]);
        expect(state.activeRun?.nodeStates[nodeId].purchasedOfferIds).toEqual(['offer.exchange']);
        expect(loadActiveRun()?.carriedItems).toEqual(state.activeRun?.carriedItems);
        expect(state.purchaseShopOffer(nodeId, 'offer.exchange', cost, rewards).status).toBe('alreadyPurchased');
    });

    it('requires an equipped material to be unequipped before exchange', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            itemPolicies: indexItemActionPolicies({ tools: [
                { id: 'tool.return-rope', equipSlot: 'tool' },
            ] }),
        });
        state.createRunSnapshot({ ...DEFAULT_TARGET, entryNodeId: 'entrance.mountain-gate' });
        expect(state.equipCarriedItem('tool', 'tool.return-rope').status).toBe('equipped');
        const cost = { spiritStones: 0, items: [{ id: 'tool.return-rope', itemType: 'tool' as const, count: 1 }] };
        const rewards: RunRewardBundle = { cards: [], items: [
            { id: 'artifact_fly_sword_basic', itemType: 'artifact', count: 1 },
        ], spiritStones: 0 };
        const before = structuredClone(state.activeRun!);

        expect(state.purchaseShopOffer('shop.exchange', 'offer.rope', cost, rewards).status).toBe('equippedItem');
        expect(state.activeRun).toEqual(before);
        expect(state.unequipCarriedSlot('tool').status).toBe('unequipped');
        expect(state.purchaseShopOffer('shop.exchange', 'offer.rope', cost, rewards).status).toBe('purchased');
        expect(state.activeRun?.carriedItems.some(item => item.id === 'tool.return-rope')).toBe(false);
    });

    it('keeps the entire run unchanged when an event or purchase would overfill the bag', () => {
        const state = ExpeditionState.bootstrap({
            worldState: { ...structuredClone(initialWorldState), stash: {
                ...structuredClone(initialWorldState.stash), itemSlotCapacity: 2,
            } } as unknown as ExpeditionWorldStateSeed,
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({ ...DEFAULT_TARGET, entryNodeId: 'entrance.mountain-gate' });
        const before = structuredClone(state.activeRun!);
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'];
        const eventReward = event.pool.find(outcome => outcome.id === 'cache.talisman-roll')!.rewards;
        const shop = prototypeShopJson.shopsByNodeId['shop.wandering-peddler'];
        const itemOffer = shop.offers.find(offer => offer.id === 'offer.fly-sword-charm')!;

        expect(state.claimEventNodeReward(event.nodeId, structuredClone(eventReward) as RunRewardBundle).status).toBe('inventoryFull');
        expect(state.purchaseShopOffer(shop.nodeId, itemOffer.id, itemOffer.cost, structuredClone(itemOffer.rewards) as RunRewardBundle).status).toBe('inventoryFull');
        expect(state.activeRun).toEqual(before);
        expect(loadActiveRun()).toEqual(before);
        expect(state.persistentStash.spiritStones).toBe(36);

        const cardOnlyOffer = shop.offers.find(offer => offer.id === 'offer.qingyun-sword')!;
        expect(state.purchaseShopOffer(shop.nodeId, cardOnlyOffer.id, cardOnlyOffer.cost, structuredClone(cardOnlyOffer.rewards) as RunRewardBundle).status).toBe('purchased');
        expect(state.activeRun?.spiritStones).toBe(12);
    });

    it('persists a deliberate discard and allows the previously blocked purchase', () => {
        const state = ExpeditionState.bootstrap({
            worldState: { ...structuredClone(initialWorldState), stash: {
                ...structuredClone(initialWorldState.stash), itemSlotCapacity: 2,
            } } as unknown as ExpeditionWorldStateSeed,
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({ ...DEFAULT_TARGET, entryNodeId: 'entrance.mountain-gate' });
        const shop = prototypeShopJson.shopsByNodeId['shop.wandering-peddler'];
        const offer = shop.offers.find(item => item.id === 'offer.fly-sword-charm')!;
        const buy = () => state.purchaseShopOffer(shop.nodeId, offer.id, offer.cost, structuredClone(offer.rewards) as RunRewardBundle);

        expect(buy().status).toBe('inventoryFull');
        expect(state.dropCarriedItem('tool', 'tool.return-rope', 1).status).toBe('restricted');
        expect(state.dropCarriedItem('consumable', 'consumable.spirit-salve', 3).status).toBe('notOwned');
        expect(state.dropCarriedItem('consumable', 'consumable.spirit-salve', 1).status).toBe('dropped');
        expect(buy().status).toBe('inventoryFull');
        expect(state.dropCarriedItem('consumable', 'consumable.spirit-salve', 1).status).toBe('dropped');
        expect(loadActiveRun()?.carriedItems).toEqual([{ id: 'tool.return-rope', itemType: 'tool', count: 1 }]);

        expect(buy().status).toBe('purchased');
        expect(state.activeRun?.spiritStones).toBe(18);
        expect(state.activeRun?.carriedItems).toContainEqual({ id: 'artifact_fly_sword_basic', itemType: 'artifact', count: 1 });
        expect(loadActiveRun()?.nodeStates[shop.nodeId].purchasedOfferIds).toEqual([offer.id]);
        resolveExtract({ finalNodeId: 'extract.cliff-rope' });
        expect(loadPersistentStash()?.items).toEqual([
            { id: 'tool.return-rope', itemType: 'tool', count: 1 },
            { id: 'artifact_fly_sword_basic', itemType: 'artifact', count: 1 },
        ]);
    });

    it('applies an explicit candidate item policy to a normally protected tool', () => {
        const policies = indexItemActionPolicies({ tools: [
            { id: 'tool.return-rope', name: '归返绳', droppable: true },
        ] });
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            itemPolicies: policies,
        });
        state.createRunSnapshot({ ...DEFAULT_TARGET, entryNodeId: 'entrance.mountain-gate' });

        expect(state.dropCarriedItem('tool', 'tool.return-rope', 1).status).toBe('dropped');
        expect(loadActiveRun()?.carriedItems).toEqual([{ id: 'consumable.spirit-salve', itemType: 'consumable', count: 2 }]);
        expect(state.dropCarriedItem('tool', 'tool.return-rope', 1).status).toBe('notOwned');
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

        expect(outerMountainRun.routeKey).toBe('expedition:phase01-first-playable-expedition:phase01-prototype-map');
        expect(jadeCaveRun.routeKey).toBe('expedition:phase01-jade-cave-expedition:phase01-jade-cave-map');
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
});

describe('Expedition equipment persistence', () => {
    const itemPolicies = indexItemActionPolicies({ artifacts: [
        { id: 'artifact.fox-charm', equipSlot: 'charm', attributeModifiers: { 心性: 5 } },
    ] });
    const worldState: ExpeditionWorldStateSeed = { stash: {
        stashId: 'equipment-test', items: [{ id: 'artifact.fox-charm', itemType: 'artifact', count: 1 }], spiritStones: 0,
    } };

    it('persists preparation equipment without starting a run', () => {
        const storage = new MemoryStorage();
        const state = ExpeditionState.bootstrap({ worldState, starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET, itemPolicies, storage });
        expect(state.equipStashItem('artifact', 'artifact.fox-charm').status).toBe('equipped');
        expect(loadPersistentStash(storage)?.equippedItems).toEqual({ charm: 'artifact.fox-charm' });
        expect(state.unequipStashSlot('charm').status).toBe('unequipped');
        expect(loadPersistentStash(storage)?.equippedItems).toEqual({});
        expect(loadActiveRun(SYNTHETIC_TARGET, undefined, storage)).toBeNull();
    });

    it('repairs a stale run equipment slot and preserves the active run', () => {
        const storage = new MemoryStorage();
        const state = ExpeditionState.bootstrap({ worldState, starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET, itemPolicies, storage });
        const run = state.createRunSnapshot({ ...SYNTHETIC_TARGET, entryNodeId: 'entrance.synthetic' });
        const key = createActiveRunStorageKey(SYNTHETIC_TARGET);
        storage.setItem(key, JSON.stringify({ ...run, equippedItems: { charm: 'artifact.missing' } }));
        const restored = loadActiveRun(SYNTHETIC_TARGET, undefined, storage);
        expect(restored?.runId).toBe(run.runId);
        expect(restored?.carriedItems).toEqual(run.carriedItems);
        expect(restored?.equippedItems).toEqual({});
        expect(storage.getItem(key)).not.toBeNull();
    });

    it('saves equip and unequip, and prevents dropping the equipped final copy', () => {
        const storage = new MemoryStorage();
        const state = ExpeditionState.bootstrap({ worldState, starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET, itemPolicies, storage });
        state.createRunSnapshot({ ...SYNTHETIC_TARGET, entryNodeId: 'entrance.synthetic' });
        expect(state.equipCarriedItem('artifact', 'artifact.fox-charm').status).toBe('equipped');
        expect(loadActiveRun(SYNTHETIC_TARGET, undefined, storage)?.equippedItems).toEqual({ charm: 'artifact.fox-charm' });
        expect(state.dropCarriedItem('artifact', 'artifact.fox-charm', 1).status).toBe('restricted');
        const restored = ExpeditionState.bootstrap({ worldState, starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET, itemPolicies, storage });
        expect(restored.unequipCarriedSlot('charm').status).toBe('unequipped');
        expect(loadActiveRun(SYNTHETIC_TARGET, undefined, storage)?.equippedItems).toEqual({});
        expect(restored.dropCarriedItem('artifact', 'artifact.fox-charm', 1).status).toBe('dropped');
    });

    it('banks the equipped item on extraction and removes its slot on defeat', () => {
        const storage = new MemoryStorage();
        const start = () => {
            const state = ExpeditionState.bootstrap({ worldState, starterDeck: structuredClone(starterDeckJson),
                targetIdentity: SYNTHETIC_TARGET, itemPolicies, storage });
            state.createRunSnapshot({ ...SYNTHETIC_TARGET, entryNodeId: 'entrance.synthetic' });
            expect(state.equipCarriedItem('artifact', 'artifact.fox-charm').status).toBe('equipped');
        };
        start();
        resolveExtract({ targetIdentity: SYNTHETIC_TARGET, storage });
        expect(loadPersistentStash(storage)?.equippedItems).toEqual({ charm: 'artifact.fox-charm' });
        const resumed = ExpeditionState.bootstrap({ worldState, starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET, itemPolicies, storage });
        expect(resumed.createRunSnapshot({ ...SYNTHETIC_TARGET, entryNodeId: 'entrance.synthetic' }).equippedItems)
            .toEqual({ charm: 'artifact.fox-charm' });
        resolveBattleDefeat({ targetIdentity: SYNTHETIC_TARGET, storage });
        expect(loadPersistentStash(storage)?.items).not.toContainEqual({ id: 'artifact.fox-charm', itemType: 'artifact', count: 1 });
        expect(loadPersistentStash(storage)?.equippedItems).toEqual({});
    });
});
