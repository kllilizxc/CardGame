import { describe, expect, it } from 'bun:test';

import prototypeEventsJson from '../../../../public/data/mijing/prototype-events.json';
import prototypeShopJson from '../../../../public/data/mijing/prototype-shop.json';
import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';

import { ExpeditionState } from '../../state/ExpeditionState';
import {
    createEventNodeView,
    createExtractNodeView,
    createShopNodeView,
} from './nonCombatNodeFlow';

function createStartedRun() {
    const state = ExpeditionState.bootstrap({
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
    });

    const run = state.createRunSnapshot({
        expeditionId: 'phase01-first-playable-expedition',
        mapId: 'phase01-prototype-map',
        entryNodeId: 'entrance.mountain-gate',
    });

    return { state, run };
}

describe('nonCombatNodeFlow', () => {
    it('creates a concrete event view from the prototype event pool and marks claimed events', () => {
        const { state, run } = createStartedRun();
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'];

        const unclaimedView = createEventNodeView(event, run, () => 0);

        expect(unclaimedView.title).toBe('弃置行囊');
        expect(unclaimedView.outcome.id).toBe('cache.spirit-stones');
        expect(unclaimedView.rewardSummary).toBe('spiritStones +18');
        expect(unclaimedView.claimed).toBe(false);

        state.claimEventNodeReward(event.nodeId, structuredClone(unclaimedView.outcome.rewards));

        const claimedView = createEventNodeView(event, state.activeRun!, () => 0);

        expect(claimedView.outcome.id).toBe('cache.spirit-stones');
        expect(claimedView.claimed).toBe(true);
    });

    it('keeps weighted random event outcome selection when no fixed outcome is requested', () => {
        const { run } = createStartedRun();
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'];

        const view = createEventNodeView(event, run, () => 0.76);

        expect(view.outcome.id).toBe('cache.wandering-sword');
        expect(view.rewardSummary).toBe('AR_001 +1 · artifact_fly_sword_basic +1');
    });

    it('uses an opt-in fixed event outcome and keeps reward and claimed state derived from that outcome', () => {
        const { state, run } = createStartedRun();
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'];

        const unclaimedView = createEventNodeView(event, run, () => {
            throw new Error('fixed event outcome selection should not call random');
        }, {
            outcomeSelection: {
                kind: 'fixedOutcome',
                outcomeId: 'cache.talisman-roll',
            },
        });

        expect(unclaimedView.outcome.id).toBe('cache.talisman-roll');
        expect(unclaimedView.rewardSummary).toBe('TL_002 +1 · tool_talisman_basic +1 · spiritStones +6');
        expect(unclaimedView.claimed).toBe(false);

        state.claimEventNodeReward(event.nodeId, structuredClone(unclaimedView.outcome.rewards));

        const claimedView = createEventNodeView(event, state.activeRun!, () => {
            throw new Error('fixed event outcome selection should not call random');
        }, {
            outcomeSelection: {
                kind: 'fixedOutcome',
                outcomeId: 'cache.talisman-roll',
            },
        });

        expect(claimedView.outcome.id).toBe('cache.talisman-roll');
        expect(claimedView.claimed).toBe(true);
    });

    it('fails actionably instead of falling back to random when a fixed event outcome is missing', () => {
        const { run } = createStartedRun();
        const event = prototypeEventsJson.eventsByNodeId['event.abandoned-cache'];

        expect(() => createEventNodeView(event, run, () => 0, {
            outcomeSelection: {
                kind: 'fixedOutcome',
                outcomeId: 'cache.missing-outcome',
            },
        })).toThrow('Missing fixed expedition event outcome: nodeId=event.abandoned-cache outcomeId=cache.missing-outcome');
    });

    it('creates shop offer views that expose affordability and purchased state', () => {
        const { state } = createStartedRun();
        const shop = prototypeShopJson.shopsByNodeId['shop.wandering-peddler'];
        const swordOffer = shop.offers[0];
        const charmOffer = shop.offers[2];

        const startingView = createShopNodeView(shop, state.activeRun!);

        expect(startingView.offers.find((offer) => offer.id === swordOffer.id)?.state).toBe('available');
        expect(startingView.offers.find((offer) => offer.id === charmOffer.id)?.state).toBe('available');

        state.purchaseShopOffer(
            shop.nodeId,
            swordOffer.id,
            structuredClone(swordOffer.cost),
            structuredClone(swordOffer.rewards),
        );

        const afterPurchaseView = createShopNodeView(shop, state.activeRun!);

        expect(afterPurchaseView.offers.find((offer) => offer.id === swordOffer.id)?.state).toBe('purchased');
        expect(afterPurchaseView.offers.find((offer) => offer.id === charmOffer.id)?.state).toBe('unaffordable');
    });

    it('creates extract views that show whether terminal resolution intent is already recorded', () => {
        const { state, run } = createStartedRun();

        expect(createExtractNodeView('extract.cliff-rope', run).recorded).toBe(false);

        state.recordExtractIntent('extract.cliff-rope', '2026-05-08T00:00:00.000Z');

        expect(createExtractNodeView('extract.cliff-rope', state.activeRun!).recorded).toBe(true);
    });
});
