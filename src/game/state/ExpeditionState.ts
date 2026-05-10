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
} from '../services/RunPersistence';
import { enterReachableNode } from '../scenes/expedition/mapTraversal';
import {
    createPersistentStashFromWorldStateSeed,
    type ExpeditionWorldStateSeed,
    type StarterDeckSeed,
} from './GameWorldStateSeed';
import type {
    ExpeditionCardStack,
    ExpeditionItemStack,
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
}

export interface CreateRunSnapshotParams extends ExpeditionRouteIdentity {
    entryNodeId: string;
}

export interface ShopOfferCost {
    spiritStones: number;
}

export type EventRewardClaimResult =
    | { status: 'claimed'; activeRun: RunSnapshot }
    | { status: 'alreadyClaimed'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

export type ShopPurchaseResult =
    | { status: 'purchased'; activeRun: RunSnapshot }
    | { status: 'alreadyPurchased'; activeRun: RunSnapshot }
    | { status: 'insufficientFunds'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

export type ExtractIntentResult =
    | { status: 'recorded'; activeRun: RunSnapshot }
    | { status: 'alreadyRecorded'; activeRun: RunSnapshot }
    | { status: 'noActiveRun'; activeRun: null };

function cloneCardStacks(stacks: ExpeditionCardStack[]): ExpeditionCardStack[] {
    return stacks.map((stack) => ({ ...stack }));
}

function cloneItemStacks(stacks: ExpeditionItemStack[]): ExpeditionItemStack[] {
    return stacks.map((stack) => ({ ...stack }));
}

function mergeCardStacks(existing: ExpeditionCardStack[], incoming: ExpeditionCardStack[]): ExpeditionCardStack[] {
    const merged = new Map<string, ExpeditionCardStack>();

    for (const stack of existing) {
        merged.set(stack.id, { ...stack });
    }

    for (const stack of incoming) {
        const current = merged.get(stack.id);
        merged.set(stack.id, {
            id: stack.id,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()];
}

function mergeItemStacks(existing: ExpeditionItemStack[], incoming: ExpeditionItemStack[]): ExpeditionItemStack[] {
    const merged = new Map<string, ExpeditionItemStack>();

    for (const stack of existing) {
        merged.set(`${stack.itemType}:${stack.id}`, { ...stack });
    }

    for (const stack of incoming) {
        const key = `${stack.itemType}:${stack.id}`;
        const current = merged.get(key);
        merged.set(key, {
            ...stack,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()];
}

function createStartingLoadout(stash: PersistentStash): RunRewardBundle {
    return {
        cards: cloneCardStacks(stash.deck),
        items: cloneItemStacks(stash.items),
        spiritStones: stash.spiritStones,
    };
}

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

export class ExpeditionState {
    public persistentStash: PersistentStash;
    public activeRun: RunSnapshot | null;
    private readonly targetIdentity: ExpeditionRouteIdentity;
    private readonly activeRunRouteKey: string;

    constructor(
        persistentStash: PersistentStash,
        activeRun: RunSnapshot | null,
        targetIdentity: ExpeditionRouteIdentity = normalizeActiveRunIdentity(),
        activeRunRouteKey?: string | null,
    ) {
        this.persistentStash = persistentStash;
        this.targetIdentity = normalizeActiveRunIdentity(targetIdentity);
        this.activeRunRouteKey = normalizeActiveRunRouteKey(activeRunRouteKey, this.targetIdentity);
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
    }: ExpeditionBootstrapSources): ExpeditionState {
        const normalizedTargetIdentity = normalizeActiveRunIdentity(
            targetIdentity
                ?? activeRunIdentity
                ?? parseActiveRunRouteKey(activeRunRouteKey)
                ?? undefined,
        );
        const normalizedRouteKey = normalizeActiveRunRouteKey(activeRunRouteKey, normalizedTargetIdentity);
        const persistentStash = loadPersistentStash() ?? createPersistentStashFromWorldStateSeed({
            worldState,
            starterDeck,
        });
        const activeRun = loadActiveRun(activeRunRouteKey ?? normalizedRouteKey, normalizedTargetIdentity);

        savePersistentStash(persistentStash);

        return new ExpeditionState(persistentStash, activeRun, normalizedTargetIdentity, normalizedRouteKey);
    }

    createRunSnapshot({ expeditionId, mapId, entryNodeId }: CreateRunSnapshotParams): RunSnapshot {
        this.assertRunIdentityMatchesState({ expeditionId, mapId });

        const startedAt = new Date().toISOString();
        const activeRun: RunSnapshot = {
            runId: createRunId(),
            routeKey: this.activeRunRouteKey,
            expeditionId,
            mapId,
            status: 'inProgress',
            currentNodeId: entryNodeId,
            startingLoadout: createStartingLoadout(this.persistentStash),
            carriedDeck: cloneCardStacks(this.persistentStash.deck),
            carriedItems: cloneItemStacks(this.persistentStash.items),
            spiritStones: this.persistentStash.spiritStones,
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

        const updatedRun: RunSnapshot = {
            ...this.activeRun,
            carriedDeck: mergeCardStacks(this.activeRun.carriedDeck, rewards.cards),
            carriedItems: mergeItemStacks(this.activeRun.carriedItems, rewards.items),
            spiritStones: this.activeRun.spiritStones + rewards.spiritStones,
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

        const updatedRun: RunSnapshot = {
            ...this.activeRun,
            currentNodeId: nodeId,
            carriedDeck: mergeCardStacks(this.activeRun.carriedDeck, rewards.cards),
            carriedItems: mergeItemStacks(this.activeRun.carriedItems, rewards.items),
            spiritStones: this.activeRun.spiritStones + rewards.spiritStones,
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

        if (this.activeRun.spiritStones < cost.spiritStones) {
            return { status: 'insufficientFunds', activeRun: this.activeRun };
        }

        const updatedPurchasedOfferIds = [...purchasedOfferIds, offerId];
        const updatedRun: RunSnapshot = {
            ...this.activeRun,
            currentNodeId: nodeId,
            carriedDeck: mergeCardStacks(this.activeRun.carriedDeck, rewards.cards),
            carriedItems: mergeItemStacks(this.activeRun.carriedItems, rewards.items),
            spiritStones: this.activeRun.spiritStones - cost.spiritStones + rewards.spiritStones,
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

    resetToEntranceState(): void {
        clearActiveRun(this.targetIdentity);
        this.activeRun = null;
        this.persistentStash = loadPersistentStash() ?? this.persistentStash;
    }

    private persistActiveRun(run: RunSnapshot): void {
        this.assertRunIdentityMatchesState(run);

        this.activeRun = {
            ...run,
            routeKey: this.activeRunRouteKey,
        };
        saveActiveRun(this.activeRun, this.targetIdentity);
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
