import { describe, expect, it } from 'bun:test';

import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import { DECK_CARD_MIN, countDeckCards, validateDeckSize } from '../../state/PersistentStashDecks';
import type { ExpeditionCardStack, SavedDeck } from '../../types/expedition';
import {
    buildDeckManagementPresentationViewModel,
    getDeckManagementSection,
} from './DeckManagementPresentation';

function stacks(...entries: [id: string, count: number][]): ExpeditionCardStack[] {
    return entries.map(([id, count]) => ({ id, count }));
}

function createDeck(cards: ExpeditionCardStack[]): SavedDeck {
    return {
        id: 'deck-reference',
        name: 'Reference Deck',
        cards,
    };
}

const metadata: CardMetadataMap = {
    CARD_A: { name: '赤霄', kind: 'unit', rarity: 'rare' },
    CARD_B: { name: '雷印', kind: 'skill', rarity: 'epic' },
    CARD_C: { kind: 'artifact' },
};

describe('DeckManagementPresentation', () => {
    it('defaults existing persisted cards into main while keeping extra empty without an explicit classifier', () => {
        const deck = createDeck(stacks(['CARD_A', 3], ['CARD_B', 2]));
        const presentation = buildDeckManagementPresentationViewModel(
            deck,
            stacks(['CARD_A', 4], ['CARD_B', 2]),
            metadata,
        );
        const main = getDeckManagementSection(presentation, 'main');
        const extra = getDeckManagementSection(presentation, 'extra');

        expect(main.count).toBe(5);
        expect(main.entryCount).toBe(2);
        expect(main.tiles.map((tile) => ({
            id: tile.id,
            count: tile.count,
            remainingCount: tile.remainingCount,
            shortageCount: tile.shortageCount,
        }))).toEqual([
            { id: 'CARD_A', count: 3, remainingCount: 1, shortageCount: 0 },
            { id: 'CARD_B', count: 2, remainingCount: 0, shortageCount: 0 },
        ]);
        expect(extra.count).toBe(0);
        expect(extra.tiles).toEqual([]);
        expect(presentation.totalCount).toBe(countDeckCards(deck.cards));
        expect(presentation.totalEntryCount).toBe(2);
    });

    it('supports explicit section classifiers while leaving total deck-size validation anchored to all persisted cards', () => {
        const deck = createDeck(stacks(['CARD_A', 39], ['CARD_B', 1], ['CARD_C', 2]));
        const presentation = buildDeckManagementPresentationViewModel(
            deck,
            stacks(['CARD_A', 39], ['CARD_B', 1], ['CARD_C', 2]),
            metadata,
            {
                classifySection: ({ metadata: entry }) => entry?.kind === 'skill' ? 'extra' : 'main',
            },
        );
        const main = getDeckManagementSection(presentation, 'main');
        const extra = getDeckManagementSection(presentation, 'extra');

        expect(main.count).toBe(41);
        expect(extra.count).toBe(1);
        expect(extra.tiles.map((tile) => tile.id)).toEqual(['CARD_B']);
        expect(presentation.totalCount).toBe(countDeckCards(deck.cards));
        expect(validateDeckSize(deck.cards)).toEqual({
            kind: 'too-many-cards',
            count: 42,
            max: 40,
        });
    });

    it('keeps total-card validation semantics unchanged even when presentation sections are introduced', () => {
        const deck = createDeck(stacks(['CARD_A', 10], ['CARD_B', 9]));
        const presentation = buildDeckManagementPresentationViewModel(
            deck,
            stacks(['CARD_A', 10], ['CARD_B', 9]),
            metadata,
            {
                classifySection: ({ stack }) => stack.id === 'CARD_B' ? 'extra' : 'main',
            },
        );

        expect(presentation.totalCount).toBe(19);
        expect(validateDeckSize(deck.cards)).toEqual({
            kind: 'too-few-cards',
            count: 19,
            min: DECK_CARD_MIN,
        });
    });
});
