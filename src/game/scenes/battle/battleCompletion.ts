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
        routeKey: targetConfig.routeKey,
        expeditionId: targetConfig.expeditionId,
        mapId: targetConfig.mapId,
        ...(targetConfig.worldStateResourceId ? { worldStateResourceId: targetConfig.worldStateResourceId } : {}),
        worldStateFile: targetConfig.worldStateFile,
        ...(targetConfig.starterDeckResourceId ? { starterDeckResourceId: targetConfig.starterDeckResourceId } : {}),
        starterDeckFile: targetConfig.starterDeckFile,
        ...(targetConfig.mapResourceId ? { mapResourceId: targetConfig.mapResourceId } : {}),
        mapFile: targetConfig.mapFile,
        ...(targetConfig.eventsResourceId ? { eventsResourceId: targetConfig.eventsResourceId } : {}),
        eventsFile: targetConfig.eventsFile,
        ...(targetConfig.shopResourceId ? { shopResourceId: targetConfig.shopResourceId } : {}),
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
        ...(payload.encounterResourceId ? { encounterResourceId: payload.encounterResourceId } : {}),
        encounterFile: payload.encounterFile,
        victory,
        outcome: getBattleOutcome(payload, victory),
        completedAt,
        ...(targetConfig ? { targetConfig } : {}),
    };
}
