import type { EquippedItems, ExpeditionItemStack, ExpeditionItemType } from '../types/expedition';
import type { ItemActionPolicy } from './ItemActionRules';

export interface EquipmentModifierSource {
    slot: string;
    itemId: string;
    attribute: string;
    delta: number;
}

const SLOT_ID = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const RESERVED_SLOT_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export function isEquipSlotId(value: unknown): value is string {
    return typeof value === 'string' && SLOT_ID.test(value) && !RESERVED_SLOT_IDS.has(value);
}

export function isValidEquippedItems(value: unknown, items: readonly ExpeditionItemStack[]): value is EquippedItems {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const equipped = value as Record<string, unknown>;
    const itemIds = new Set<string>();
    for (const [slot, itemId] of Object.entries(equipped)) {
        if (!isEquipSlotId(slot) || typeof itemId !== 'string' || !itemId.trim() || itemIds.has(itemId)
            || !items.some(item => item.id === itemId && item.count > 0)) return false;
        itemIds.add(itemId);
    }
    return true;
}

export function pruneUnavailableEquipment(
    equipped: Readonly<EquippedItems> | undefined,
    items: readonly ExpeditionItemStack[],
): EquippedItems {
    return Object.fromEntries(Object.entries(equipped ?? {}).filter(([, itemId]) =>
        items.some(item => item.id === itemId && item.count > 0)));
}

export type EquipOwnedItemStatus = 'equipped' | 'alreadyEquipped' | 'notOwned' | 'notEquippable';

export function equipOwnedItem(
    items: readonly ExpeditionItemStack[],
    equipped: Readonly<EquippedItems> | undefined,
    itemType: ExpeditionItemType,
    itemId: string,
    policy: ItemActionPolicy | undefined,
): { status: EquipOwnedItemStatus; equippedItems: EquippedItems } {
    const equippedItems = pruneUnavailableEquipment(equipped, items);
    if (!items.some(item => item.itemType === itemType && item.id === itemId && item.count > 0)) {
        return { status: 'notOwned', equippedItems };
    }
    if (!policy || policy.id !== itemId || policy.itemType !== itemType || !policy.equipSlot
        || !isEquipSlotId(policy.equipSlot)) {
        return { status: 'notEquippable', equippedItems };
    }
    if (equippedItems[policy.equipSlot] === itemId) return { status: 'alreadyEquipped', equippedItems };
    for (const [slot, equippedId] of Object.entries(equippedItems)) {
        if (equippedId === itemId) delete equippedItems[slot];
    }
    equippedItems[policy.equipSlot] = itemId;
    return { status: 'equipped', equippedItems };
}

export function unequipOwnedSlot(
    equipped: Readonly<EquippedItems> | undefined,
    slot: string,
): { status: 'unequipped' | 'notEquipped'; equippedItems: EquippedItems } {
    const equippedItems = { ...equipped };
    if (!Object.prototype.hasOwnProperty.call(equippedItems, slot)) return { status: 'notEquipped', equippedItems };
    delete equippedItems[slot];
    return { status: 'unequipped', equippedItems };
}

export function equipmentModifierSources(
    equipped: Readonly<EquippedItems> | undefined,
    items: readonly ExpeditionItemStack[],
    policies: Readonly<Record<string, ItemActionPolicy>>,
): EquipmentModifierSource[] {
    const sources: EquipmentModifierSource[] = [];
    for (const [slot, itemId] of Object.entries(equipped ?? {})) {
        const held = items.find(item => item.id === itemId && item.count > 0);
        const policy = policies[itemId];
        if (!held || !policy || policy.id !== itemId || policy.itemType !== held.itemType || policy.equipSlot !== slot) continue;
        for (const [attribute, delta] of Object.entries(policy.attributeModifiers ?? {})) {
            sources.push({ slot, itemId, attribute, delta });
        }
    }
    return sources;
}

export function sumEquipmentModifiers(sources: readonly EquipmentModifierSource[]): Record<string, number> {
    const totals = new Map<string, number>();
    for (const source of sources) totals.set(source.attribute, (totals.get(source.attribute) ?? 0) + source.delta);
    return Object.fromEntries(totals);
}
