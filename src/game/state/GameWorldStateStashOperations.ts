import type {
    ExpeditionCardStack,
    ExpeditionItemStack,
    PersistentStash,
    RunRewardBundle,
    RunSnapshot,
} from '../types/expedition';

function itemStackKey(stack: Pick<ExpeditionItemStack, 'itemType' | 'id'>): string {
    return `${stack.itemType}:${stack.id}`;
}

function isPositiveCount(count: number): boolean {
    return count > 0;
}

export function cloneCardStacks(stacks: readonly ExpeditionCardStack[]): ExpeditionCardStack[] {
    return stacks.map((stack) => ({
        id: stack.id,
        count: stack.count,
    }));
}

export function cloneItemStacks(stacks: readonly ExpeditionItemStack[]): ExpeditionItemStack[] {
    return stacks.map((stack) => ({
        id: stack.id,
        itemType: stack.itemType,
        count: stack.count,
    }));
}

export function createEmptyRewardBundle(): RunRewardBundle {
    return {
        cards: [],
        items: [],
        spiritStones: 0,
    };
}

export function mergeCardStacks(
    existing: readonly ExpeditionCardStack[],
    incoming: readonly ExpeditionCardStack[],
): ExpeditionCardStack[] {
    const merged = new Map<string, ExpeditionCardStack>();

    for (const stack of [...existing, ...incoming]) {
        if (!isPositiveCount(stack.count)) {
            continue;
        }

        const current = merged.get(stack.id);
        merged.set(stack.id, {
            id: stack.id,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()];
}

export function mergeItemStacks(
    existing: readonly ExpeditionItemStack[],
    incoming: readonly ExpeditionItemStack[],
): ExpeditionItemStack[] {
    const merged = new Map<string, ExpeditionItemStack>();

    for (const stack of [...existing, ...incoming]) {
        if (!isPositiveCount(stack.count)) {
            continue;
        }

        const key = itemStackKey(stack);
        const current = merged.get(key);
        merged.set(key, {
            id: stack.id,
            itemType: stack.itemType,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()];
}

export function subtractCardStacks(
    existing: readonly ExpeditionCardStack[],
    outgoing: readonly ExpeditionCardStack[],
): ExpeditionCardStack[] {
    const remaining = mergeCardStacks(existing, []);
    const remainingById = new Map(remaining.map((stack) => [stack.id, stack]));

    for (const stack of outgoing) {
        if (!isPositiveCount(stack.count)) {
            continue;
        }

        const current = remainingById.get(stack.id);

        if (!current) {
            continue;
        }

        current.count -= stack.count;
    }

    return remaining.filter((stack) => isPositiveCount(stack.count));
}

export function subtractItemStacks(
    existing: readonly ExpeditionItemStack[],
    outgoing: readonly ExpeditionItemStack[],
): ExpeditionItemStack[] {
    const remaining = mergeItemStacks(existing, []);
    const remainingByKey = new Map(remaining.map((stack) => [itemStackKey(stack), stack]));

    for (const stack of outgoing) {
        if (!isPositiveCount(stack.count)) {
            continue;
        }

        const current = remainingByKey.get(itemStackKey(stack));

        if (!current) {
            continue;
        }

        current.count -= stack.count;
    }

    return remaining.filter((stack) => isPositiveCount(stack.count));
}

export function createStartingLoadoutFromStash(stash: PersistentStash): RunRewardBundle {
    return {
        cards: cloneCardStacks(stash.deck),
        items: cloneItemStacks(stash.items),
        spiritStones: stash.spiritStones,
    };
}

export function createCarriedBundleFromRun(run: RunSnapshot): RunRewardBundle {
    return {
        cards: cloneCardStacks(run.carriedDeck),
        items: cloneItemStacks(run.carriedItems),
        spiritStones: run.spiritStones,
    };
}

export function addRewardBundleToCarriedBundle(
    carried: RunRewardBundle,
    rewards: RunRewardBundle,
): RunRewardBundle {
    return {
        cards: mergeCardStacks(carried.cards, rewards.cards),
        items: mergeItemStacks(carried.items, rewards.items),
        spiritStones: carried.spiritStones + rewards.spiritStones,
    };
}

export function subtractStartingLoadoutFromStash(
    stash: PersistentStash,
    startingLoadout: RunRewardBundle,
): PersistentStash {
    return {
        ...stash,
        deck: subtractCardStacks(stash.deck, startingLoadout.cards),
        items: subtractItemStacks(stash.items, startingLoadout.items),
        spiritStones: Math.max(0, stash.spiritStones - Math.max(0, startingLoadout.spiritStones)),
    };
}

export function addCarriedBundleToStash(
    stash: PersistentStash,
    carried: RunRewardBundle,
): PersistentStash {
    return {
        ...stash,
        deck: mergeCardStacks(stash.deck, carried.cards),
        items: mergeItemStacks(stash.items, carried.items),
        spiritStones: stash.spiritStones + carried.spiritStones,
    };
}
