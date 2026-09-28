import type { ExpeditionItemStack, ExpeditionItemType } from '../types/expedition';
import { isEquipSlotId } from './EquipmentState';

export interface ItemActionPolicy {
    id: string;
    itemType: ExpeditionItemType;
    droppable?: boolean;
    equipSlot?: string;
    attributeModifiers?: Readonly<Record<string, number>>;
    useEffect?: Readonly<{ kind: 'heal'; amount: number }>;
}

const DEFAULT_DROPPABLE: Record<ExpeditionItemType, boolean> = {
    artifact: true,
    consumable: true,
    material: true,
    tool: false,
    quest: false,
};

export function canDropInventoryItem(
    item: Pick<ExpeditionItemStack, 'id' | 'itemType'>,
    policy?: ItemActionPolicy,
): boolean {
    if (policy && (policy.id !== item.id || policy.itemType !== item.itemType)) return false;
    return policy?.droppable ?? DEFAULT_DROPPABLE[item.itemType];
}

export function indexItemActionPolicies(rawCatalog: unknown): Readonly<Record<string, ItemActionPolicy>> {
    if (!rawCatalog || typeof rawCatalog !== 'object' || Array.isArray(rawCatalog)) {
        throw new Error('Invalid world item catalog.');
    }
    const catalog = rawCatalog as Record<string, unknown>;
    const collections: Array<[string, ExpeditionItemType]> = [
        ['artifacts', 'artifact'],
        ['tools', 'tool'],
        ['consumables', 'consumable'],
        ['materials', 'material'],
        ['quests', 'quest'],
        ['questItems', 'quest'],
    ];
    const policies: Record<string, ItemActionPolicy> = Object.create(null);
    for (const [field, itemType] of collections) {
        const entries = catalog[field];
        if (entries === undefined) continue;
        if (!Array.isArray(entries)) throw new Error(`Invalid world item catalog collection: ${field}`);
        for (const value of entries) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error(`Invalid world item catalog entry: ${field}`);
            }
            const entry = value as Record<string, unknown>;
            const modifiers = entry.attributeModifiers;
            const useEffect = entry.useEffect;
            if (typeof entry.id !== 'string' || !entry.id.trim() || policies[entry.id]
                || (entry.droppable !== undefined && typeof entry.droppable !== 'boolean')
                || (entry.equipSlot !== undefined && (itemType !== 'artifact' && itemType !== 'tool'
                    || !isEquipSlotId(entry.equipSlot)))
                || (modifiers !== undefined && (entry.equipSlot === undefined || !modifiers
                    || typeof modifiers !== 'object' || Array.isArray(modifiers)
                    || Object.keys(modifiers).length === 0
                    || Object.entries(modifiers).some(([attribute, delta]) => !attribute.trim()
                        || ['__proto__', 'constructor', 'prototype'].includes(attribute)
                        || typeof delta !== 'number' || !Number.isFinite(delta) || Math.abs(delta) > 100)))
                || (useEffect !== undefined && (itemType !== 'consumable'
                    || !useEffect || typeof useEffect !== 'object' || Array.isArray(useEffect)
                    || Object.keys(useEffect).length !== 2
                    || (useEffect as Record<string, unknown>).kind !== 'heal'
                    || !Number.isSafeInteger((useEffect as Record<string, unknown>).amount)
                    || ((useEffect as Record<string, unknown>).amount as number) < 1
                    || ((useEffect as Record<string, unknown>).amount as number) > 100))) {
                throw new Error(`Invalid or duplicate world item policy: ${String(entry.id)}`);
            }
            policies[entry.id] = {
                id: entry.id,
                itemType,
                ...(entry.droppable !== undefined ? { droppable: entry.droppable as boolean } : {}),
                ...(entry.equipSlot !== undefined ? { equipSlot: entry.equipSlot as string } : {}),
                ...(modifiers !== undefined ? { attributeModifiers: { ...modifiers as Record<string, number> } } : {}),
                ...(useEffect !== undefined ? { useEffect: { kind: 'heal' as const, amount: (useEffect as { amount: number }).amount } } : {}),
            };
        }
    }
    return policies;
}
