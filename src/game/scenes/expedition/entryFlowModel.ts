import type { PersistentStash, RunResolutionSummary, RunSnapshot } from '../../types/expedition';

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

export interface RunResolutionSummaryView {
    outcome: RunResolutionSummary['outcome'];
    title: string;
    subtitle: string;
    finalNodeId: string;
    keptCards: string[];
    keptItems: string[];
    keptSpiritStones: string;
    lostCards: string[];
    lostItems: string[];
    lostSpiritStones: string;
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

function formatStacks<T extends { id: string; count: number }>(stacks: T[]): string[] {
    return stacks.length > 0 ? stacks.map((stack) => `${stack.id} ×${stack.count}`) : ['无'];
}

function getResolutionCopy(outcome: RunResolutionSummary['outcome']): { title: string; subtitle: string } {
    switch (outcome) {
        case 'defeat':
            return {
                title: '探索失败',
                subtitle: '战败：本次携带与搜刮的资产全部遗失。',
            };
        case 'extract':
            return {
                title: '撤离成功',
                subtitle: '撤离成功：当前携带与搜刮的资产已存入永久仓库。',
            };
        case 'boss-clear':
            return {
                title: 'Boss 通关',
                subtitle: 'Boss 通关：当前携带与搜刮的资产已存入永久仓库。',
            };
    }
}

function getEntranceOutcomeLabel(outcome: RunResolutionSummary['outcome']): string {
    switch (outcome) {
        case 'defeat':
            return '探索失败';
        case 'extract':
            return '撤离成功';
        case 'boss-clear':
            return 'Boss 通关';
    }
}

export function createPostRunEntranceStatus(
    stash: PersistentStash,
    summary: RunResolutionSummary,
): string {
    return `${createPreparationSummary(stash).statusText}\n` +
        `上次结果：${getEntranceOutcomeLabel(summary.outcome)}（${summary.finalNodeId}）。可立即开始新的秘境探索。`;
}

export function createRunResolutionSummaryView(summary: RunResolutionSummary): RunResolutionSummaryView {
    const copy = getResolutionCopy(summary.outcome);
    const kept = summary.outcome === 'defeat'
        ? { cards: [], items: [], spiritStones: 0 }
        : summary.kept;

    return {
        outcome: summary.outcome,
        title: copy.title,
        subtitle: copy.subtitle,
        finalNodeId: summary.finalNodeId,
        keptCards: formatStacks(kept.cards),
        keptItems: formatStacks(kept.items),
        keptSpiritStones: String(kept.spiritStones),
        lostCards: formatStacks(summary.lost.cards),
        lostItems: formatStacks(summary.lost.items),
        lostSpiritStones: String(summary.lost.spiritStones),
    };
}
