import type { ExpeditionItemStack, RunRewardBundle, RunSnapshot } from '../types/expedition';
import { addRewardBundleToCarriedBundle, mergeItemStacks } from './GameWorldStateStashOperations';
import { canAcceptItemChange } from './ItemCapacity';

export interface ShopOfferCost {
    spiritStones: number;
    items?: ExpeditionItemStack[];
}

export type InventoryExchangeSource = Pick<RunSnapshot,
    'carriedDeck' | 'carriedItems' | 'spiritStones' | 'equippedItems' | 'itemSlotCapacity'>;

export type ShopExchangeResult =
    | { status: 'available'; carried: Pick<RunSnapshot, 'carriedDeck' | 'carriedItems' | 'spiritStones'> }
    | { status: 'insufficientFunds' | 'insufficientItems' | 'equippedItem' | 'inventoryFull' };

/** Preview and purchase use the same calculation so a blocked offer never partially spends materials. */
export function previewShopExchange(
    run: InventoryExchangeSource,
    cost: ShopOfferCost,
    rewards: RunRewardBundle,
): ShopExchangeResult {
    if (!Number.isSafeInteger(cost.spiritStones) || cost.spiritStones < 0) {
        throw new Error('Invalid shop spirit stone cost');
    }
    if (run.spiritStones < cost.spiritStones) return { status: 'insufficientFunds' };

    const required = new Map<string, ExpeditionItemStack>();
    for (const item of cost.items ?? []) {
        if (!item.id || !Number.isSafeInteger(item.count) || item.count < 1) {
            throw new Error('Invalid shop item cost');
        }
        const key = `${item.itemType}:${item.id}`;
        const count = (required.get(key)?.count ?? 0) + item.count;
        if (!Number.isSafeInteger(count)) throw new Error('Invalid shop item cost');
        required.set(key, { ...item, count });
    }

    const remaining = mergeItemStacks(run.carriedItems, []);
    for (const [key, item] of required) {
        const held = remaining.find(entry => `${entry.itemType}:${entry.id}` === key);
        if (!held || held.count < item.count) return { status: 'insufficientItems' };
        if (held.count === item.count && Object.values(run.equippedItems ?? {}).includes(item.id)) {
            return { status: 'equippedItem' };
        }
        held.count -= item.count;
    }

    const carried = addRewardBundleToCarriedBundle(
        {
            cards: run.carriedDeck,
            items: remaining.filter(item => item.count > 0),
            spiritStones: run.spiritStones - cost.spiritStones,
        },
        rewards,
    );
    if (!canAcceptItemChange(run.carriedItems, carried.items, run.itemSlotCapacity)) {
        return { status: 'inventoryFull' };
    }
    return { status: 'available', carried: {
        carriedDeck: carried.cards,
        carriedItems: carried.items,
        spiritStones: carried.spiritStones,
    } };
}
