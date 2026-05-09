import type {
    BattleLaunchPayload,
    ExpeditionEncounterMapNode,
    ExpeditionTargetConfig,
    RunSnapshot,
} from '../../types/expedition';

function cloneRunDeck(run: RunSnapshot): BattleLaunchPayload['runDeck'] {
    return run.carriedDeck.map((stack) => ({ ...stack }));
}

function cloneTargetConfig(targetConfig?: ExpeditionTargetConfig): ExpeditionTargetConfig | undefined {
    return targetConfig
        ? {
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
        }
        : undefined;
}

export interface BattleSceneStarter {
    start(sceneKey: 'BattleScene', data: BattleLaunchPayload): void;
}

export function createBattleSceneStartPayload(payload: BattleLaunchPayload): BattleLaunchPayload {
    const targetConfig = cloneTargetConfig(payload.targetConfig);

    return {
        ...payload,
        carriedDeck: payload.carriedDeck?.map((stack) => ({ ...stack })),
        runDeck: payload.runDeck.map((stack) => ({ ...stack })),
        rewardPreview: payload.rewardPreview
            ? {
                cards: payload.rewardPreview.cards.map((stack) => ({ ...stack })),
                items: payload.rewardPreview.items.map((stack) => ({ ...stack })),
                spiritStones: payload.rewardPreview.spiritStones,
            }
            : undefined,
        ...(targetConfig ? { targetConfig } : {}),
    };
}

export function startBattleSceneFromPayload(scene: BattleSceneStarter, payload: BattleLaunchPayload): void {
    scene.start('BattleScene', createBattleSceneStartPayload(payload));
}

export function createBattleLaunchPayload(
    activeRun: RunSnapshot,
    node: ExpeditionEncounterMapNode,
    targetConfig?: ExpeditionTargetConfig,
): BattleLaunchPayload {
    const runDeck = cloneRunDeck(activeRun);
    const clonedTargetConfig = cloneTargetConfig(targetConfig);

    return {
        runId: activeRun.runId,
        nodeId: node.id,
        nodeType: node.type,
        encounterId: node.payloadRef.ref,
        ...(node.payloadRef.encounterResourceId ? { encounterResourceId: node.payloadRef.encounterResourceId } : {}),
        encounterFile: node.payloadRef.encounterFile,
        runDeck,
        ...(clonedTargetConfig ? { targetConfig: clonedTargetConfig } : {}),
    };
}
