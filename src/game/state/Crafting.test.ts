import { describe, expect, it } from 'bun:test';

import starterDeck from '../../../public/data/decks/starter-deck.json';
import { loadActiveRun, loadPersistentStash } from '../services/RunPersistence';
import type { ExpeditionItemStack } from '../types/expedition';
import { indexCraftingRecipes, previewCraftingRecipe } from './Crafting';
import { ExpeditionState } from './ExpeditionState';
import { indexItemActionPolicies } from './ItemActionRules';

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

const material: ExpeditionItemStack = { id: 'material.jade-fragment', itemType: 'material', count: 2 };
const rope: ExpeditionItemStack = { id: 'tool.return-rope', itemType: 'tool', count: 1 };
const salve: ExpeditionItemStack = { id: 'consumable.spirit-salve', itemType: 'consumable', count: 2 };
const charm: ExpeditionItemStack = { id: 'artifact.jade-charm', itemType: 'artifact', count: 1 };
const target = { expeditionId: 'craft-expedition', mapId: 'craft-map' };
const catalog = {
    tools: [{ id: rope.id, equipSlot: 'tool' }],
    materials: [{ id: material.id }],
    consumables: [{ id: salve.id }],
    artifacts: [{ id: charm.id }],
    recipes: [{
        id: 'recipe.jade-charm', name: '青玉护符',
        cost: { spiritStones: 4, items: [material] }, rewards: { items: [charm] },
    }],
};
const policies = indexItemActionPolicies(catalog);
const [recipe] = indexCraftingRecipes(catalog, policies);

function start(items: ExpeditionItemStack[], capacity: number, storage = new MemoryStorage()): ExpeditionState {
    return ExpeditionState.bootstrap({
        worldState: { stash: { items, spiritStones: 36, itemSlotCapacity: capacity } },
        starterDeck: structuredClone(starterDeck), targetIdentity: target, itemPolicies: policies, storage,
    });
}

describe('crafting', () => {
    it('rejects unknown, mistyped, repeated and empty recipe references', () => {
        expect(() => indexCraftingRecipes({ ...catalog, recipes: [{ ...recipe,
            cost: { ...recipe.cost, items: [{ ...material, id: 'material.missing' }] },
        }] }, policies)).toThrow('Invalid crafting');
        expect(() => indexCraftingRecipes({ ...catalog, recipes: [{ ...recipe,
            rewards: { items: [{ ...charm, itemType: 'tool' }] },
        }] }, policies)).toThrow('Invalid crafting');
        expect(() => indexCraftingRecipes({ ...catalog, recipes: [recipe, recipe] }, policies)).toThrow('Invalid crafting recipe');
        expect(() => indexCraftingRecipes({ ...catalog, recipes: [{ ...recipe,
            cost: { spiritStones: 0, items: [] },
        }] }, policies)).toThrow('needs a cost');
    });

    it('crafts from the permanent stash once, saves the exact result, and never spends a failed retry', () => {
        const storage = new MemoryStorage();
        const state = start([rope, material], 2, storage);
        expect(state.craftRecipe(recipe).status).toBe('crafted');
        expect(state.persistentStash.items).toEqual([rope, charm]);
        expect(state.persistentStash.spiritStones).toBe(32);
        expect(loadPersistentStash(storage)?.items).toEqual([rope, charm]);
        const before = storage.getItem('cardgame.persistent-stash.v1');
        expect(state.craftRecipe(recipe).status).toBe('insufficientItems');
        expect(storage.getItem('cardgame.persistent-stash.v1')).toBe(before);
    });

    it('checks capacity and equipped materials before changing a run, then persists one complete exchange', () => {
        const storage = new MemoryStorage();
        const state = start([rope, material, salve], 3, storage);
        state.createRunSnapshot({ ...target, entryNodeId: 'entrance.craft' });
        const oneFragment = { ...recipe, cost: { ...recipe.cost, items: [{ ...material, count: 1 }] } };
        const before = structuredClone(state.activeRun!);
        expect(previewCraftingRecipe(before, oneFragment).status).toBe('inventoryFull');
        expect(state.craftRecipe(oneFragment).status).toBe('inventoryFull');
        expect(state.activeRun).toEqual(before);
        expect(loadActiveRun(target, undefined, storage)).toEqual(before);

        const ropeRecipe = { ...recipe, cost: { spiritStones: 0, items: [rope] } };
        expect(state.equipCarriedItem('tool', rope.id).status).toBe('equipped');
        const equipped = structuredClone(state.activeRun!);
        expect(state.craftRecipe(ropeRecipe).status).toBe('equippedItem');
        expect(loadActiveRun(target, undefined, storage)).toEqual(equipped);

        expect(state.craftRecipe(recipe).status).toBe('crafted');
        expect(state.activeRun?.carriedItems).toEqual([rope, salve, charm]);
        expect(state.activeRun?.spiritStones).toBe(32);
        expect(loadActiveRun(target, undefined, storage)?.carriedItems).toEqual([rope, salve, charm]);
        expect(state.persistentStash.items).toEqual([rope, material, salve]);
    });
});
