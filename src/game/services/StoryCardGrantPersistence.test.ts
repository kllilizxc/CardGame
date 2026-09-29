import { describe, expect, it } from 'bun:test';
import { loadPersistentStash, STASH_STORAGE_KEY, type RunPersistenceStorageAdapter } from './RunPersistence';
import { attachStoryItemCounts, settleStoryCardGrants, settleStoryRewards } from './StoryCardGrantPersistence';
import { createInitialStoryState } from '../state/StoryState';

const seed = {
    worldState: { stash: { items: [], spiritStones: 0 } },
    starterDeck: { name: 'Starter', cards: [{ id: 'CR_001', count: 1 }] },
};

function memoryStorage() {
    const values = new Map<string, string>();
    const storage: RunPersistenceStorageAdapter = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: key => { values.delete(key); },
    };
    return { values, storage };
}

describe('StoryCardGrantPersistence', () => {
    it('settles a card reward and item consumption in one idempotent stash write', () => {
        const { storage } = memoryStorage();
        const sources = { ...seed, worldState: { stash: { items: [{ id: 'consumable.spirit-salve', itemType: 'consumable' as const, count: 2 }], spiritStones: 0 } } };
        const cards = [{ grantId: 'quest.fox.card', cardId: 'CR_001', count: 1 }];
        const items = [{ transactionId: 'quest.fox.salve', itemId: 'consumable.spirit-salve', itemType: 'consumable' as const, countDelta: -1 }];
        const first = settleStoryRewards(cards, items, sources, storage);
        expect(first.cards).toEqual([{ id: 'CR_001', count: 2 }]);
        expect(first.items).toEqual([{ id: 'consumable.spirit-salve', itemType: 'consumable', count: 1 }]);
        expect(first.settledStoryItemTransactionIds).toEqual(['quest.fox.salve']);
        const repeated = settleStoryRewards(cards, items, sources, storage);
        expect(repeated.cards).toEqual(first.cards);
        expect(repeated.items).toEqual(first.items);
        expect(loadPersistentStash(storage)?.settledStoryItemTransactionIds).toEqual(['quest.fox.salve']);
        const state = createInitialStoryState({ storyId: 'story.fox', locationId: 'forest', sublocationId: 'bridge', nodeId: 'start' });
        expect(attachStoryItemCounts({ ...state, itemTransactions: items }, repeated).itemCounts?.['consumable.spirit-salve']).toBe(1);
    });

    it('rejects insufficient items without awarding the card or recording a claim', () => {
        const { values, storage } = memoryStorage();
        const items = [{ transactionId: 'quest.fox.salve', itemId: 'consumable.spirit-salve', itemType: 'consumable' as const, countDelta: -1 }];
        expect(() => settleStoryRewards([{ grantId: 'quest.fox.card', cardId: 'CR_001', count: 1 }], items, seed, storage)).toThrow('Not enough story item');
        expect(values.has(STASH_STORAGE_KEY)).toBe(false);
    });

    it('does not consume materials or award a card when the final story reward exceeds bag capacity', () => {
        const { values, storage } = memoryStorage();
        const sources = { ...seed, worldState: { stash: {
            items: [{ id: 'tool.silver-needle', itemType: 'tool' as const, count: 1 }],
            itemSlotCapacity: 1,
            spiritStones: 0,
        } } };
        const grants = [{ grantId: 'quest.reward.card', cardId: 'CR_001', count: 1 }];
        const transactions = [
            { transactionId: 'quest.consume.needle', itemId: 'tool.silver-needle', itemType: 'tool' as const, countDelta: -1 },
            { transactionId: 'quest.reward.salves', itemId: 'consumable.spirit-salve', itemType: 'consumable' as const, countDelta: 21 },
        ];

        expect(() => settleStoryRewards(grants, transactions, sources, storage)).toThrow('Inventory full: 2/1 slots');
        expect(values.has(STASH_STORAGE_KEY)).toBe(false);

        const fitted = settleStoryRewards(grants, [transactions[0], { ...transactions[1], countDelta: 20 }], sources, storage);
        expect(fitted.items).toEqual([{ id: 'consumable.spirit-salve', itemType: 'consumable', count: 20 }]);
        expect(fitted.cards).toEqual([{ id: 'CR_001', count: 2 }]);
        expect(loadPersistentStash(storage)?.settledStoryItemTransactionIds).toEqual(['quest.consume.needle', 'quest.reward.salves']);
    });

    it('adds the quest card to collection once, preserving the selected deck and claim ledger across reloads', () => {
        const { storage } = memoryStorage();
        const grant = [{ grantId: 'quest.fox.card', cardId: 'CR_001', count: 1 }];
        const first = settleStoryCardGrants(grant, seed, storage);
        expect(first.cards).toEqual([{ id: 'CR_001', count: 2 }]);
        expect(first.claimedStoryGrantIds).toEqual(['quest.fox.card']);
        const repeated = settleStoryCardGrants(grant, seed, storage);
        expect(repeated.cards).toEqual(first.cards);
        expect(loadPersistentStash(storage)?.claimedStoryGrantIds).toEqual(['quest.fox.card']);
    });

    it('can retry the same durable grant after a failed stash write without duplicating it', () => {
        const { values, storage } = memoryStorage();
        let failNext = true;
        const failing: RunPersistenceStorageAdapter = {
            ...storage,
            setItem(key, value) {
                if (failNext) { failNext = false; throw new Error('disk full'); }
                storage.setItem(key, value);
            },
        };
        const grants = [{ grantId: 'quest.fox.card', cardId: 'CR_001', count: 1 }];
        expect(() => settleStoryCardGrants(grants, seed, failing)).toThrow('disk full');
        expect(values.has(STASH_STORAGE_KEY)).toBe(false);
        expect(settleStoryCardGrants(grants, seed, failing).cards).toEqual([{ id: 'CR_001', count: 2 }]);
        expect(settleStoryCardGrants(grants, seed, failing).cards).toEqual([{ id: 'CR_001', count: 2 }]);
    });

    it('rejects conflicting grant definitions before writing a stash', () => {
        const { values, storage } = memoryStorage();
        expect(() => settleStoryCardGrants([
            { grantId: 'same', cardId: 'CR_001', count: 1 },
            { grantId: 'same', cardId: 'CR_002', count: 1 },
        ], seed, storage)).toThrow('Conflicting story card grant');
        expect(values.has(STASH_STORAGE_KEY)).toBe(false);
    });
});
