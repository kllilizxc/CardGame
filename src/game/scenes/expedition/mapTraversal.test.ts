import { beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import prototypeMapJson from '../../../../public/data/mijing/prototype-map.json';
import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';

import { resetRunPersistenceForTests, loadActiveRun } from '../../services/RunPersistence';
import { ExpeditionState } from '../../state/ExpeditionState';
import type {
    ExpeditionBattleCompleteEvent,
    ExpeditionMapDefinition,
    ExpeditionTargetConfig,
    PrototypeEventCollection,
    PrototypeShopCollection,
} from '../../types/expedition';
import { validatePrototypeExpeditionContent } from '../../types/prototypeExpeditionContent';
import {
    createEventNodeView,
    createExtractNodeView,
    createShopNodeView,
} from './nonCombatNodeFlow';
import { createRunAfterBattleVictory } from './runResultFlow';
import { enterReachableNode, getVisibleNodes, isReachableNode } from './mapTraversal';

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

function readPublicJson<T>(publicPath: string): T {
    const filePath = join('public', publicPath);

    expect(existsSync(filePath)).toBe(true);

    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    const values = new Map<string, string>();

    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: (key: string) => {
            values.delete(key);
        },
    };
}

const tutorialTargetConfig: ExpeditionTargetConfig = {
    routeKey: 'expedition:tutorial.qingyun-expedition:tutorial.qingyun-expedition-outer-mountain-map',
    expeditionId: 'tutorial.qingyun-expedition',
    mapId: 'tutorial.qingyun-expedition-outer-mountain-map',
    worldStateResourceId: 'tutorial.qingyun-world-seed',
    worldStateFile: 'data/world/tutorial-qingyun-initial-state.json',
    starterDeckResourceId: 'tutorial.qingyun-deck-casket-starter',
    starterDeckFile: 'data/decks/tutorial-qingyun-casket-starter.json',
    mapResourceId: 'tutorial.qingyun-expedition-outer-mountain-map',
    mapFile: 'data/mijing/tutorial-qingyun-outer-mountain-map.json',
    eventsResourceId: 'tutorial.qingyun-events-outer-mountain',
    eventsFile: 'data/mijing/tutorial-qingyun-events.json',
    shopResourceId: 'tutorial.qingyun-shop-wayfarer',
    shopFile: 'data/mijing/tutorial-qingyun-shop.json',
};

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
            encounterResourceId: 'test_encounter_01',
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
            encounterResourceId: 'mijing_boss_01',
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

    it('walks the tutorial outer-mountain route through battle return, fixed event reward, shop purchase, and extract intent', () => {
        const storage = createMemoryStorage();
        const tutorialMap = readPublicJson<ExpeditionMapDefinition>('data/mijing/tutorial-qingyun-outer-mountain-map.json');
        const tutorialEvents = readPublicJson<PrototypeEventCollection>('data/mijing/tutorial-qingyun-events.json');
        const tutorialShop = readPublicJson<PrototypeShopCollection>('data/mijing/tutorial-qingyun-shop.json');
        const tutorialWorldState = readPublicJson<typeof initialWorldState>('data/world/tutorial-qingyun-initial-state.json');
        const tutorialStarterDeck = readPublicJson<typeof starterDeckJson>('data/decks/tutorial-qingyun-casket-starter.json');
        const validated = validatePrototypeExpeditionContent({
            map: tutorialMap,
            events: tutorialEvents,
            shops: tutorialShop,
        });
        const expeditionState = ExpeditionState.bootstrap({
            worldState: tutorialWorldState,
            starterDeck: tutorialStarterDeck,
            targetIdentity: tutorialTargetConfig,
            activeRunRouteKey: tutorialTargetConfig.routeKey,
            storage,
        });
        const startedRun = expeditionState.createRunSnapshot({
            expeditionId: tutorialTargetConfig.expeditionId,
            mapId: tutorialTargetConfig.mapId,
            entryNodeId: validated.map.entryNodeId,
        });

        expect(getVisibleNodes(validated.map, startedRun).filter((node) => node.selectable).map((node) => node.id)).toEqual([
            'battle.tutorial-qingyun-mist-fox',
        ]);

        const battleRun = expeditionState.enterReachableNode(
            validated.map,
            'battle.tutorial-qingyun-mist-fox',
            tutorialTargetConfig,
        );

        expect(battleRun?.pendingEncounter).toMatchObject({
            nodeId: 'battle.tutorial-qingyun-mist-fox',
            nodeType: 'battle',
            encounterId: 'tutorial.qingyun-encounter-mist-fox',
            encounterResourceId: 'tutorial.qingyun-encounter-mist-fox',
            encounterFile: 'data/encounters/tutorial-qingyun-mist-fox.json',
            targetConfig: tutorialTargetConfig,
        });

        const battleResult: ExpeditionBattleCompleteEvent = {
            runId: battleRun!.runId,
            nodeId: 'battle.tutorial-qingyun-mist-fox',
            nodeType: 'battle',
            encounterId: 'tutorial.qingyun-encounter-mist-fox',
            encounterResourceId: 'tutorial.qingyun-encounter-mist-fox',
            encounterFile: 'data/encounters/tutorial-qingyun-mist-fox.json',
            victory: true,
            outcome: 'battle-victory',
            completedAt: '2026-05-14T00:00:00.000Z',
            targetConfig: tutorialTargetConfig,
        };
        const afterBattleRun = createRunAfterBattleVictory(battleRun!, battleResult);

        expect(afterBattleRun.currentNodeId).toBe('battle.tutorial-qingyun-mist-fox');
        expect(afterBattleRun.pendingEncounter).toBeNull();
        expect(isReachableNode(validated.map, afterBattleRun, 'event.tutorial-qingyun-first-cache')).toBe(true);

        const eventRun = enterReachableNode(validated.map, afterBattleRun, 'event.tutorial-qingyun-first-cache');
        const eventDefinition = tutorialEvents.eventsByNodeId['event.tutorial-qingyun-first-cache'];
        const fixedEventView = createEventNodeView(eventDefinition, eventRun!, () => {
            throw new Error('tutorial fixed outcome should not roll weighted random');
        }, {
            outcomeSelection: {
                kind: 'fixedOutcome',
                outcomeId: 'outcome.tutorial.qingyun.guard-talisman-cache',
            },
        });
        const eventState = new ExpeditionState(
            expeditionState.persistentStash,
            eventRun,
            tutorialTargetConfig,
            tutorialTargetConfig.routeKey,
            storage,
        );

        expect(fixedEventView.rewardSummary).toBe('TL_002 +1 · tool_talisman_basic +1 · spiritStones +12');

        const claimed = eventState.claimEventNodeReward(eventDefinition.nodeId, fixedEventView.outcome.rewards);

        expect(claimed.status).toBe('claimed');
        expect(claimed.activeRun?.spiritStones).toBe(12);
        expect(isReachableNode(validated.map, claimed.activeRun!, 'shop.tutorial-qingyun-wayfarer')).toBe(true);

        const shopRun = eventState.enterReachableNode(validated.map, 'shop.tutorial-qingyun-wayfarer');
        const shopDefinition = tutorialShop.shopsByNodeId['shop.tutorial-qingyun-wayfarer'];
        const shopView = createShopNodeView(shopDefinition, shopRun!);

        expect(shopView.offers.map((offer) => [offer.id, offer.state])).toEqual([
            ['offer.tutorial.qingyun.guard-talisman', 'available'],
            ['offer.tutorial.qingyun.fly-sword-keepsake', 'unaffordable'],
        ]);

        const purchase = eventState.purchaseShopOffer(
            shopDefinition.nodeId,
            'offer.tutorial.qingyun.guard-talisman',
            shopDefinition.offers[0].cost,
            shopDefinition.offers[0].rewards,
        );

        expect(purchase.status).toBe('purchased');
        expect(purchase.activeRun?.spiritStones).toBe(4);
        expect(isReachableNode(validated.map, purchase.activeRun!, 'boss.tutorial-qingyun-mind-echo')).toBe(true);

        const bossRun = enterReachableNode(
            validated.map,
            purchase.activeRun!,
            'boss.tutorial-qingyun-mind-echo',
            tutorialTargetConfig,
        );

        expect(bossRun?.pendingEncounter).toMatchObject({
            nodeId: 'boss.tutorial-qingyun-mind-echo',
            nodeType: 'boss',
            encounterId: 'tutorial.qingyun-encounter-mind-echo',
            encounterResourceId: 'tutorial.qingyun-encounter-mind-echo',
            encounterFile: 'data/encounters/tutorial-qingyun-mind-echo.json',
            targetConfig: tutorialTargetConfig,
        });

        const extractRun = eventState.enterReachableNode(validated.map, 'extract.tutorial-qingyun-rope-bridge');

        expect(extractRun?.currentNodeId).toBe('extract.tutorial-qingyun-rope-bridge');
        expect(createExtractNodeView('extract.tutorial-qingyun-rope-bridge', extractRun!).recorded).toBe(false);

        const extractIntent = eventState.recordExtractIntent('extract.tutorial-qingyun-rope-bridge', '2026-05-14T00:05:00.000Z');

        expect(extractIntent.status).toBe('recorded');
        expect(createExtractNodeView('extract.tutorial-qingyun-rope-bridge', extractIntent.activeRun!).recorded).toBe(true);
    });
});
