import type { ExpeditionItemStack, ExpeditionItemType } from '../types/expedition';

export const DEFAULT_ITEM_SLOT_CAPACITY = 20;

const STACK_LIMITS: Record<ExpeditionItemType, number> = {
    artifact: 1,
    tool: 1,
    consumable: 20,
    material: 99,
    quest: 1,
};

export class InventoryCapacityError extends Error {
    constructor(public readonly occupied: number, public readonly capacity: number) {
        super(`Inventory full: ${occupied}/${capacity} slots`);
        this.name = 'InventoryCapacityError';
    }
}

export function resolveItemSlotCapacity(configured?: number): number {
    if (configured === undefined) return DEFAULT_ITEM_SLOT_CAPACITY;
    if (!Number.isSafeInteger(configured) || configured < 1) {
        throw new Error(`Invalid item slot capacity: ${configured}`);
    }
    return configured;
}

/** Stack counts are logical totals; a stack may occupy several inventory slots. */
export function countOccupiedItemSlots(items: readonly ExpeditionItemStack[]): number {
    const totals = new Map<string, { itemType: ExpeditionItemType; count: number }>();
    for (const item of items) {
        if (!Number.isSafeInteger(item.count) || item.count < 0 || !STACK_LIMITS[item.itemType]) {
            throw new Error(`Invalid inventory item: ${item.itemType}:${item.id}`);
        }
        if (item.count === 0) continue;
        const key = `${item.itemType}:${item.id}`;
        const current = totals.get(key);
        const count = (current?.count ?? 0) + item.count;
        if (!Number.isSafeInteger(count)) throw new Error(`Invalid inventory count: ${key}`);
        totals.set(key, { itemType: item.itemType, count });
    }
    let occupied = 0;
    for (const { itemType, count } of totals.values()) {
        occupied += Math.ceil(count / STACK_LIMITS[itemType]);
    }
    return occupied;
}

/** Existing overfull saves may shed items, but cannot grow their slot use. */
export function assertItemCapacityChange(
    before: readonly ExpeditionItemStack[],
    after: readonly ExpeditionItemStack[],
    configuredCapacity?: number,
): void {
    const capacity = resolveItemSlotCapacity(configuredCapacity);
    const occupied = countOccupiedItemSlots(after);
    if (occupied > capacity && occupied > countOccupiedItemSlots(before)) {
        throw new InventoryCapacityError(occupied, capacity);
    }
}

export function canAcceptItemChange(
    before: readonly ExpeditionItemStack[],
    after: readonly ExpeditionItemStack[],
    configuredCapacity?: number,
): boolean {
    try {
        assertItemCapacityChange(before, after, configuredCapacity);
        return true;
    } catch (error) {
        if (error instanceof InventoryCapacityError) return false;
        throw error;
    }
}

export function canAcceptItemRewards(
    current: readonly ExpeditionItemStack[],
    rewards: readonly ExpeditionItemStack[],
    configuredCapacity?: number,
): boolean {
    return canAcceptItemChange(current, [...current, ...rewards], configuredCapacity);
}
