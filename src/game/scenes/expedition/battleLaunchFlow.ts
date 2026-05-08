import type {
    BattleLaunchPayload,
    ExpeditionEncounterMapNode,
    RunSnapshot,
} from '../../types/expedition';

function cloneRunDeck(run: RunSnapshot): BattleLaunchPayload['runDeck'] {
    return run.carriedDeck.map((stack) => ({ ...stack }));
}


export interface BattleSceneStarter {
    start(sceneKey: 'BattleScene', data: BattleLaunchPayload): void;
}

export function createBattleSceneStartPayload(payload: BattleLaunchPayload): BattleLaunchPayload {
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
    };
}

export function startBattleSceneFromPayload(scene: BattleSceneStarter, payload: BattleLaunchPayload): void {
    scene.start('BattleScene', createBattleSceneStartPayload(payload));
}

export function createBattleLaunchPayload(
    activeRun: RunSnapshot,
    node: ExpeditionEncounterMapNode,
): BattleLaunchPayload {
    const runDeck = cloneRunDeck(activeRun);

    return {
        runId: activeRun.runId,
        nodeId: node.id,
        nodeType: node.type,
        encounterId: node.payloadRef.ref,
        encounterFile: node.payloadRef.encounterFile,
        runDeck,
    };
}
