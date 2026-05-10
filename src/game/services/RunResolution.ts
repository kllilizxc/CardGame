import {
    loadActiveRun,
    loadPersistentStash,
    normalizeActiveRunRouteKey,
    resolveRunPersistenceStorageAdapter,
    type ActiveRunStorageLookup,
    type ActiveRunTargetIdentity,
    type RunPersistenceStorageAdapter,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import {
    writeGameWorldStatePersistentStashPlan,
    type GameWorldStatePersistentStashWritePlan,
} from '../state/GameWorldStatePersistentStashWrite';
import {
    clearGameWorldStateActiveRun,
    planGameWorldStateActiveRunWriteFromDocument,
    writeGameWorldStateActiveRunPlan,
} from '../state/GameWorldStateActiveRunWrite';
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
    storage?: RunPersistenceStorageAdapter;
}

interface ResolvedRunContext {
    run: RunSnapshot;
    stash: PersistentStash;
    storage: RunPersistenceStorageAdapter;
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

function resolveRun(options: RunResolutionOptions): ResolvedRunContext {
    const storage = resolveRunPersistenceStorageAdapter(options.storage);
    const run = options.run ?? loadActiveRun(options.activeRunRouteKey, options.targetIdentity, storage);
    const stash = options.stash ?? loadPersistentStash(storage);

    if (!run) {
        throw new Error('Cannot resolve expedition run because there is no active run.');
    }

    if (!stash) {
        throw new Error('Cannot resolve expedition run because there is no persistent stash.');
    }

    return { run, stash, storage };
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

function getActiveRunWriteLookup(run: RunSnapshot, options: RunResolutionOptions): ActiveRunStorageLookup {
    return options.activeRunRouteKey ?? run.routeKey ?? getActiveRunIdentity(run, options);
}

function clearResolvedActiveRun(
    run: RunSnapshot,
    options: RunResolutionOptions,
    storage: RunPersistenceStorageAdapter,
): void {
    clearGameWorldStateActiveRun({
        storage,
        activeRunLookup: getActiveRunWriteLookup(run, options),
        activeRunIdentity: getActiveRunIdentity(run, options),
    });
}

function writeResolvedPersistentStash(
    resolvedStash: PersistentStash,
    storage: RunPersistenceStorageAdapter,
): void {
    const writePlan: GameWorldStatePersistentStashWritePlan = {
        source: 'stored-stash',
        storageKey: STASH_STORAGE_KEY,
        document: resolvedStash,
    };

    writeGameWorldStatePersistentStashPlan(writePlan, storage);
}

function resolveTerminalOutcome(
    outcome: TerminalRunOutcome,
    options: RunResolutionOptions = {},
): RunResolutionSummary {
    const { run, stash, storage } = resolveRun(options);
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

    writeResolvedPersistentStash(resolvedStash, storage);
    clearResolvedActiveRun(run, options, storage);

    return summary;
}

export function resolveBattleVictory(options: RunResolutionOptions = {}): BattleVictoryResolution {
    const { run, storage } = resolveRun(options);
    const finalNodeId = options.finalNodeId ?? run.currentNodeId;
    const routeKey = getActiveRunRouteKey(run, options);
    const resolvedRun: RunSnapshot = {
        ...run,
        routeKey,
        currentNodeId: finalNodeId,
        status: 'inProgress',
        pendingEncounter: null,
    };
    const writeResult = writeGameWorldStateActiveRunPlan(
        planGameWorldStateActiveRunWriteFromDocument({
            document: resolvedRun,
            activeRunLookup: getActiveRunWriteLookup(run, options),
            activeRunIdentity: getActiveRunIdentity(run, options),
        }),
        storage,
    );

    if (writeResult.operation !== 'save') {
        throw new Error('Expected GameWorldState active-run writer to save a battle-victory run document.');
    }

    return {
        run: writeResult.document,
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
