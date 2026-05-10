import type {
    ExpeditionCardStack,
    ExpeditionItemType,
    ExpeditionItemStack,
    PersistentStash,
} from '../types/expedition';

export interface StarterDeckSeed {
    cards: ExpeditionCardStack[];
}

export interface WorldStateItemStackSeed {
    id: string;
    itemType: string;
    count: number;
}

export interface WorldStateStashSeed {
    stashId?: string;
    deckRef?: string;
    items?: WorldStateItemStackSeed[];
    spiritStones?: number;
}

export interface ExpeditionWorldStateSeed {
    stash?: WorldStateStashSeed;
}

export interface PersistentStashSeedSources {
    worldState: ExpeditionWorldStateSeed;
    starterDeck: StarterDeckSeed;
}

const DEFAULT_STASH_ID = 'phase01.starter-stash';
const DEFAULT_DECK_REF = 'starter-deck';
const DEFAULT_STARTER_ITEMS: ExpeditionItemStack[] = [
    { id: 'tool.return-rope', itemType: 'tool', count: 1 },
    { id: 'consumable.spirit-salve', itemType: 'consumable', count: 2 },
];
const DEFAULT_STARTER_SPIRIT_STONES = 36;

function cloneCardStacks(stacks: ExpeditionCardStack[]): ExpeditionCardStack[] {
    return stacks.map((stack) => ({ ...stack }));
}

function parseExpeditionItemType(itemType: string): ExpeditionItemType {
    switch (itemType) {
        case 'artifact':
        case 'tool':
        case 'consumable':
        case 'quest':
            return itemType;
        default:
            throw new Error(`World state stash itemType is unsupported: ${itemType}`);
    }
}

function cloneItemStacks(stacks: WorldStateItemStackSeed[]): ExpeditionItemStack[] {
    return stacks.map((stack) => ({
        id: stack.id,
        itemType: parseExpeditionItemType(stack.itemType),
        count: stack.count,
    }));
}

export function createPersistentStashFromWorldStateSeed({
    worldState,
    starterDeck,
}: PersistentStashSeedSources): PersistentStash {
    const stashSeed = worldState.stash;

    return {
        stashId: stashSeed?.stashId ?? DEFAULT_STASH_ID,
        deckRef: stashSeed?.deckRef ?? DEFAULT_DECK_REF,
        deck: cloneCardStacks(starterDeck.cards),
        items: cloneItemStacks(stashSeed?.items ?? DEFAULT_STARTER_ITEMS),
        spiritStones: stashSeed?.spiritStones ?? DEFAULT_STARTER_SPIRIT_STONES,
        lastRunSummary: null,
    };
}
