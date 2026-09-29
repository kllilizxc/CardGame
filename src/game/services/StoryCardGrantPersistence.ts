import type { StoryCardGrant, StoryItemTransaction, StoryState } from '../types/story';
import type { PersistentStash } from '../types/expedition';
import { mergeCardStacks } from '../state/GameWorldStateStashOperations';
import { assertItemCapacityChange } from '../state/ItemCapacity';
import { pruneUnavailableEquipment } from '../state/EquipmentState';
import { createPersistentStashFromWorldStateSeed, type PersistentStashSeedSources } from '../state/GameWorldStateSeed';
import { loadPersistentStash, savePersistentStash, type RunPersistenceStorageAdapter } from './RunPersistence';

/** The story document is the durable intent; one stash write applies cards and claim IDs together. */
export function settleStoryRewards(
    grants: readonly StoryCardGrant[],
    itemTransactions: readonly StoryItemTransaction[],
    seedSources: PersistentStashSeedSources,
    storage?: RunPersistenceStorageAdapter,
): PersistentStash {
    const stash = loadPersistentStash(storage) ?? createPersistentStashFromWorldStateSeed(seedSources);
    const next = planStoryRewards(stash, grants, itemTransactions);
    if (next !== stash) savePersistentStash(next, storage);
    return next;
}

/** Validate the entire choice before committing either its story intent or stash projection. */
export function planStoryRewards(
    stash: PersistentStash,
    grants: readonly StoryCardGrant[],
    itemTransactions: readonly StoryItemTransaction[],
): PersistentStash {
    const claimed = new Set(stash.claimedStoryGrantIds ?? []);
    const seen = new Map<string, StoryCardGrant>();
    const pending: StoryCardGrant[] = [];
    for (const grant of grants) {
        if (!grant.grantId.trim() || !grant.cardId.trim() || !Number.isSafeInteger(grant.count) || grant.count < 1) {
            throw new Error(`Invalid story card grant: ${grant.grantId}`);
        }
        const prior = seen.get(grant.grantId);
        if (prior && (prior.cardId !== grant.cardId || prior.count !== grant.count)) {
            throw new Error(`Conflicting story card grant: ${grant.grantId}`);
        }
        if (!prior && !claimed.has(grant.grantId)) pending.push(grant);
        seen.set(grant.grantId, grant);
    }
    const settledItems = new Set(stash.settledStoryItemTransactionIds ?? []);
    const seenItems = new Map<string, StoryItemTransaction>();
    const pendingItems: StoryItemTransaction[] = [];
    for (const item of itemTransactions) {
        if (!item.transactionId.trim() || !item.itemId.trim() || !Number.isSafeInteger(item.countDelta) || item.countDelta === 0) {
            throw new Error(`Invalid story item transaction: ${item.transactionId}`);
        }
        const prior = seenItems.get(item.transactionId);
        if (prior && (prior.itemId !== item.itemId || prior.itemType !== item.itemType || prior.countDelta !== item.countDelta)) {
            throw new Error(`Conflicting story item transaction: ${item.transactionId}`);
        }
        if (!prior && !settledItems.has(item.transactionId)) pendingItems.push(item);
        seenItems.set(item.transactionId, item);
    }
    if (!pending.length && !pendingItems.length) return stash;
    const items = stash.items.map(item => ({ ...item }));
    for (const change of pendingItems) {
        const existing = items.find(item => item.id === change.itemId && item.itemType === change.itemType);
        const remaining = (existing?.count ?? 0) + change.countDelta;
        if (remaining < 0) throw new Error(`Not enough story item: ${change.itemId}`);
        if (existing) existing.count = remaining;
        else if (remaining > 0) items.push({ id: change.itemId, itemType: change.itemType, count: remaining });
    }
    const finalItems = items.filter(item => item.count > 0);
    assertItemCapacityChange(stash.items, finalItems, stash.itemSlotCapacity);
    return {
        ...stash,
        deck: mergeCardStacks(stash.deck, pending.map(grant => ({ id: grant.cardId, count: grant.count }))),
        items: finalItems,
        ...(stash.equippedItems ? { equippedItems: pruneUnavailableEquipment(stash.equippedItems, finalItems) } : {}),
        claimedStoryGrantIds: [...claimed, ...pending.map(grant => grant.grantId)],
        settledStoryItemTransactionIds: [...settledItems, ...pendingItems.map(item => item.transactionId)],
    };
}

export function settleStoryCardGrants(
    grants: readonly StoryCardGrant[],
    seedSources: PersistentStashSeedSources,
    storage?: RunPersistenceStorageAdapter,
): PersistentStash {
    return settleStoryRewards(grants, [], seedSources, storage);
}

/** Refresh conditions from the authoritative stash, including recorded changes awaiting settlement. */
export function attachStoryItemCounts(state: StoryState, stash: PersistentStash): StoryState {
    const counts: Record<string, number> = {};
    for (const item of stash.items) counts[item.id] = (counts[item.id] ?? 0) + item.count;
    const settled = new Set(stash.settledStoryItemTransactionIds ?? []);
    for (const item of state.itemTransactions ?? []) {
        if (settled.has(item.transactionId)) continue;
        const remaining = (counts[item.itemId] ?? 0) + item.countDelta;
        if (remaining < 0) throw new Error(`Not enough story item: ${item.itemId}`);
        counts[item.itemId] = remaining;
    }
    return { ...state, itemCounts: counts };
}
