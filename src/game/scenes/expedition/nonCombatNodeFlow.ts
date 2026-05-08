import type {
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
}

export type ShopOfferViewState = 'available' | 'purchased' | 'unaffordable';

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
    offers: ShopOfferView[];
}

export interface ExtractNodeView {
    nodeId: string;
    recorded: boolean;
}

function countRewardEntries(rewards: RunRewardBundle): string[] {
    const entries = [
        ...rewards.cards.filter((stack) => stack.count > 0).map((stack) => `${stack.id} +${stack.count}`),
        ...rewards.items.filter((stack) => stack.count > 0).map((stack) => `${stack.id} +${stack.count}`),
    ];

    if (rewards.spiritStones !== 0) {
        entries.push(`spiritStones +${rewards.spiritStones}`);
    }

    return entries;
}

function createRewardSummary(rewards: RunRewardBundle): string {
    const entries = countRewardEntries(rewards);
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

export function createEventNodeView(
    definition: PrototypeEventDefinition,
    run: RunSnapshot,
    random: () => number = Math.random,
): EventNodeView {
    const outcome = selectWeightedOutcome(definition, random);

    return {
        title: definition.title,
        description: definition.description,
        outcome,
        rewardSummary: createRewardSummary(outcome.rewards),
        claimed: run.nodeStates[definition.nodeId]?.rewardClaimed === true,
    };
}

export function createShopNodeView(definition: PrototypeShopDefinition, run: RunSnapshot): ShopNodeView {
    const purchasedOfferIds = run.nodeStates[definition.nodeId]?.purchasedOfferIds ?? [];

    return {
        title: definition.title,
        description: definition.description,
        spiritStones: run.spiritStones,
        offers: definition.offers.map((offer) => ({
            ...offer,
            offer,
            state: purchasedOfferIds.includes(offer.id)
                ? 'purchased'
                : run.spiritStones < offer.cost.spiritStones
                    ? 'unaffordable'
                    : 'available',
            costText: `spiritStones ${offer.cost.spiritStones}`,
            rewardSummary: createRewardSummary(offer.rewards),
        })),
    };
}

export function createExtractNodeView(nodeId: string, run: RunSnapshot): ExtractNodeView {
    return {
        nodeId,
        recorded: run.pendingTerminalResolution?.kind === 'extract'
            && run.pendingTerminalResolution.nodeId === nodeId,
    };
}
