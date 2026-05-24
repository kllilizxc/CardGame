import { describe, expect, it } from 'bun:test';

import type { ExpeditionCardStack, PersistentStash } from '../types/expedition';
import {
    addSavedDeckToStash,
    adjustDeckCardCount,
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    deleteSavedDeckFromStash,
    renameSavedDeckInStash,
    selectDeckInStash,
    summarizeDeckCapacity,
    updateSavedDeckInStash,
    validateDeckAvailability,
    validateDeckSize,
} from './PersistentStashDecks';

function stacks(...entries: [id: string, count: number][]): ExpeditionCardStack[] {
    return entries.map(([id, count]) => ({ id, count }));
}

function createStash(overrides: Partial<PersistentStash> = {}): PersistentStash {
    return {
        stashId: 'test-stash',
        cards: stacks(['CARD_A', 3], ['CARD_B', 2], ['CARD_C', 1]),
        savedDecks: [
            {
                id: 'deck-1',
                name: 'Deck One',
                cards: stacks(['CARD_A', 2], ['CARD_B', 1]),
            },
            {
                id: 'deck-2',
                name: 'Deck Two',
                cards: stacks(['CARD_C', 1]),
            },
        ],
        selectedDeckId: 'deck-1',
        items: [],
        spiritStones: 0,
        lastRunSummary: null,
        ...overrides,
    };
}

function deckOfSize(size: number): ExpeditionCardStack[] {
    return stacks(['CARD_X', size]);
}

describe('countDeckCards', () => {
    it('returns 0 for an empty deck', () => {
        expect(countDeckCards([])).toBe(0);
    });

    it('sums counts across multiple stacks', () => {
        expect(countDeckCards(stacks(['A', 3], ['B', 2], ['C', 5]))).toBe(10);
    });

    it('treats zero-count stacks as contributing nothing', () => {
        expect(countDeckCards(stacks(['A', 0], ['B', 3]))).toBe(3);
    });
});

describe('summarizeDeckCapacity', () => {
    it('reports cards still needed to reach the minimum deck size', () => {
        expect(summarizeDeckCapacity(stacks(['CARD_A', 18]))).toEqual({
            count: 18,
            cardsNeededToMin: 2,
            cardsOverMax: 0,
            slotsRemainingToMax: 22,
        });
    });

    it('reports remaining headroom for a legal in-range deck', () => {
        expect(summarizeDeckCapacity(stacks(['CARD_A', 20], ['CARD_B', 7]))).toEqual({
            count: 27,
            cardsNeededToMin: 0,
            cardsOverMax: 0,
            slotsRemainingToMax: 13,
        });
    });

    it('reports overflow for a deck above the maximum', () => {
        expect(summarizeDeckCapacity(stacks(['CARD_A', 45]))).toEqual({
            count: 45,
            cardsNeededToMin: 0,
            cardsOverMax: 5,
            slotsRemainingToMax: 0,
        });
    });
});

describe('adjustDeckCardCount', () => {
    it('adds a new stack when increasing a missing card', () => {
        expect(adjustDeckCardCount(stacks(['CARD_A', 2]), 'CARD_B', 3)).toEqual(
            stacks(['CARD_A', 2], ['CARD_B', 3]),
        );
    });

    it('increments an existing stack without mutating the input', () => {
        const cards = stacks(['CARD_A', 2], ['CARD_B', 1]);
        const result = adjustDeckCardCount(cards, 'CARD_A', 2);

        expect(result).toEqual(stacks(['CARD_A', 4], ['CARD_B', 1]));
        expect(cards).toEqual(stacks(['CARD_A', 2], ['CARD_B', 1]));
    });

    it('decrements an existing stack and removes it when the count reaches zero', () => {
        expect(adjustDeckCardCount(stacks(['CARD_A', 2], ['CARD_B', 1]), 'CARD_A', -2)).toEqual(
            stacks(['CARD_B', 1]),
        );
    });

    it('clamps removal below zero by dropping the stack entirely', () => {
        expect(adjustDeckCardCount(stacks(['CARD_A', 2]), 'CARD_A', -99)).toEqual([]);
    });

    it('returns cloned stacks for a zero delta', () => {
        const cards = stacks(['CARD_A', 2], ['CARD_B', 1]);
        const result = adjustDeckCardCount(cards, 'CARD_A', 0);

        expect(result).toEqual(cards);
        expect(result).not.toBe(cards);
        expect(result[0]).not.toBe(cards[0]);
    });
});

describe('validateDeckSize', () => {
    it('returns null for a deck at the minimum boundary (20 cards)', () => {
        expect(validateDeckSize(deckOfSize(20))).toBeNull();
    });

    it('returns null for a deck at the maximum boundary (40 cards)', () => {
        expect(validateDeckSize(deckOfSize(40))).toBeNull();
    });

    it('returns null for a deck between boundaries (30 cards)', () => {
        expect(validateDeckSize(deckOfSize(30))).toBeNull();
    });

    it('returns too-few-cards for a deck below the minimum', () => {
        expect(validateDeckSize(deckOfSize(19))).toEqual({
            kind: 'too-few-cards',
            count: 19,
            min: DECK_CARD_MIN,
        });
    });

    it('returns too-few-cards for an empty deck', () => {
        expect(validateDeckSize([])).toEqual({
            kind: 'too-few-cards',
            count: 0,
            min: DECK_CARD_MIN,
        });
    });

    it('returns too-many-cards for a deck above the maximum', () => {
        expect(validateDeckSize(deckOfSize(41))).toEqual({
            kind: 'too-many-cards',
            count: 41,
            max: DECK_CARD_MAX,
        });
    });

    it('returns too-many-cards for a deck well above the maximum', () => {
        expect(validateDeckSize(deckOfSize(60))).toEqual({
            kind: 'too-many-cards',
            count: 60,
            max: DECK_CARD_MAX,
        });
    });

    it('sums across multiple stacks for boundary checks', () => {
        expect(validateDeckSize(stacks(['A', 10], ['B', 10]))).toBeNull();
        expect(validateDeckSize(stacks(['A', 10], ['B', 9]))).toEqual({
            kind: 'too-few-cards',
            count: 19,
            min: DECK_CARD_MIN,
        });
    });
});

describe('validateDeckAvailability', () => {
    it('returns an empty array when all deck cards are available in sufficient quantity', () => {
        const deckCards = stacks(['CARD_A', 2], ['CARD_B', 1]);
        const stashCards = stacks(['CARD_A', 3], ['CARD_B', 2]);

        expect(validateDeckAvailability(deckCards, stashCards)).toEqual([]);
    });

    it('returns an empty array when deck cards match stash counts exactly', () => {
        const deckCards = stacks(['CARD_A', 3], ['CARD_B', 2]);
        const stashCards = stacks(['CARD_A', 3], ['CARD_B', 2]);

        expect(validateDeckAvailability(deckCards, stashCards)).toEqual([]);
    });

    it('reports insufficient-copies when deck requires more than stash has', () => {
        const deckCards = stacks(['CARD_A', 5]);
        const stashCards = stacks(['CARD_A', 3]);

        expect(validateDeckAvailability(deckCards, stashCards)).toEqual([
            {
                kind: 'insufficient-copies',
                cardId: 'CARD_A',
                required: 5,
                available: 3,
            },
        ]);
    });

    it('reports insufficient-copies when card is entirely missing from stash', () => {
        const deckCards = stacks(['CARD_MISSING', 2]);
        const stashCards = stacks(['CARD_A', 3]);

        expect(validateDeckAvailability(deckCards, stashCards)).toEqual([
            {
                kind: 'insufficient-copies',
                cardId: 'CARD_MISSING',
                required: 2,
                available: 0,
            },
        ]);
    });

    it('reports multiple issues for different cards with insufficient copies', () => {
        const deckCards = stacks(['CARD_A', 10], ['CARD_B', 5], ['CARD_C', 1]);
        const stashCards = stacks(['CARD_A', 3], ['CARD_B', 2]);

        expect(validateDeckAvailability(deckCards, stashCards)).toEqual([
            { kind: 'insufficient-copies', cardId: 'CARD_A', required: 10, available: 3 },
            { kind: 'insufficient-copies', cardId: 'CARD_B', required: 5, available: 2 },
            { kind: 'insufficient-copies', cardId: 'CARD_C', required: 1, available: 0 },
        ]);
    });

    it('skips zero-count and negative-count deck stacks', () => {
        const deckCards = stacks(['CARD_A', 0], ['CARD_B', -1], ['CARD_C', 2]);
        const stashCards = stacks(['CARD_C', 1]);

        expect(validateDeckAvailability(deckCards, stashCards)).toEqual([
            { kind: 'insufficient-copies', cardId: 'CARD_C', required: 2, available: 1 },
        ]);
    });

    it('returns empty array for an empty deck', () => {
        expect(validateDeckAvailability([], stacks(['CARD_A', 3]))).toEqual([]);
    });
});

describe('addSavedDeckToStash', () => {
    it('adds a new saved deck to the stash', () => {
        const stash = createStash();
        const result = addSavedDeckToStash(stash, 'deck-3', 'Deck Three', stacks(['CARD_A', 1]));

        expect(result.savedDecks).toHaveLength(3);
        expect(result.savedDecks[2]).toEqual({
            id: 'deck-3',
            name: 'Deck Three',
            cards: stacks(['CARD_A', 1]),
        });
    });

    it('does not mutate the input stash', () => {
        const stash = createStash();
        addSavedDeckToStash(stash, 'deck-3', 'Deck Three', stacks(['CARD_A', 1]));

        expect(stash.savedDecks).toHaveLength(2);
    });

    it('does not mutate the input saved deck cards', () => {
        const stash = createStash();
        const originalCards = stash.savedDecks[0].cards;
        addSavedDeckToStash(stash, 'deck-3', 'Deck Three', stacks(['CARD_A', 1]));

        expect(stash.savedDecks[0].cards).toBe(originalCards);
    });

    it('does not share card stack objects with the result', () => {
        const stash = createStash();
        const result = addSavedDeckToStash(stash, 'deck-3', 'Deck Three', stacks(['CARD_A', 1]));

        expect(result.savedDecks[0].cards[0]).not.toBe(stash.savedDecks[0].cards[0]);
        expect(result.savedDecks[2].cards[0]).not.toBe(stash.savedDecks[0].cards[0]);
    });

    it('keeps existing selectedDeckId when one is already selected', () => {
        const stash = createStash({ selectedDeckId: 'deck-1' });
        const result = addSavedDeckToStash(stash, 'deck-3', 'Deck Three', stacks(['CARD_A', 1]));

        expect(result.selectedDeckId).toBe('deck-1');
    });

    it('auto-selects the new deck when no deck was selected', () => {
        const stash = createStash({ savedDecks: [], selectedDeckId: null });
        const result = addSavedDeckToStash(stash, 'deck-new', 'New Deck', stacks(['CARD_A', 1]));

        expect(result.selectedDeckId).toBe('deck-new');
    });

    it('falls back to the default id and name when given null/undefined identity', () => {
        const stash = createStash({ savedDecks: [], selectedDeckId: null });
        const result = addSavedDeckToStash(stash, null, undefined, stacks(['CARD_A', 1]));

        expect(result.savedDecks[0].id).toBe('starter-deck');
        expect(result.savedDecks[0].name).toBe('Starter Deck');
    });

    it('adds an invalid deck (too few cards) without rejecting it', () => {
        const stash = createStash();
        const result = addSavedDeckToStash(stash, 'tiny-deck', 'Tiny', stacks(['CARD_A', 1]));

        expect(result.savedDecks).toHaveLength(3);
        expect(validateDeckSize(result.savedDecks[2].cards)).toEqual({
            kind: 'too-few-cards',
            count: 1,
            min: DECK_CARD_MIN,
        });
    });

    it('adds a deck with unavailable cards without rejecting it', () => {
        const stash = createStash();
        const result = addSavedDeckToStash(stash, 'greedy-deck', 'Greedy', stacks(['CARD_A', 99]));

        expect(result.savedDecks).toHaveLength(3);
        expect(validateDeckAvailability(result.savedDecks[2].cards, stash.cards)).toHaveLength(1);
    });
});

describe('updateSavedDeckInStash', () => {
    it('updates the cards of the target deck', () => {
        const stash = createStash();
        const newCards = stacks(['CARD_A', 3], ['CARD_C', 2]);
        const result = updateSavedDeckInStash(stash, 'deck-1', newCards);

        expect(result.savedDecks[0].cards).toEqual(newCards);
    });

    it('does not mutate the input stash', () => {
        const stash = createStash();
        const originalCards = stash.savedDecks[0].cards;
        updateSavedDeckInStash(stash, 'deck-1', stacks(['CARD_A', 1]));

        expect(stash.savedDecks[0].cards).toBe(originalCards);
        expect(stash.savedDecks[0].cards).toEqual(stacks(['CARD_A', 2], ['CARD_B', 1]));
    });

    it('does not mutate input card stacks', () => {
        const stash = createStash();
        const inputCards = stacks(['CARD_A', 5]);
        updateSavedDeckInStash(stash, 'deck-1', inputCards);

        expect(inputCards).toEqual(stacks(['CARD_A', 5]));
    });

    it('leaves other decks unchanged', () => {
        const stash = createStash();
        const result = updateSavedDeckInStash(stash, 'deck-1', stacks(['CARD_C', 1]));

        expect(result.savedDecks[1]).toEqual(stash.savedDecks[1]);
    });

    it('preserves selectedDeckId when updating a non-selected deck', () => {
        const stash = createStash({ selectedDeckId: 'deck-1' });
        const result = updateSavedDeckInStash(stash, 'deck-2', stacks(['CARD_A', 1]));

        expect(result.selectedDeckId).toBe('deck-1');
    });

    it('does not share card stack objects between result decks', () => {
        const stash = createStash();
        const result = updateSavedDeckInStash(stash, 'deck-1', stacks(['CARD_A', 1]));

        expect(result.savedDecks[0].cards[0]).not.toBe(result.savedDecks[1].cards[0]);
    });

    it('updates to an invalid deck without rejecting it', () => {
        const stash = createStash();
        const result = updateSavedDeckInStash(stash, 'deck-1', stacks(['CARD_A', 1]));

        expect(result.savedDecks).toHaveLength(2);
        expect(validateDeckSize(result.savedDecks[0].cards)).toEqual({
            kind: 'too-few-cards',
            count: 1,
            min: DECK_CARD_MIN,
        });
    });
});

describe('renameSavedDeckInStash', () => {
    it('renames the target deck', () => {
        const stash = createStash();
        const result = renameSavedDeckInStash(stash, 'deck-1', 'Renamed Deck');

        expect(result.savedDecks[0].name).toBe('Renamed Deck');
    });

    it('does not mutate the input stash', () => {
        const stash = createStash();
        renameSavedDeckInStash(stash, 'deck-1', 'Renamed');

        expect(stash.savedDecks[0].name).toBe('Deck One');
    });

    it('leaves other decks unchanged', () => {
        const stash = createStash();
        const result = renameSavedDeckInStash(stash, 'deck-1', 'Renamed');

        expect(result.savedDecks[1]).toEqual(stash.savedDecks[1]);
    });

    it('falls back to deckId when given an empty or whitespace-only name', () => {
        const stash = createStash();
        const emptyResult = renameSavedDeckInStash(stash, 'deck-1', '');
        const whitespaceResult = renameSavedDeckInStash(stash, 'deck-1', '   ');

        expect(emptyResult.savedDecks[0].name).toBe('deck-1');
        expect(whitespaceResult.savedDecks[0].name).toBe('deck-1');
    });

    it('preserves other stash properties', () => {
        const stash = createStash({ spiritStones: 42 });
        const result = renameSavedDeckInStash(stash, 'deck-1', 'Renamed');

        expect(result.spiritStones).toBe(42);
        expect(result.cards).toEqual(stash.cards);
    });

    it('does not share card stack objects with the input after rename', () => {
        const stash = createStash();
        const result = renameSavedDeckInStash(stash, 'deck-1', 'Renamed');

        expect(result.savedDecks[0].cards[0]).not.toBe(stash.savedDecks[0].cards[0]);
    });
});

describe('deleteSavedDeckFromStash', () => {
    it('removes the target deck from savedDecks', () => {
        const stash = createStash();
        const result = deleteSavedDeckFromStash(stash, 'deck-1');

        expect(result.savedDecks).toHaveLength(1);
        expect(result.savedDecks[0].id).toBe('deck-2');
    });

    it('does not mutate the input stash', () => {
        const stash = createStash();
        deleteSavedDeckFromStash(stash, 'deck-1');

        expect(stash.savedDecks).toHaveLength(2);
    });

    it('does not share card stacks with the input', () => {
        const stash = createStash();
        const result = deleteSavedDeckFromStash(stash, 'deck-1');

        expect(result.savedDecks[0].cards[0]).not.toBe(stash.savedDecks[1].cards[0]);
    });

    it('resolves selectedDeckId to the remaining deck when the selected deck is deleted', () => {
        const stash = createStash({ selectedDeckId: 'deck-1' });
        const result = deleteSavedDeckFromStash(stash, 'deck-1');

        expect(result.selectedDeckId).toBe('deck-2');
    });

    it('sets selectedDeckId to null when the last deck is deleted', () => {
        const stash = createStash({
            savedDecks: [{ id: 'only-deck', name: 'Only', cards: stacks(['CARD_A', 1]) }],
            selectedDeckId: 'only-deck',
        });
        const result = deleteSavedDeckFromStash(stash, 'only-deck');

        expect(result.savedDecks).toHaveLength(0);
        expect(result.selectedDeckId).toBeNull();
    });

    it('preserves selectedDeckId when a non-selected deck is deleted', () => {
        const stash = createStash({ selectedDeckId: 'deck-1' });
        const result = deleteSavedDeckFromStash(stash, 'deck-2');

        expect(result.selectedDeckId).toBe('deck-1');
    });

    it('does not mutate the stash cards collection', () => {
        const stash = createStash();
        const result = deleteSavedDeckFromStash(stash, 'deck-1');

        expect(result.cards).toEqual(stash.cards);
        expect(result.cards[0]).not.toBe(stash.cards[0]);
    });
});

describe('selectDeckInStash', () => {
    it('selects a valid deck by id', () => {
        const stash = createStash({ selectedDeckId: 'deck-1' });
        const result = selectDeckInStash(stash, 'deck-2');

        expect(result.selectedDeckId).toBe('deck-2');
    });

    it('does not mutate the input stash', () => {
        const stash = createStash({ selectedDeckId: 'deck-1' });
        selectDeckInStash(stash, 'deck-2');

        expect(stash.selectedDeckId).toBe('deck-1');
    });

    it('falls back to the first deck when given an invalid deck id', () => {
        const stash = createStash();
        const result = selectDeckInStash(stash, 'nonexistent');

        expect(result.selectedDeckId).toBe('deck-1');
    });

    it('falls back to the first deck when given null', () => {
        const stash = createStash();
        const result = selectDeckInStash(stash, null);

        expect(result.selectedDeckId).toBe('deck-1');
    });

    it('returns null selectedDeckId when given null and there are no saved decks', () => {
        const stash = createStash({ savedDecks: [], selectedDeckId: null });
        const result = selectDeckInStash(stash, null);

        expect(result.selectedDeckId).toBeNull();
    });

    it('preserves all other stash properties', () => {
        const stash = createStash({ spiritStones: 99 });
        const result = selectDeckInStash(stash, 'deck-2');

        expect(result.spiritStones).toBe(99);
        expect(result.cards).toEqual(stash.cards);
        expect(result.savedDecks).toEqual(stash.savedDecks);
    });
});

describe('invalid deck preservation', () => {
    it('keeps too-small decks in savedDecks after add', () => {
        const stash = createStash();
        const result = addSavedDeckToStash(stash, 'small-deck', 'Small', deckOfSize(5));

        expect(result.savedDecks).toHaveLength(3);
        expect(result.savedDecks[2].id).toBe('small-deck');
    });

    it('keeps too-large decks in savedDecks after add', () => {
        const stash = createStash();
        const result = addSavedDeckToStash(stash, 'big-deck', 'Big', deckOfSize(60));

        expect(result.savedDecks).toHaveLength(3);
        expect(result.savedDecks[2].id).toBe('big-deck');
    });

    it('keeps decks with unavailable cards in savedDecks after update', () => {
        const stash = createStash();
        const result = updateSavedDeckInStash(stash, 'deck-1', stacks(['CARD_MISSING', 5]));

        expect(result.savedDecks).toHaveLength(2);
        expect(result.savedDecks[0].id).toBe('deck-1');
        expect(validateDeckAvailability(result.savedDecks[0].cards, stash.cards)).toHaveLength(1);
    });
});

describe('DECK_CARD_MIN and DECK_CARD_MAX constants', () => {
    it('defines DECK_CARD_MIN as 20', () => {
        expect(DECK_CARD_MIN).toBe(20);
    });

    it('defines DECK_CARD_MAX as 40', () => {
        expect(DECK_CARD_MAX).toBe(40);
    });

    it('ensures min is less than max', () => {
        expect(DECK_CARD_MIN).toBeLessThan(DECK_CARD_MAX);
    });
});
