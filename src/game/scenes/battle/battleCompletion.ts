import type {
    BattleLaunchPayload,
    ExpeditionBattleCompleteEvent,
    ExpeditionBattleOutcome,
    ExpeditionTargetConfig,
} from '../../types/expedition';

function getBattleOutcome(payload: BattleLaunchPayload, victory: boolean): ExpeditionBattleOutcome {
    if (!victory) {
        return 'defeat';
    }

    return payload.nodeType === 'boss' ? 'boss-clear' : 'battle-victory';
}

function cloneTargetConfig(targetConfig: ExpeditionTargetConfig): ExpeditionTargetConfig {
    return {
        expeditionId: targetConfig.expeditionId,
        mapId: targetConfig.mapId,
        worldStateFile: targetConfig.worldStateFile,
        starterDeckFile: targetConfig.starterDeckFile,
        mapFile: targetConfig.mapFile,
        eventsFile: targetConfig.eventsFile,
        shopFile: targetConfig.shopFile,
    };
}

export function createExpeditionBattleCompleteEvent(
    payload: BattleLaunchPayload,
    victory: boolean,
    completedAt = new Date().toISOString(),
): ExpeditionBattleCompleteEvent {
    const targetConfig = payload.targetConfig ? cloneTargetConfig(payload.targetConfig) : undefined;

    return {
        runId: payload.runId,
        nodeId: payload.nodeId,
        nodeType: payload.nodeType,
        encounterId: payload.encounterId,
        encounterFile: payload.encounterFile,
        victory,
        outcome: getBattleOutcome(payload, victory),
        completedAt,
        ...(targetConfig ? { targetConfig } : {}),
    };
}
