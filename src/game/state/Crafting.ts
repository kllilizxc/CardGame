import type { ExpeditionItemStack, RunRewardBundle } from '../types/expedition';
import type { ItemActionPolicy } from './ItemActionRules';
import { previewShopExchange, type InventoryExchangeSource, type ShopExchangeResult } from './ShopExchange';

export interface CraftingRecipe {
    id: string;
    name: string;
    description?: string;
    cost: { spiritStones: number; items: ExpeditionItemStack[] };
    rewards: { items: ExpeditionItemStack[] };
}

const RECIPE_ID = /^[A-Za-z][A-Za-z0-9._-]{1,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readStacks(value: unknown, policies: Readonly<Record<string, ItemActionPolicy>>, label: string): ExpeditionItemStack[] {
    if (!Array.isArray(value) || value.length > 8) throw new Error(`Invalid crafting ${label}`);
    const seen = new Set<string>();
    return value.map((raw): ExpeditionItemStack => {
        if (!isRecord(raw) || typeof raw.id !== 'string' || !RECIPE_ID.test(raw.id)
            || typeof raw.itemType !== 'string' || !Number.isSafeInteger(raw.count) || (raw.count as number) < 1
            || policies[raw.id]?.itemType !== raw.itemType || seen.has(raw.id)) {
            throw new Error(`Invalid crafting ${label} item: ${String(raw?.id)}`);
        }
        seen.add(raw.id);
        return { id: raw.id, itemType: policies[raw.id].itemType, count: raw.count as number };
    });
}

/** Recipes live beside the world item catalog, so every material and output is a fixed catalog reference. */
export function indexCraftingRecipes(
    rawCatalog: unknown,
    policies: Readonly<Record<string, ItemActionPolicy>>,
): readonly CraftingRecipe[] {
    if (!isRecord(rawCatalog)) throw new Error('Invalid world item catalog.');
    if (rawCatalog.recipes === undefined) return [];
    if (!Array.isArray(rawCatalog.recipes) || rawCatalog.recipes.length > 64) {
        throw new Error('Invalid world item recipes.');
    }
    const seen = new Set<string>();
    return rawCatalog.recipes.map((raw): CraftingRecipe => {
        if (!isRecord(raw) || typeof raw.id !== 'string' || !RECIPE_ID.test(raw.id) || seen.has(raw.id)
            || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 80
            || raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 500)
            || !isRecord(raw.cost) || !Number.isSafeInteger(raw.cost.spiritStones)
            || (raw.cost.spiritStones as number) < 0 || !isRecord(raw.rewards)) {
            throw new Error(`Invalid crafting recipe: ${String(raw?.id)}`);
        }
        const costItems = readStacks(raw.cost.items, policies, `${raw.id} cost`);
        const rewardItems = readStacks(raw.rewards.items, policies, `${raw.id} rewards`);
        if ((!costItems.length && raw.cost.spiritStones === 0) || !rewardItems.length) {
            throw new Error(`Crafting recipe needs a cost and an output: ${raw.id}`);
        }
        seen.add(raw.id);
        return {
            id: raw.id,
            name: raw.name.trim(),
            ...(raw.description ? { description: raw.description } : {}),
            cost: { spiritStones: raw.cost.spiritStones as number, items: costItems },
            rewards: { items: rewardItems },
        };
    });
}

export function previewCraftingRecipe(source: InventoryExchangeSource, recipe: CraftingRecipe): ShopExchangeResult {
    const rewards: RunRewardBundle = { cards: [], items: recipe.rewards.items, spiritStones: 0 };
    return previewShopExchange(source, recipe.cost, rewards);
}
