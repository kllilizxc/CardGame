import type {
    BattleLaunchPayload,
    ExpeditionBattleCompleteEvent,
    ExpeditionBattleOutcome,
} from '../../types/expedition';

function getBattleOutcome(payload: BattleLaunchPayload, victory: boolean): ExpeditionBattleOutcome {
    if (!victory) {
        return 'defeat';
    }

    return payload.nodeType === 'boss' ? 'boss-clear' : 'battle-victory';
}

export function createExpeditionBattleCompleteEvent(
    payload: BattleLaunchPayload,
    victory: boolean,
    completedAt = new Date().toISOString(),
): ExpeditionBattleCompleteEvent {
    return {
        runId: payload.runId,
        nodeId: payload.nodeId,
        nodeType: payload.nodeType,
        encounterId: payload.encounterId,
        encounterFile: payload.encounterFile,
        victory,
        outcome: getBattleOutcome(payload, victory),
        completedAt,
    };
}
