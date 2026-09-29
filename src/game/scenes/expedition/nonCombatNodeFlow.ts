import { canAcceptItemRewards, countOccupiedItemSlots, resolveItemSlotCapacity } from '../../state/ItemCapacity';
import { previewShopExchange } from '../../state/ShopExchange';
import type {
    ExpeditionEventOutcomeSelection,
    PrototypeEventDefinition,
    PrototypeEventOutcome,
    PrototypeShopDefinition,
    PrototypeShopOffer,
    RunRewardBundle,
    RunSnapshot,
} from '../../types/expedition';

export interface EventNodeView {
    title: string;
    description: string;
    outcome: PrototypeEventOutcome;
    rewardSummary: string;
    claimed: boolean;
    inventoryFull: boolean;
}

export interface CreateEventNodeViewOptions {
    outcomeSelection?: ExpeditionEventOutcomeSelection;
    rewardName?: (id: string) => string;
}

export class MissingFixedEventOutcomeError extends Error {
    readonly nodeId: string;
    readonly outcomeId: string;

    constructor(nodeId: string, outcomeId: string) {
        super(`Missing fixed expedition event outcome: nodeId=${nodeId} outcomeId=${outcomeId}`);
        this.name = 'MissingFixedEventOutcomeError';
        this.nodeId = nodeId;
        this.outcomeId = outcomeId;
    }
}

export type ShopOfferViewState = 'available' | 'purchased' | 'unaffordable' | 'insufficientItems' | 'equippedItem' | 'inventoryFull';

export interface ShopOfferView extends PrototypeShopOffer {
    offer: PrototypeShopOffer;
    state: ShopOfferViewState;
    costText: string;
    rewardSummary: string;
}

export interface ShopNodeView {
    title: string;
    description: string;
    spiritStones: number;
    occupiedItemSlots: number;
    itemSlotCapacity: number;
    offers: ShopOfferView[];
}

export interface ExtractNodeView {
    nodeId: string;
    recorded: boolean;
}

function countRewardEntries(rewards: RunRewardBundle, itemName: (id: string) => string): string[] {
    const entries = [
        ...rewards.cards.filter((stack) => stack.count > 0).map((stack) => `${itemName(stack.id)} +${stack.count}`),
        ...rewards.items.filter((stack) => stack.count > 0).map((stack) => `${itemName(stack.id)} +${stack.count}`),
    ];

    if (rewards.spiritStones !== 0) {
        entries.push(`灵石 +${rewards.spiritStones}`);
    }

    return entries;
}

function createRewardSummary(rewards: RunRewardBundle, itemName: (id: string) => string = id => id): string {
    const entries = countRewardEntries(rewards, itemName);
    return entries.length > 0 ? entries.join(' · ') : '无奖励';
}

function selectWeightedOutcome(definition: PrototypeEventDefinition, random: () => number): PrototypeEventOutcome {
    const totalWeight = definition.pool.reduce((sum, outcome) => sum + Math.max(0, outcome.weight), 0);
    let roll = random() * totalWeight;

    for (const outcome of definition.pool) {
        roll -= Math.max(0, outcome.weight);

        if (roll <= 0) {
            return outcome;
        }
    }

    return definition.pool[definition.pool.length - 1];
}

function selectFixedOutcome(definition: PrototypeEventDefinition, outcomeId: string): PrototypeEventOutcome {
    const outcome = definition.pool.find((candidate) => candidate.id === outcomeId);

    if (!outcome) {
        throw new MissingFixedEventOutcomeError(definition.nodeId, outcomeId);
    }

    return outcome;
}

function selectEventOutcome(
    definition: PrototypeEventDefinition,
    random: () => number,
    selection?: ExpeditionEventOutcomeSelection,
): PrototypeEventOutcome {
    if (!selection || selection.kind === 'weightedRandom') {
        return selectWeightedOutcome(definition, random);
    }

    return selectFixedOutcome(definition, selection.outcomeId);
}

export function createEventNodeView(
    definition: PrototypeEventDefinition,
    run: RunSnapshot,
    random: () => number = Math.random,
    options: CreateEventNodeViewOptions = {},
): EventNodeView {
    const outcome = selectEventOutcome(definition, random, options.outcomeSelection);

    return {
        title: definition.title,
        description: definition.description,
        outcome,
        rewardSummary: createRewardSummary(outcome.rewards, options.rewardName),
        claimed: run.nodeStates[definition.nodeId]?.rewardClaimed === true,
        inventoryFull: !canAcceptItemRewards(run.carriedItems, outcome.rewards.items, run.itemSlotCapacity),
    };
}

export function createShopNodeView(
    definition: PrototypeShopDefinition,
    run: RunSnapshot,
    itemName: (id: string) => string = id => id,
): ShopNodeView {
    const purchasedOfferIds = run.nodeStates[definition.nodeId]?.purchasedOfferIds ?? [];

    return {
        title: definition.title,
        description: definition.description,
        spiritStones: run.spiritStones,
        occupiedItemSlots: countOccupiedItemSlots(run.carriedItems),
        itemSlotCapacity: resolveItemSlotCapacity(run.itemSlotCapacity),
        offers: definition.offers.map((offer) => {
            const exchange = previewShopExchange(run, offer.cost, offer.rewards);
            const prices = [
                ...(offer.cost.spiritStones ? [`灵石 ×${offer.cost.spiritStones}`] : []),
                ...(offer.cost.items ?? []).map(item => `${itemName(item.id)} ×${item.count}`),
            ];
            return {
                ...offer,
                offer,
                state: purchasedOfferIds.includes(offer.id) ? 'purchased'
                    : exchange.status === 'insufficientFunds' ? 'unaffordable' : exchange.status,
                costText: prices.join(' · ') || '免费',
                rewardSummary: createRewardSummary(offer.rewards, itemName),
            };
        }),
    };
}

export function createExtractNodeView(nodeId: string, run: RunSnapshot): ExtractNodeView {
    return {
        nodeId,
        recorded: run.pendingTerminalResolution?.kind === 'extract'
            && run.pendingTerminalResolution.nodeId === nodeId,
    };
}
