import {
    clearActiveRun,
    loadActiveRun,
    loadPersistentStash,
    normalizeActiveRunRouteKey,
    saveActiveRun,
    savePersistentStash,
    type ActiveRunTargetIdentity,
} from './RunPersistence';
import {
    addCarriedBundleToStash,
    createCarriedBundleFromRun,
    createEmptyRewardBundle,
    subtractStartingLoadoutFromStash,
} from '../state/GameWorldStateStashOperations';
import type {
    PersistentStash,
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

export const RUN_RESOLUTION_BOUNDARY_MODULE = 'src/game/services/RunResolution.ts';
export const RUN_RESOLUTION_TERMINAL_OUTCOMES = ['defeat', 'extract', 'boss-clear'] as const satisfies readonly TerminalRunOutcome[];
const [
    RUN_RESOLUTION_DEFEAT_OUTCOME,
    RUN_RESOLUTION_EXTRACT_OUTCOME,
    RUN_RESOLUTION_BOSS_CLEAR_OUTCOME,
] = RUN_RESOLUTION_TERMINAL_OUTCOMES;

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
    const carried = createCarriedBundleFromRun(run);
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
    const stashWithoutRunLoadout = subtractStartingLoadoutFromStash(stash, run.startingLoadout);
    const resolvedStash = {
        ...(outcome === 'defeat' ? stashWithoutRunLoadout : addCarriedBundleToStash(stashWithoutRunLoadout, carried)),
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
    return resolveTerminalOutcome(RUN_RESOLUTION_DEFEAT_OUTCOME, options);
}

export function resolveExtract(options: RunResolutionOptions = {}): RunResolutionSummary {
    return resolveTerminalOutcome(RUN_RESOLUTION_EXTRACT_OUTCOME, options);
}

export function resolveBossClear(options: RunResolutionOptions = {}): RunResolutionSummary {
    return resolveTerminalOutcome(RUN_RESOLUTION_BOSS_CLEAR_OUTCOME, options);
}
