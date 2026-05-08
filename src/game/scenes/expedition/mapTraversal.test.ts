import { beforeEach, describe, expect, it } from 'bun:test';

import prototypeMapJson from '../../../../public/data/mijing/prototype-map.json';
import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';

import { resetRunPersistenceForTests, loadActiveRun } from '../../services/RunPersistence';
import { ExpeditionState } from '../../state/ExpeditionState';
import type { ExpeditionMapDefinition } from '../../types/expedition';
import { getVisibleNodes, isReachableNode } from './mapTraversal';

const prototypeMap = prototypeMapJson as ExpeditionMapDefinition;

function createStartedRun(): ExpeditionState {
    const expeditionState = ExpeditionState.bootstrap({
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
    });

    expeditionState.createRunSnapshot({
        expeditionId: 'phase01-first-playable-expedition',
        mapId: prototypeMap.id,
        entryNodeId: prototypeMap.entryNodeId,
    });

    return expeditionState;
}

describe('mapTraversal', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('classifies cleared, reachable, and future silhouette nodes while keeping every prototype type visible', () => {
        const expeditionState = createStartedRun();
        const activeRun = expeditionState.activeRun;

        if (!activeRun) {
            throw new Error('Expected createStartedRun to create an active run.');
        }

        const visibleNodes = getVisibleNodes(prototypeMap, activeRun);
        const visibilityByNodeId = Object.fromEntries(visibleNodes.map((node) => [node.id, node.visibility]));

        expect(new Set(visibleNodes.map((node) => node.type))).toEqual(
            new Set(['entrance', 'battle', 'event', 'shop', 'extract', 'boss']),
        );
        expect(visibilityByNodeId['entrance.mountain-gate']).toBe('cleared');
        expect(visibilityByNodeId['battle.mist-foxes']).toBe('reachable');
        expect(visibilityByNodeId['event.abandoned-cache']).toBe('reachable');
        expect(visibilityByNodeId['shop.wandering-peddler']).toBe('silhouette');
        expect(visibilityByNodeId['extract.cliff-rope']).toBe('silhouette');
        expect(visibilityByNodeId['boss.sealed-guardian']).toBe('silhouette');
    });

    it('allows only nodes connected from the active run current node', () => {
        const expeditionState = createStartedRun();
        const activeRun = expeditionState.activeRun;

        if (!activeRun) {
            throw new Error('Expected createStartedRun to create an active run.');
        }

        expect(isReachableNode(prototypeMap, activeRun, 'battle.mist-foxes')).toBe(true);
        expect(isReachableNode(prototypeMap, activeRun, 'event.abandoned-cache')).toBe(true);
        expect(isReachableNode(prototypeMap, activeRun, 'shop.wandering-peddler')).toBe(false);
        expect(isReachableNode(prototypeMap, activeRun, 'boss.sealed-guardian')).toBe(false);
        expect(isReachableNode(prototypeMap, activeRun, 'entrance.mountain-gate')).toBe(false);
    });

    it('persists current node, visited node state, and pending encounter when entering reachable battle and boss nodes', () => {
        const expeditionState = createStartedRun();

        const battleRun = expeditionState.enterReachableNode(prototypeMap, 'battle.mist-foxes');
        const persistedBattleRun = loadActiveRun();

        expect(battleRun?.currentNodeId).toBe('battle.mist-foxes');
        expect(battleRun?.visitedNodeIds).toEqual(['entrance.mountain-gate', 'battle.mist-foxes']);
        expect(battleRun?.nodeStates['battle.mist-foxes']).toEqual({
            nodeId: 'battle.mist-foxes',
            status: 'cleared',
            visited: true,
            rewardClaimed: false,
        });
        expect(battleRun?.pendingEncounter).toEqual({
            runId: battleRun?.runId,
            nodeId: 'battle.mist-foxes',
            nodeType: 'battle',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            runDeck: battleRun?.carriedDeck,
        });
        expect(persistedBattleRun?.pendingEncounter?.nodeId).toBe('battle.mist-foxes');

        const secondExpeditionState = createStartedRun();
        secondExpeditionState.enterReachableNode(prototypeMap, 'event.abandoned-cache');
        secondExpeditionState.enterReachableNode(prototypeMap, 'shop.wandering-peddler');
        const bossRun = secondExpeditionState.enterReachableNode(prototypeMap, 'boss.sealed-guardian');

        expect(bossRun?.pendingEncounter).toMatchObject({
            nodeId: 'boss.sealed-guardian',
            nodeType: 'boss',
            encounterId: 'mijing_boss_01',
            encounterFile: 'data/encounters/mijing-boss.json',
        });
    });

    it('ignores unreachable node entry attempts without mutating the active run', () => {
        const expeditionState = createStartedRun();
        const beforeRun = structuredClone(expeditionState.activeRun);

        const enteredRun = expeditionState.enterReachableNode(prototypeMap, 'boss.sealed-guardian');

        expect(enteredRun).toBeNull();
        expect(expeditionState.activeRun).toEqual(beforeRun);
        expect(loadActiveRun()).toEqual(beforeRun);
    });

    it('keeps visited non-combat nodes selectable so claimed content can be reopened safely', () => {
        const expeditionState = createStartedRun();

        expeditionState.enterReachableNode(prototypeMap, 'event.abandoned-cache');

        const activeRun = expeditionState.activeRun;

        if (!activeRun) {
            throw new Error('Expected entering a reachable event node to keep an active run.');
        }

        const eventNode = getVisibleNodes(prototypeMap, activeRun).find((node) => node.id === 'event.abandoned-cache');

        expect(eventNode?.visibility).toBe('cleared');
        expect(eventNode?.selectable).toBe(true);
    });
});
