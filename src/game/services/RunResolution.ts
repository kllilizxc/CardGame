import {
    clearActiveRun,
    loadActiveRun,
    loadPersistentStash,
    normalizeActiveRunRouteKey,
    saveActiveRun,
    savePersistentStash,
    type ActiveRunTargetIdentity,
} from './RunPersistence';
import type {
    ExpeditionCardStack,
    ExpeditionItemStack,
    PersistentStash,
    RunRewardBundle,
    RunResolutionSummary,
    RunSnapshot,
    TerminalRunOutcome,
} from '../types/expedition';

export interface RunResolutionOptions {
    finalNodeId?: string;
    endedAt?: string;
    run?: RunSnapshot | null;
    stash?: PersistentStash | null;
    targetIdentity?: ActiveRunTargetIdentity;
    activeRunRouteKey?: string;
}

export interface BattleVictoryResolution {
    run: RunSnapshot;
    finalNodeId: string;
}

function cloneCardStacks(stacks: ExpeditionCardStack[]): ExpeditionCardStack[] {
    return stacks.map((stack) => ({ ...stack }));
}

function cloneItemStacks(stacks: ExpeditionItemStack[]): ExpeditionItemStack[] {
    return stacks.map((stack) => ({ ...stack }));
}

function createEmptyRewardBundle(): RunRewardBundle {
    return {
        cards: [],
        items: [],
        spiritStones: 0,
    };
}

function createCarriedBundle(run: RunSnapshot): RunRewardBundle {
    return {
        cards: cloneCardStacks(run.carriedDeck),
        items: cloneItemStacks(run.carriedItems),
        spiritStones: run.spiritStones,
    };
}

function mergeCardStacks(existing: ExpeditionCardStack[], incoming: ExpeditionCardStack[]): ExpeditionCardStack[] {
    const merged = new Map<string, ExpeditionCardStack>();

    for (const stack of existing) {
        if (stack.count > 0) {
            merged.set(stack.id, { ...stack });
        }
    }

    for (const stack of incoming) {
        if (stack.count <= 0) {
            continue;
        }

        const current = merged.get(stack.id);
        merged.set(stack.id, {
            id: stack.id,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()].filter((stack) => stack.count > 0);
}

function mergeItemStacks(existing: ExpeditionItemStack[], incoming: ExpeditionItemStack[]): ExpeditionItemStack[] {
    const merged = new Map<string, ExpeditionItemStack>();

    for (const stack of existing) {
        if (stack.count > 0) {
            merged.set(`${stack.itemType}:${stack.id}`, { ...stack });
        }
    }

    for (const stack of incoming) {
        if (stack.count <= 0) {
            continue;
        }

        const key = `${stack.itemType}:${stack.id}`;
        const current = merged.get(key);
        merged.set(key, {
            ...stack,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()].filter((stack) => stack.count > 0);
}

function subtractCardStacks(existing: ExpeditionCardStack[], outgoing: ExpeditionCardStack[]): ExpeditionCardStack[] {
    const remaining = new Map<string, ExpeditionCardStack>();

    for (const stack of existing) {
        remaining.set(stack.id, { ...stack });
    }

    for (const stack of outgoing) {
        const current = remaining.get(stack.id);

        if (!current) {
            continue;
        }

        const count = current.count - stack.count;

        if (count > 0) {
            remaining.set(stack.id, { id: stack.id, count });
        } else {
            remaining.delete(stack.id);
        }
    }

    return [...remaining.values()];
}

function subtractItemStacks(existing: ExpeditionItemStack[], outgoing: ExpeditionItemStack[]): ExpeditionItemStack[] {
    const remaining = new Map<string, ExpeditionItemStack>();

    for (const stack of existing) {
        remaining.set(`${stack.itemType}:${stack.id}`, { ...stack });
    }

    for (const stack of outgoing) {
        const key = `${stack.itemType}:${stack.id}`;
        const current = remaining.get(key);

        if (!current) {
            continue;
        }

        const count = current.count - stack.count;

        if (count > 0) {
            remaining.set(key, { ...current, count });
        } else {
            remaining.delete(key);
        }
    }

    return [...remaining.values()];
}

function subtractStartingLoadout(stash: PersistentStash, run: RunSnapshot): PersistentStash {
    return {
        ...stash,
        deck: subtractCardStacks(stash.deck, run.startingLoadout.cards),
        items: subtractItemStacks(stash.items, run.startingLoadout.items),
        spiritStones: Math.max(0, stash.spiritStones - run.startingLoadout.spiritStones),
    };
}

function addCarriedBundle(stash: PersistentStash, carried: RunRewardBundle): PersistentStash {
    return {
        ...stash,
        deck: mergeCardStacks(stash.deck, carried.cards),
        items: mergeItemStacks(stash.items, carried.items),
        spiritStones: stash.spiritStones + carried.spiritStones,
    };
}

function resolveRun(options: RunResolutionOptions): { run: RunSnapshot; stash: PersistentStash } {
    const run = options.run ?? loadActiveRun(options.activeRunRouteKey, options.targetIdentity);
    const stash = options.stash ?? loadPersistentStash();

    if (!run) {
        throw new Error('Cannot resolve expedition run because there is no active run.');
    }

    if (!stash) {
        throw new Error('Cannot resolve expedition run because there is no persistent stash.');
    }

    return { run, stash };
}

function getActiveRunIdentity(run: RunSnapshot, options: RunResolutionOptions): ActiveRunTargetIdentity {
    return options.targetIdentity ?? run;
}

function getActiveRunRouteKey(run: RunSnapshot, options: RunResolutionOptions): string {
    return normalizeActiveRunRouteKey(
        options.activeRunRouteKey ?? run.routeKey,
        getActiveRunIdentity(run, options),
    );
}

function clearResolvedActiveRun(run: RunSnapshot, options: RunResolutionOptions): void {
    clearActiveRun(options.activeRunRouteKey, getActiveRunIdentity(run, options));
}

function resolveTerminalOutcome(
    outcome: TerminalRunOutcome,
    options: RunResolutionOptions = {},
): RunResolutionSummary {
    const { run, stash } = resolveRun(options);
    const finalNodeId = options.finalNodeId ?? run.currentNodeId;
    const endedAt = options.endedAt ?? new Date().toISOString();
    const carried = createCarriedBundle(run);
    const kept = outcome === 'defeat' ? createEmptyRewardBundle() : carried;
    const lost = outcome === 'defeat' ? carried : createEmptyRewardBundle();
    const summary: RunResolutionSummary = {
        runId: run.runId,
        outcome,
        finalNodeId,
        kept,
        lost,
        endedAt,
    };
    const stashWithoutRunLoadout = subtractStartingLoadout(stash, run);
    const resolvedStash = {
        ...(outcome === 'defeat' ? stashWithoutRunLoadout : addCarriedBundle(stashWithoutRunLoadout, carried)),
        lastRunSummary: summary,
    };

    savePersistentStash(resolvedStash);
    clearResolvedActiveRun(run, options);

    return summary;
}

export function resolveBattleVictory(options: RunResolutionOptions = {}): BattleVictoryResolution {
    const { run } = resolveRun(options);
    const finalNodeId = options.finalNodeId ?? run.currentNodeId;
    const routeKey = getActiveRunRouteKey(run, options);
    const resolvedRun: RunSnapshot = {
        ...run,
        routeKey,
        currentNodeId: finalNodeId,
        status: 'inProgress',
        pendingEncounter: null,
    };
    const persistedRun = saveActiveRun(
        resolvedRun,
        options.activeRunRouteKey,
        getActiveRunIdentity(run, options),
    );

    return {
        run: persistedRun,
        finalNodeId,
    };
}

export function resolveBattleDefeat(options: RunResolutionOptions = {}): RunResolutionSummary {
    return resolveTerminalOutcome('defeat', options);
}

export function resolveExtract(options: RunResolutionOptions = {}): RunResolutionSummary {
    return resolveTerminalOutcome('extract', options);
}

export function resolveBossClear(options: RunResolutionOptions = {}): RunResolutionSummary {
    return resolveTerminalOutcome('boss-clear', options);
}
