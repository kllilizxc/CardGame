import { describe, expect, it } from 'bun:test';

import prototypeMapJson from '../../../../public/data/mijing/prototype-map.json';
import type { ExpeditionEncounterMapNode, RunSnapshot } from '../../types/expedition';
import { createBattleLaunchPayload, startBattleSceneFromPayload } from './battleLaunchFlow';
import { createExpeditionTargetConfig, normalizeExpeditionSceneLaunchData } from './expeditionSceneLaunch';

function createRunSnapshot(): RunSnapshot {
    return {
        runId: 'run-test-001',
        expeditionId: 'phase01-first-playable-expedition',
        mapId: 'phase01-prototype-map',
        status: 'inProgress',
        currentNodeId: 'entrance.mountain-gate',
        startingLoadout: {
            cards: [{ id: 'SX_YJZ_001', count: 1 }],
            items: [],
            spiritStones: 0,
        },
        carriedDeck: [
            { id: 'SX_YJZ_001', count: 1 },
            { id: 'AR_001', count: 2 },
        ],
        carriedItems: [],
        spiritStones: 12,
        visitedNodeIds: ['entrance.mountain-gate'],
        nodeStates: {},
        startedAt: '2026-05-08T00:00:00.000Z',
    };
}

describe('createBattleLaunchPayload', () => {
    it('builds the BattleScene payload for a normal battle node from the active run deck', () => {
        const battleNode = prototypeMapJson.nodes.find((node) => node.id === 'battle.mist-foxes') as ExpeditionEncounterMapNode;
        const run = createRunSnapshot();

        const payload = createBattleLaunchPayload(run, battleNode);

        expect(payload).toEqual({
            runId: 'run-test-001',
            nodeId: 'battle.mist-foxes',
            nodeType: 'battle',
            encounterId: 'test_encounter_01',
            encounterResourceId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            runDeck: [
                { id: 'SX_YJZ_001', count: 1 },
                { id: 'AR_001', count: 2 },
            ],
        });
        expect(payload.runDeck).not.toBe(run.carriedDeck);
    });





    it('attaches the authoritative expedition target config to battle payloads for round trips', () => {
        const battleNode = prototypeMapJson.nodes.find((node) => node.id === 'battle.mist-foxes') as ExpeditionEncounterMapNode;
        const targetConfig = createExpeditionTargetConfig(normalizeExpeditionSceneLaunchData({
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            mapFile: 'data/mijing/custom-map.json',
        }));

        expect(createBattleLaunchPayload(createRunSnapshot(), battleNode, targetConfig)).toMatchObject({
            runId: 'run-test-001',
            nodeId: 'battle.mist-foxes',
            targetConfig,
        });
    });

    it('starts BattleScene with an isolated copy of the pending battle payload', () => {
        const battleNode = prototypeMapJson.nodes.find((node) => node.id === 'battle.mist-foxes') as ExpeditionEncounterMapNode;
        const payload = createBattleLaunchPayload(createRunSnapshot(), battleNode);
        payload.deterministicBattleSetup = { deckOrder: 'preserve-json-order' };
        const calls: Array<{ sceneKey: string; data: unknown }> = [];

        startBattleSceneFromPayload({
            start: (sceneKey, data) => calls.push({ sceneKey, data }),
        }, payload);

        expect(calls).toEqual([{ sceneKey: 'BattleScene', data: payload }]);
        expect(calls[0].data).not.toBe(payload);
        expect((calls[0].data as typeof payload).runDeck).not.toBe(payload.runDeck);
        expect((calls[0].data as typeof payload).deterministicBattleSetup)
            .not.toBe(payload.deterministicBattleSetup);
    });

    it('builds the BattleScene payload for the prototype boss encounter file', () => {
        const bossNode = prototypeMapJson.nodes.find((node) => node.id === 'boss.sealed-guardian') as ExpeditionEncounterMapNode;

        expect(createBattleLaunchPayload(createRunSnapshot(), bossNode)).toMatchObject({
            nodeId: 'boss.sealed-guardian',
            nodeType: 'boss',
            encounterId: 'mijing_boss_01',
            encounterResourceId: 'mijing_boss_01',
            encounterFile: 'data/encounters/mijing-boss.json',
        });
    });

    it('keeps legacy encounter payload refs launchable when no catalog resource alias is present', () => {
        const legacyNode = structuredClone(
            prototypeMapJson.nodes.find((node) => node.id === 'battle.mist-foxes'),
        ) as ExpeditionEncounterMapNode;

        delete legacyNode.payloadRef.encounterResourceId;

        expect(createBattleLaunchPayload(createRunSnapshot(), legacyNode)).toEqual({
            runId: 'run-test-001',
            nodeId: 'battle.mist-foxes',
            nodeType: 'battle',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            runDeck: [
                { id: 'SX_YJZ_001', count: 1 },
                { id: 'AR_001', count: 2 },
            ],
        });
    });
});
