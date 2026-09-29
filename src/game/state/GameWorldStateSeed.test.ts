import { describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';

import {
    createItemStack,
    normalizeExpeditionWorldStateSeed,
    createItemStacksFromSeed,
} from '../testing/fixtures/expeditionWorldStateFixtures';
import { createPersistentStashFromWorldStateSeed } from './GameWorldStateSeed';

const initialWorldStateStashItems = createItemStacksFromSeed(initialWorldState.stash.items);
const createWorldStateSeed = () => normalizeExpeditionWorldStateSeed(structuredClone(initialWorldState));

describe('GameWorldStateSeed', () => {
    it('creates a persistent stash from the checked-in world seed and starter deck', () => {
        const stash = createPersistentStashFromWorldStateSeed({
            worldState: createWorldStateSeed(),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(stash).toEqual({
            stashId: 'phase01.starter-stash',
            deckRef: 'starter-deck',
            deck: starterDeckJson.cards,
            items: initialWorldStateStashItems,
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
                createItemStack('tool.return-rope', 'tool', 1),
                createItemStack('consumable.spirit-salve', 'consumable', 2),
            ],
            spiritStones: 36,
            lastRunSummary: null,
        });
    });

    it('does not share mutable deck or item references with inputs or other seeded stashes', () => {
        const worldState = {
            stash: {
                items: [createItemStack('tool.test', 'tool', 1)],
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
        expect(secondStash.items).toEqual([createItemStack('tool.test', 'tool', 1)]);
    });
});
