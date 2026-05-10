import { describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import { createPersistentStashFromWorldStateSeed } from './GameWorldStateSeed';

describe('GameWorldStateSeed', () => {
    it('creates a persistent stash from the checked-in world seed and starter deck', () => {
        const stash = createPersistentStashFromWorldStateSeed({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(stash).toEqual({
            stashId: 'phase01.starter-stash',
            deckRef: 'starter-deck',
            deck: starterDeckJson.cards,
            items: initialWorldState.stash.items,
            spiritStones: 36,
            lastRunSummary: null,
        });
    });

    it('uses fallback starter stash defaults when optional seed fields are absent', () => {
        const stash = createPersistentStashFromWorldStateSeed({
            worldState: {},
            starterDeck: {
                cards: [{ id: 'TEST_CARD', count: 2 }],
            },
        });

        expect(stash).toEqual({
            stashId: 'phase01.starter-stash',
            deckRef: 'starter-deck',
            deck: [{ id: 'TEST_CARD', count: 2 }],
            items: [
                { id: 'tool.return-rope', itemType: 'tool', count: 1 },
                { id: 'consumable.spirit-salve', itemType: 'consumable', count: 2 },
            ],
            spiritStones: 36,
            lastRunSummary: null,
        });
    });

    it('does not share mutable deck or item references with inputs or other seeded stashes', () => {
        const worldState = {
            stash: {
                items: [{ id: 'tool.test', itemType: 'tool' as const, count: 1 }],
            },
        };
        const starterDeck = {
            cards: [{ id: 'CARD_A', count: 1 }],
        };

        const firstStash = createPersistentStashFromWorldStateSeed({ worldState, starterDeck });
        const secondStash = createPersistentStashFromWorldStateSeed({ worldState, starterDeck });

        firstStash.deck[0].count = 99;
        firstStash.items[0].count = 88;

        expect(starterDeck.cards[0].count).toBe(1);
        expect(worldState.stash.items[0].count).toBe(1);
        expect(secondStash.deck).toEqual([{ id: 'CARD_A', count: 1 }]);
        expect(secondStash.items).toEqual([{ id: 'tool.test', itemType: 'tool', count: 1 }]);
    });
});
