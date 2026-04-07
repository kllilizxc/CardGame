import type { PersistentStash, RunSnapshot } from '../../types/expedition';

interface CountableStack {
    count: number;
}

export interface PreparationSummary {
    deckCount: number;
    itemCount: number;
    spiritStones: number;
    statusText: string;
}

export interface RunSummary {
    currentNodeId: string;
    currentNodeLabel: string;
    carriedDeckCount: number;
    carriedItemCount: number;
    spiritStones: number;
    statusText: string;
}

export type RunSummaryMode = 'started' | 'resumed';

export interface RunSummaryOptions {
    mode?: RunSummaryMode;
    currentNodeLabel?: string;
}

function countStacks<T extends CountableStack>(stacks: T[]): number {
    return stacks.reduce((sum, stack) => sum + stack.count, 0);
}

export function createPreparationSummary(stash: PersistentStash): PreparationSummary {
    const deckCount = countStacks(stash.deck);
    const itemCount = countStacks(stash.items);

    return {
        deckCount,
        itemCount,
        spiritStones: stash.spiritStones,
        statusText: `Starter stash ready: ${deckCount} cards, ${itemCount} items, ${stash.spiritStones} spiritStones.`,
    };
}

export function createRunSummary(run: RunSnapshot, options: RunSummaryOptions = {}): RunSummary {
    const carriedDeckCount = countStacks(run.carriedDeck);
    const carriedItemCount = countStacks(run.carriedItems);
    const runVerb = options.mode === 'started' ? 'started' : 'resumed';
    const currentNodeLabel = options.currentNodeLabel ?? run.currentNodeId;

    return {
        currentNodeId: run.currentNodeId,
        currentNodeLabel,
        carriedDeckCount,
        carriedItemCount,
        spiritStones: run.spiritStones,
        statusText: `Run ${runVerb} at ${currentNodeLabel} with ${carriedDeckCount} cards, ${carriedItemCount} items, and ${run.spiritStones} spiritStones.`,
    };
}
