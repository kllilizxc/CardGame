import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../public/data/decks/starter-deck.json';
import prototypeEventsJson from '../../../public/data/mijing/prototype-events.json';
import prototypeShopJson from '../../../public/data/mijing/prototype-shop.json';

import { resetRunPersistenceForTests, loadActiveRun } from '../services/RunPersistence';
import { ExpeditionState } from './ExpeditionState';

const DEFAULT_TARGET = {
    expeditionId: 'phase01-first-playable-expedition',
    mapId: 'phase01-prototype-map',
};

const SYNTHETIC_TARGET = {
    expeditionId: 'synthetic-expedition',
    mapId: 'synthetic-map',
};

describe('ExpeditionState', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('seeds the persistent starter stash from the world bootstrap data', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(state.activeRun).toBeNull();
        expect(state.persistentStash.stashId).toBe('phase01.starter-stash');
        expect(state.persistentStash.deckRef).toBe('starter-deck');
        expect(state.persistentStash.deck).toEqual(starterDeckJson.cards);
        expect(state.persistentStash.items).toEqual(initialWorldState.stash.items);
        expect(state.persistentStash.spiritStones).toBe(initialWorldState.stash.spiritStones);
    });

    it('creates and persists a run snapshot from the current stash loadout', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(run.currentNodeId).toBe('entrance.mountain-gate');
        expect(run.carriedDeck).toEqual(state.persistentStash.deck);
        expect(run.carriedItems).toEqual(state.persistentStash.items);
        expect(run.spiritStones).toBe(state.persistentStash.spiritStones);
        expect(run.visitedNodeIds).toEqual(['entrance.mountain-gate']);
        expect(run.nodeStates['entrance.mountain-gate']).toEqual({
            nodeId: 'entrance.mountain-gate',
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
        });
        expect(loadActiveRun()?.runId).toBe(run.runId);
    });

    it('normalizes active-run ownership to expeditionId and mapId instead of destination id', () => {
        const outerMountainTarget = DEFAULT_TARGET;
        const jadeCaveTarget = {
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        };
        const outerMountainState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.qingyun-outer-mountain-trial',
            activeRunIdentity: outerMountainTarget,
        });

        const outerMountainRun = outerMountainState.createRunSnapshot({
            ...outerMountainTarget,
            entryNodeId: 'entrance.mountain-gate',
        });
        const jadeCaveState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.jade-cave-trial',
            activeRunIdentity: jadeCaveTarget,
        });

        expect(outerMountainRun.routeKey).toBe('expedition:phase01-first-playable-expedition:phase01-prototype-map');
        expect(jadeCaveState.activeRun).toBeNull();

        const jadeCaveRun = jadeCaveState.createRunSnapshot({
            ...jadeCaveTarget,
            entryNodeId: 'entrance.jade-cave',
        });
        const restoredOuterMountainState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.qingyun-outer-mountain-trial',
            activeRunIdentity: outerMountainTarget,
        });
        const restoredJadeCaveState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            activeRunRouteKey: 'worldMap:destination.jade-cave-trial',
            activeRunIdentity: jadeCaveTarget,
        });

        expect(jadeCaveRun.routeKey).toBe('expedition:phase01-jade-cave-expedition:phase01-jade-cave-map');
        expect(loadActiveRun(outerMountainTarget)?.runId).toBe(outerMountainRun.runId);
        expect(loadActiveRun(jadeCaveTarget)?.runId).toBe(jadeCaveRun.runId);
        expect(restoredOuterMountainState.activeRun?.runId).toBe(outerMountainRun.runId);
        expect(restoredJadeCaveState.activeRun?.runId).toBe(jadeCaveRun.runId);
    });

    it('claims one prototype event reward, persists the run, and blocks duplicate claims', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'];
        const outcome = event.pool[0];

        const firstClaim = state.claimEventNodeReward(event.nodeId, structuredClone(outcome.rewards));

        expect(firstClaim.status).toBe('claimed');
        expect(state.activeRun?.currentNodeId).toBe(event.nodeId);
        expect(state.activeRun?.spiritStones).toBe(54);
        expect(state.activeRun?.nodeStates[event.nodeId]).toEqual({
            nodeId: event.nodeId,
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
            purchasedOfferIds: [],
        });
        expect(loadActiveRun()?.spiritStones).toBe(54);

        const secondClaim = state.claimEventNodeReward(event.nodeId, structuredClone(outcome.rewards));

        expect(secondClaim.status).toBe('alreadyClaimed');
        expect(state.activeRun?.spiritStones).toBe(54);
        expect(loadActiveRun()?.spiritStones).toBe(54);
        expect(state.persistentStash.spiritStones).toBe(36);
    });

    it('purchases prototype shop offers with run spiritStones and blocks duplicate or unaffordable purchases', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });
        const shop = prototypeShopJson.shopsByNodeId['shop.wandering-peddler'];
        const swordOffer = shop.offers.find((offer) => offer.id === 'offer.qingyun-sword');
        const charmOffer = shop.offers.find((offer) => offer.id === 'offer.fly-sword-charm');

        if (!swordOffer || !charmOffer) {
            throw new Error('Expected checked-in prototype shop offers to exist.');
        }

        const purchase = state.purchaseShopOffer(
            shop.nodeId,
            swordOffer.id,
            structuredClone(swordOffer.cost),
            structuredClone(swordOffer.rewards),
        );

        expect(purchase.status).toBe('purchased');
        expect(state.activeRun?.currentNodeId).toBe(shop.nodeId);
        expect(state.activeRun?.spiritStones).toBe(12);
        expect(state.activeRun?.carriedDeck.find((stack) => stack.id === 'AR_001')?.count).toBe(4);
        expect(state.activeRun?.nodeStates[shop.nodeId].purchasedOfferIds).toEqual([swordOffer.id]);
        expect(loadActiveRun()?.nodeStates[shop.nodeId].purchasedOfferIds).toEqual([swordOffer.id]);

        const duplicatePurchase = state.purchaseShopOffer(
            shop.nodeId,
            swordOffer.id,
            structuredClone(swordOffer.cost),
            structuredClone(swordOffer.rewards),
        );
        const unaffordablePurchase = state.purchaseShopOffer(
            shop.nodeId,
            charmOffer.id,
            structuredClone(charmOffer.cost),
            structuredClone(charmOffer.rewards),
        );

        expect(duplicatePurchase.status).toBe('alreadyPurchased');
        expect(unaffordablePurchase.status).toBe('insufficientFunds');
        expect(state.activeRun?.spiritStones).toBe(12);
        expect(state.activeRun?.carriedItems.some((stack) => stack.id === 'artifact_fly_sword_basic')).toBe(false);
        expect(state.persistentStash.deck.find((stack) => stack.id === 'AR_001')?.count).toBe(3);
        expect(state.persistentStash.spiritStones).toBe(36);
    });

    it('records an extract intent for terminal resolution without resolving the run immediately', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });
        const requestedAt = '2026-05-08T00:00:00.000Z';

        const recordResult = state.recordExtractIntent('extract.cliff-rope', requestedAt);

        expect(recordResult.status).toBe('recorded');
        expect(state.activeRun?.status).toBe('inProgress');
        expect(state.activeRun?.currentNodeId).toBe('extract.cliff-rope');
        expect(state.activeRun?.pendingTerminalResolution).toEqual({
            kind: 'extract',
            nodeId: 'extract.cliff-rope',
            requestedAt,
        });
        expect(state.activeRun?.nodeStates['extract.cliff-rope']).toEqual({
            nodeId: 'extract.cliff-rope',
            status: 'cleared',
            visited: true,
            rewardClaimed: true,
            purchasedOfferIds: [],
        });
        expect(loadActiveRun()?.pendingTerminalResolution?.nodeId).toBe('extract.cliff-rope');

        const duplicateResult = state.recordExtractIntent('extract.cliff-rope', '2026-05-08T00:01:00.000Z');

        expect(duplicateResult.status).toBe('alreadyRecorded');
        expect(state.activeRun?.pendingTerminalResolution?.requestedAt).toBe(requestedAt);
    });

    it('loads and persists active runs independently by expeditionId and mapId', () => {
        const defaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: DEFAULT_TARGET,
        });
        const defaultRun = defaultState.createRunSnapshot({
            ...DEFAULT_TARGET,
            entryNodeId: 'entrance.mountain-gate',
        });
        defaultState.applyNodeRewardPreview({
            cards: [{ id: 'TL_002', count: 1 }],
            items: [],
            spiritStones: 9,
        });

        const syntheticState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET,
        });
        const syntheticRun = syntheticState.createRunSnapshot({
            ...SYNTHETIC_TARGET,
            entryNodeId: 'entrance.synthetic',
        });
        syntheticState.applyNodeRewardPreview({
            cards: [{ id: 'AR_001', count: 1 }],
            items: [{ id: 'artifact.synthetic', itemType: 'artifact', count: 1 }],
            spiritStones: 21,
        });

        const resumedDefaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: DEFAULT_TARGET,
        });
        const directDefaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(resumedDefaultState.activeRun?.runId).toBe(defaultRun.runId);
        expect(resumedDefaultState.activeRun?.carriedDeck).toContainEqual({ id: 'TL_002', count: 1 });
        expect(directDefaultState.activeRun?.runId).toBe(defaultRun.runId);
        expect(loadActiveRun(DEFAULT_TARGET)?.runId).toBe(defaultRun.runId);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRun.runId);
        expect(loadActiveRun(SYNTHETIC_TARGET)?.carriedItems).toContainEqual({
            id: 'artifact.synthetic',
            itemType: 'artifact',
            count: 1,
        });
    });

    it('clears only the current target active run when returning to the entrance', () => {
        const defaultState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: DEFAULT_TARGET,
        });
        const defaultRun = defaultState.createRunSnapshot({
            ...DEFAULT_TARGET,
            entryNodeId: 'entrance.mountain-gate',
        });
        const syntheticState = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
            targetIdentity: SYNTHETIC_TARGET,
        });
        const syntheticRun = syntheticState.createRunSnapshot({
            ...SYNTHETIC_TARGET,
            entryNodeId: 'entrance.synthetic',
        });

        defaultState.resetToEntranceState();

        expect(loadActiveRun(DEFAULT_TARGET)).toBeNull();
        expect(loadActiveRun(SYNTHETIC_TARGET)?.runId).toBe(syntheticRun.runId);
        expect(defaultRun.runId).not.toBe(syntheticRun.runId);
    });
});
