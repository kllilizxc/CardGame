import {
    clearActiveRun,
    loadActiveRun,
    loadPersistentStash,
    normalizeActiveRunIdentity,
    normalizeActiveRunRouteKey,
    parseActiveRunRouteKey,
    saveActiveRun,
    savePersistentStash,
    type ActiveRunTargetIdentity,
    type RunPersistenceStorageAdapter,
} from '../services/RunPersistence';
import { enterReachableNode } from '../scenes/expedition/mapTraversal';
import { assertItemCapacityChange, canAcceptItemRewards, resolveItemSlotCapacity } from './ItemCapacity';
import { canDropInventoryItem, type ItemActionPolicy } from './ItemActionRules';
import { previewShopExchange, type ShopOfferCost } from './ShopExchange';
import { previewCraftingRecipe, type CraftingRecipe } from './Crafting';
import { equipOwnedItem, unequipOwnedSlot } from './EquipmentState';
import { getRunPlayerHealth, MAX_RUN_PLAYER_HEALTH } from './RunHealth';
import {
    createPersistentStashFromWorldStateSeed,
    type ExpeditionWorldStateSeed,
    type StarterDeckSeed,
} from './GameWorldStateSeed';
import {
    addRewardBundleToCarriedBundle,
    createStartingLoadoutFromStash,
    mergeItemStacks,
} from './GameWorldStateStashOperations';
import {
    DEFAULT_SAVED_DECK_ID,
    upgradeSeededDeckToMinimum,
} from './PersistentStashDecks';
import type {
    ExpeditionItemType,
    ExpeditionMapDefinition,
    ExpeditionRouteIdentity,
    ExpeditionTargetConfig,
    PersistentStash,
    RunNodeState,
    RunRewardBundle,
    RunSnapshot,
} from '../types/expedition';

export type { ExpeditionWorldStateSeed, StarterDeckSeed } from './GameWorldStateSeed';

export interface ExpeditionBootstrapSources {
    worldState: ExpeditionWorldStateSeed;
    starterDeck: StarterDeckSeed;
    targetIdentity?: ActiveRunTargetIdentity;
    activeRunRouteKey?: string | null;
    activeRunIdentity?: ActiveRunTargetIdentity;
    storage?: RunPersistenceStorageAdapter;
    itemPolicies?: Readonly<Record<string, ItemActionPolicy>>;
}

export interface CreateRunSnapshotParams extends ExpeditionRouteIdentity {
    entryNodeId: string;
}

export type EventRewardClaimResult =
    | { status: 'claimed'; activeRun: RunSnapshot }
    | { status: 'alreadyClaimed'; activeRun: RunSnapshot }
    | { status: 'inventoryFull'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

export type ShopPurchaseResult =
    | { status: 'purchased'; activeRun: RunSnapshot }
    | { status: 'alreadyPurchased'; activeRun: RunSnapshot }
    | { status: 'insufficientFunds'; activeRun: RunSnapshot }
    | { status: 'insufficientItems' | 'equippedItem'; activeRun: RunSnapshot }
    | { status: 'inventoryFull'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

export type ItemDropResult =
    | { status: 'dropped'; activeRun: RunSnapshot }
    | { status: 'restricted' | 'notOwned' | 'invalidQuantity'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

export type ItemUseResult =
    | { status: 'used'; healed: number; activeRun: RunSnapshot }
    | { status: 'fullHealth' | 'notUsable' | 'notOwned'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

export type EquipmentChangeResult =
    | { status: 'equipped' | 'unequipped' | 'alreadyEquipped' | 'notEquipped' | 'notOwned' | 'notEquippable'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

export type StashEquipmentChangeResult = {
    status: 'equipped' | 'unequipped' | 'alreadyEquipped' | 'notEquipped' | 'notOwned' | 'notEquippable';
    stash: PersistentStash;
};

export type CraftingChangeResult = {
    status: 'crafted' | 'insufficientFunds' | 'insufficientItems' | 'equippedItem' | 'inventoryFull';
    activeRun: RunSnapshot | null;
    stash: PersistentStash;
};

export type ExtractIntentResult =
    | { status: 'recorded'; activeRun: RunSnapshot }
    | { status: 'alreadyRecorded'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

function createRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendUniqueNodeId(nodeIds: string[], nodeId: string): string[] {
    return nodeIds.includes(nodeId) ? [...nodeIds] : [...nodeIds, nodeId];
}

function createVisitedNodeState(
    nodeId: string,
    existing?: RunNodeState,
    options: {
        rewardClaimed?: boolean;
        purchasedOfferIds?: string[];
    } = {},
): RunNodeState {
    return {
        nodeId,
        status: 'cleared',
        visited: true,
        rewardClaimed: options.rewardClaimed ?? existing?.rewardClaimed ?? false,
        purchasedOfferIds: options.purchasedOfferIds ?? existing?.purchasedOfferIds ?? [],
    };
}

function addRewardsToCarriedRun(
    run: RunSnapshot,
    rewards: RunRewardBundle,
): Pick<RunSnapshot, 'carriedDeck' | 'carriedItems' | 'spiritStones'> {
    const carried = addRewardBundleToCarriedBundle(
        {
            cards: run.carriedDeck,
            items: run.carriedItems,
            spiritStones: run.spiritStones,
        },
        rewards,
    );

    assertItemCapacityChange(run.carriedItems, carried.items, run.itemSlotCapacity);
    return {
        carriedDeck: carried.cards,
        carriedItems: carried.items,
        spiritStones: carried.spiritStones,
    };
}

export class ExpeditionState {
    public persistentStash: PersistentStash;
    public activeRun: RunSnapshot | null;
    private readonly targetIdentity: ExpeditionRouteIdentity;
    private readonly activeRunRouteKey: string;
    private readonly storage?: RunPersistenceStorageAdapter;
    private readonly itemPolicies: Readonly<Record<string, ItemActionPolicy>>;

    constructor(
        persistentStash: PersistentStash,
        activeRun: RunSnapshot | null,
        targetIdentity: ExpeditionRouteIdentity = normalizeActiveRunIdentity(),
        activeRunRouteKey?: string | null,
        storage?: RunPersistenceStorageAdapter,
        itemPolicies: Readonly<Record<string, ItemActionPolicy>> = {},
    ) {
        this.itemPolicies = itemPolicies;
        this.persistentStash = persistentStash;
        this.targetIdentity = normalizeActiveRunIdentity(targetIdentity);
        this.activeRunRouteKey = normalizeActiveRunRouteKey(activeRunRouteKey, this.targetIdentity);
        this.storage = storage;
        this.activeRun = activeRun
            ? {
                ...activeRun,
                routeKey: this.activeRunRouteKey,
            }
            : null;
    }

    static bootstrap({
        worldState,
        starterDeck,
        targetIdentity,
        activeRunRouteKey,
        activeRunIdentity,
        storage,
        itemPolicies,
    }: ExpeditionBootstrapSources): ExpeditionState {
        const normalizedTargetIdentity = normalizeActiveRunIdentity(
            targetIdentity
                ?? activeRunIdentity
                ?? parseActiveRunRouteKey(activeRunRouteKey)
                ?? undefined,
        );
        const normalizedRouteKey = normalizeActiveRunRouteKey(activeRunRouteKey, normalizedTargetIdentity);
        const loadedStash = loadPersistentStash(storage);
        const seededDeckId = worldState.stash?.deckRef ?? DEFAULT_SAVED_DECK_ID;
        const persistentStash = loadedStash
            ? upgradeSeededDeckToMinimum(loadedStash, seededDeckId, starterDeck.cards)
            : createPersistentStashFromWorldStateSeed({ worldState, starterDeck });
        const activeRun = loadActiveRun(activeRunRouteKey ?? normalizedRouteKey, normalizedTargetIdentity, storage);

        savePersistentStash(persistentStash, storage);

        return new ExpeditionState(persistentStash, activeRun, normalizedTargetIdentity, normalizedRouteKey, storage, itemPolicies);
    }

    createRunSnapshot({ expeditionId, mapId, entryNodeId }: CreateRunSnapshotParams): RunSnapshot {
        this.assertRunIdentityMatchesState({ expeditionId, mapId });

        const startedAt = new Date().toISOString();
        const startingLoadout = createStartingLoadoutFromStash(this.persistentStash);
        const initialCarriedBundle = createStartingLoadoutFromStash(this.persistentStash);
        const activeRun: RunSnapshot = {
            runId: createRunId(),
            routeKey: this.activeRunRouteKey,
            expeditionId,
            mapId,
            status: 'inProgress',
            currentNodeId: entryNodeId,
            startingLoadout,
            carriedDeck: initialCarriedBundle.cards,
            carriedItems: initialCarriedBundle.items,
            ...(this.persistentStash.equippedItems ? { equippedItems: { ...this.persistentStash.equippedItems } } : {}),
            itemSlotCapacity: resolveItemSlotCapacity(this.persistentStash.itemSlotCapacity),
            spiritStones: initialCarriedBundle.spiritStones,
            playerHealth: MAX_RUN_PLAYER_HEALTH,
            visitedNodeIds: [entryNodeId],
            nodeStates: {
                [entryNodeId]: {
                    nodeId: entryNodeId,
                    status: 'cleared',
                    visited: true,
                    rewardClaimed: true,
                },
            },
            startedAt,
        };

        this.persistActiveRun(activeRun);

        return activeRun;
    }

    applyNodeRewardPreview(rewards: RunRewardBundle): RunSnapshot | null {
        if (!this.activeRun) {
            return null;
        }

        if (!canAcceptItemRewards(this.activeRun.carriedItems, rewards.items, this.activeRun.itemSlotCapacity)) return null;
        const updatedRun: RunSnapshot = {
            ...this.activeRun,
            ...addRewardsToCarriedRun(this.activeRun, rewards),
        };

        this.persistActiveRun(updatedRun);

        return updatedRun;
    }

    claimEventNodeReward(nodeId: string, rewards: RunRewardBundle): EventRewardClaimResult {
        if (!this.activeRun) {
            return { status: 'noActiveRun', activeRun: null };
        }

        const existingNodeState = this.activeRun.nodeStates[nodeId];

        if (existingNodeState?.rewardClaimed) {
            return { status: 'alreadyClaimed', activeRun: this.activeRun };
        }
        if (!canAcceptItemRewards(this.activeRun.carriedItems, rewards.items, this.activeRun.itemSlotCapacity)) {
            return { status: 'inventoryFull', activeRun: this.activeRun };
        }

        const updatedRun: RunSnapshot = {
            ...this.activeRun,
            currentNodeId: nodeId,
            ...addRewardsToCarriedRun(this.activeRun, rewards),
            visitedNodeIds: appendUniqueNodeId(this.activeRun.visitedNodeIds, nodeId),
            nodeStates: {
                ...this.activeRun.nodeStates,
                [nodeId]: createVisitedNodeState(nodeId, existingNodeState, { rewardClaimed: true }),
            },
        };

        this.persistActiveRun(updatedRun);

        return { status: 'claimed', activeRun: updatedRun };
    }

    purchaseShopOffer(
        nodeId: string,
        offerId: string,
        cost: ShopOfferCost,
        rewards: RunRewardBundle,
    ): ShopPurchaseResult {
        if (!this.activeRun) {
            return { status: 'noActiveRun', activeRun: null };
        }

        const existingNodeState = this.activeRun.nodeStates[nodeId];
        const purchasedOfferIds = existingNodeState?.purchasedOfferIds ?? [];

        if (purchasedOfferIds.includes(offerId)) {
            return { status: 'alreadyPurchased', activeRun: this.activeRun };
        }

        const exchange = previewShopExchange(this.activeRun, cost, rewards);
        if (exchange.status !== 'available') return { status: exchange.status, activeRun: this.activeRun };

        const updatedPurchasedOfferIds = [...purchasedOfferIds, offerId];
        const updatedRun: RunSnapshot = {
            ...this.activeRun,
            currentNodeId: nodeId,
            ...exchange.carried,
            visitedNodeIds: appendUniqueNodeId(this.activeRun.visitedNodeIds, nodeId),
            nodeStates: {
                ...this.activeRun.nodeStates,
                [nodeId]: createVisitedNodeState(nodeId, existingNodeState, {
                    rewardClaimed: true,
                    purchasedOfferIds: updatedPurchasedOfferIds,
                }),
            },
        };

        this.persistActiveRun(updatedRun);

        return { status: 'purchased', activeRun: updatedRun };
    }

    craftRecipe(recipe: CraftingRecipe): CraftingChangeResult {
        const run = this.activeRun;
        const stash = this.persistentStash;
        const exchange = previewCraftingRecipe(run ?? {
            carriedDeck: stash.cards,
            carriedItems: stash.items,
            equippedItems: stash.equippedItems,
            itemSlotCapacity: stash.itemSlotCapacity,
            spiritStones: stash.spiritStones,
        }, recipe);
        if (exchange.status !== 'available') {
            return { status: exchange.status, activeRun: run, stash };
        }
        if (run) {
            const next: RunSnapshot = { ...run, ...exchange.carried };
            this.persistActiveRun(next);
            return { status: 'crafted', activeRun: this.activeRun, stash };
        }
        const next: PersistentStash = {
            ...stash,
            items: exchange.carried.carriedItems,
            spiritStones: exchange.carried.spiritStones,
        };
        savePersistentStash(next, this.storage);
        this.persistentStash = next;
        return { status: 'crafted', activeRun: null, stash: next };
    }

    useCarriedItem(itemType: ExpeditionItemType, itemId: string): ItemUseResult {
        const run = this.activeRun;
        if (!run) return { status: 'noActiveRun', activeRun: null };
        const items = mergeItemStacks(run.carriedItems, []);
        const held = items.find(item => item.id === itemId && item.itemType === itemType);
        if (!held || held.count < 1) return { status: 'notOwned', activeRun: run };
        const policy = this.itemPolicies[itemId];
        if (itemType !== 'consumable' || policy?.id !== itemId || policy.itemType !== itemType
            || policy.useEffect?.kind !== 'heal') return { status: 'notUsable', activeRun: run };
        const health = getRunPlayerHealth(run.playerHealth);
        if (health >= MAX_RUN_PLAYER_HEALTH) return { status: 'fullHealth', activeRun: run };
        const nextHealth = Math.min(MAX_RUN_PLAYER_HEALTH, health + policy.useEffect.amount);
        const next: RunSnapshot = {
            ...run,
            playerHealth: nextHealth,
            carriedItems: items.map(item => item === held ? { ...item, count: item.count - 1 } : item)
                .filter(item => item.count > 0),
        };
        this.persistActiveRun(next);
        return { status: 'used', healed: nextHealth - health, activeRun: next };
    }

    dropCarriedItem(
        itemType: ExpeditionItemType,
        itemId: string,
        count: number,
    ): ItemDropResult {
        if (!this.activeRun) return { status: 'noActiveRun', activeRun: null };
        if (!Number.isSafeInteger(count) || count < 1) {
            return { status: 'invalidQuantity', activeRun: this.activeRun };
        }
        const currentItems = mergeItemStacks(this.activeRun.carriedItems, []);
        const held = currentItems.find(item => item.itemType === itemType && item.id === itemId);
        if (!held || held.count < count) return { status: 'notOwned', activeRun: this.activeRun };
        if (!canDropInventoryItem(held, this.itemPolicies[itemId])) return { status: 'restricted', activeRun: this.activeRun };
        if (held.count === count && Object.values(this.activeRun.equippedItems ?? {}).includes(itemId)) {
            return { status: 'restricted', activeRun: this.activeRun };
        }
        const nextItems = currentItems.map(item => item === held ? { ...item, count: item.count - count } : item)
            .filter(item => item.count > 0);
        const updatedRun: RunSnapshot = { ...this.activeRun, carriedItems: nextItems };
        this.persistActiveRun(updatedRun);
        return { status: 'dropped', activeRun: updatedRun };
    }

    equipCarriedItem(itemType: ExpeditionItemType, itemId: string): EquipmentChangeResult {
        if (!this.activeRun) return { status: 'noActiveRun', activeRun: null };
        const result = equipOwnedItem(this.activeRun.carriedItems, this.activeRun.equippedItems,
            itemType, itemId, this.itemPolicies[itemId]);
        if (result.status !== 'equipped') return { status: result.status, activeRun: this.activeRun };
        const updatedRun: RunSnapshot = { ...this.activeRun, equippedItems: result.equippedItems };
        this.persistActiveRun(updatedRun);
        return { status: 'equipped', activeRun: updatedRun };
    }

    unequipCarriedSlot(slot: string): EquipmentChangeResult {
        if (!this.activeRun) return { status: 'noActiveRun', activeRun: null };
        const result = unequipOwnedSlot(this.activeRun.equippedItems, slot);
        if (result.status !== 'unequipped') return { status: result.status, activeRun: this.activeRun };
        const updatedRun: RunSnapshot = { ...this.activeRun, equippedItems: result.equippedItems };
        this.persistActiveRun(updatedRun);
        return { status: 'unequipped', activeRun: updatedRun };
    }

    equipStashItem(itemType: ExpeditionItemType, itemId: string): StashEquipmentChangeResult {
        const result = equipOwnedItem(this.persistentStash.items, this.persistentStash.equippedItems,
            itemType, itemId, this.itemPolicies[itemId]);
        if (result.status !== 'equipped') return { status: result.status, stash: this.persistentStash };
        this.persistentStash = { ...this.persistentStash, equippedItems: result.equippedItems };
        this.persistCurrentStash();
        return { status: 'equipped', stash: this.persistentStash };
    }

    unequipStashSlot(slot: string): StashEquipmentChangeResult {
        const result = unequipOwnedSlot(this.persistentStash.equippedItems, slot);
        if (result.status !== 'unequipped') return { status: result.status, stash: this.persistentStash };
        this.persistentStash = { ...this.persistentStash, equippedItems: result.equippedItems };
        this.persistCurrentStash();
        return { status: 'unequipped', stash: this.persistentStash };
    }

    recordExtractIntent(nodeId: string, requestedAt = new Date().toISOString()): ExtractIntentResult {
        if (!this.activeRun) {
            return { status: 'noActiveRun', activeRun: null };
        }

        if (this.activeRun.pendingTerminalResolution?.kind === 'extract') {
            return { status: 'alreadyRecorded', activeRun: this.activeRun };
        }

        const existingNodeState = this.activeRun.nodeStates[nodeId];
        const updatedRun: RunSnapshot = {
            ...this.activeRun,
            currentNodeId: nodeId,
            visitedNodeIds: appendUniqueNodeId(this.activeRun.visitedNodeIds, nodeId),
            nodeStates: {
                ...this.activeRun.nodeStates,
                [nodeId]: createVisitedNodeState(nodeId, existingNodeState, { rewardClaimed: true }),
            },
            pendingTerminalResolution: {
                kind: 'extract',
                nodeId,
                requestedAt,
            },
        };

        this.persistActiveRun(updatedRun);

        return { status: 'recorded', activeRun: updatedRun };
    }

    enterReachableNode(
        map: ExpeditionMapDefinition,
        nodeId: string,
        targetConfig?: ExpeditionTargetConfig,
    ): RunSnapshot | null {
        if (!this.activeRun) {
            return null;
        }

        const nextRun = enterReachableNode(map, this.activeRun, nodeId, targetConfig);

        if (!nextRun) {
            return null;
        }

        this.persistActiveRun(nextRun);

        return nextRun;
    }

    persistCurrentStash(): void {
        savePersistentStash(this.persistentStash, this.storage);
    }

    resetToEntranceState(): void {
        clearActiveRun(this.targetIdentity, undefined, this.storage);
        this.activeRun = null;
        this.persistentStash = loadPersistentStash(this.storage) ?? this.persistentStash;
    }

    private persistActiveRun(run: RunSnapshot): void {
        this.assertRunIdentityMatchesState(run);

        const next = {
            ...run,
            routeKey: this.activeRunRouteKey,
        };
        saveActiveRun(next, this.targetIdentity, undefined, this.storage);
        this.activeRun = next;
    }

    private assertRunIdentityMatchesState(identity: ExpeditionRouteIdentity): void {
        const normalizedIdentity = normalizeActiveRunIdentity(identity);

        if (
            normalizedIdentity.expeditionId === this.targetIdentity.expeditionId
            && normalizedIdentity.mapId === this.targetIdentity.mapId
        ) {
            return;
        }

        throw new Error(
            `Cannot persist active run for ${identity.expeditionId}/${identity.mapId} from ExpeditionState scoped to ${this.targetIdentity.expeditionId}/${this.targetIdentity.mapId}.`,
        );
    }
}
