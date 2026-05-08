import type {
    ExpeditionBattleCompleteEvent,
    RunSnapshot,
    TerminalRunOutcome,
} from '../../types/expedition';

export function isTerminalBattleOutcome(result: ExpeditionBattleCompleteEvent): boolean {
    return result.outcome === 'defeat' || result.outcome === 'boss-clear';
}

export function getTerminalBattleOutcome(result: ExpeditionBattleCompleteEvent): TerminalRunOutcome | null {
    if (result.outcome === 'defeat') {
        return 'defeat';
    }

    if (result.outcome === 'boss-clear') {
        return 'boss-clear';
    }

    return null;
}

export function createRunAfterBattleVictory(
    activeRun: RunSnapshot,
    result: ExpeditionBattleCompleteEvent,
): RunSnapshot {
    return {
        ...activeRun,
        currentNodeId: result.nodeId,
        status: 'inProgress',
        pendingEncounter: null,
        visitedNodeIds: activeRun.visitedNodeIds.includes(result.nodeId)
            ? [...activeRun.visitedNodeIds]
            : [...activeRun.visitedNodeIds, result.nodeId],
        nodeStates: {
            ...activeRun.nodeStates,
            [result.nodeId]: {
                ...activeRun.nodeStates[result.nodeId],
                nodeId: result.nodeId,
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
        },
    };
}
