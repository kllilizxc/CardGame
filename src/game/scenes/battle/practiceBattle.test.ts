import { describe, expect, it } from 'bun:test';
import catalog from '../../../../public/data/content-catalog.json';
import units from '../../../../public/data/cards/units.json';
import artifacts from '../../../../public/data/cards/artifacts.json';
import talismans from '../../../../public/data/cards/talismans.json';
import deck from '../../../../public/data/decks/qingyun-tide-dragon.json';
import encounter from '../../../../public/data/encounters/qingyun-tide-dragon.json';
import type { UnitCard } from '@data/types/cards/unit';
import type { CardSprite } from '../../objects/CardSprite';
import type { BattleContext } from '../../context/BattleContext';
import { SacrificeManager } from '../../managers/battle/SacrificeManager';
import { getUnitStar } from '../../utils/RealmHelper';
import { loadPracticeBattle } from './practiceBattle';

const launch = {
    runId: 'worka-preview',
    nodeId: 'battle.preview',
    nodeType: 'battle' as const,
    encounterId: encounter.id,
    encounterFile: 'data/encounters/qingyun-tide-dragon.json',
    runDeck: [{ id: 'CR_001', count: 1 }],
};

function unitSprite(id: string): CardSprite {
    const card = units.units.find(candidate => candidate.id === id) as UnitCard;
    return { getCardData: () => card } as CardSprite;
}

describe('Qingyun tidekeeper practice', () => {
    it('loads the fixed practice deck instead of the generic preview deck without changing expedition decks', async () => {
        const request = async (path: string) => {
            expect(path).toBe('data/decks/qingyun-tide-dragon.json');
            return Response.json(deck);
        };
        const practice = await loadPracticeBattle(catalog, launch, encounter, request);
        expect(practice?.deckPlan).toEqual({ stacks: deck.cards, shouldShuffle: false });
        expect(await loadPracticeBattle(catalog, { ...launch, runId: 'expedition-1' }, encounter, request)).toBeNull();
        expect(practice?.deckPlan.stacks.slice(0, 3).map(stack => stack.id))
            .toEqual(['CR_QY_TIDE_SCOUT', 'CR_QY_TIDE_DRAGON', 'AR_QY_TIDE_SEAL']);
        expect(deck.cards.reduce((total, stack) => total + stack.count, 0)).toBe(20);
        for (const id of new Set(deck.cards.map(stack => stack.id))) {
            const card = [...units.units, ...artifacts.artifacts, ...talismans.talismans].find(entry => entry.id === id);
            const copies = deck.cards.filter(stack => stack.id === id).reduce((total, stack) => total + stack.count, 0);
            expect(card).toBeDefined();
            expect(copies).toBeLessThanOrEqual(card?.limitPerDeck ?? 3);
        }
    });

    it('allows the matching two-star substitute but rejects ordinary two-star sacrifices', () => {
        const manager = new SacrificeManager({} as BattleContext);
        const scout = unitSprite('CR_QY_TIDE_SCOUT');
        const ordinary = unitSprite('CR_008');
        const senior = unitSprite('CR_009');
        const dragon = unitSprite('CR_QY_TIDE_DRAGON').getCardData();
        expect(getUnitStar(dragon)).toBe(4);
        expect(getUnitStar(scout.getCardData())).toBe(2);
        expect(manager.getSacrificeRequired(scout.getCardData())).toBe(0);
        expect(manager.getSacrificeRequired(dragon)).toBe(1);
        expect(manager.getValidSacrifices(dragon, [scout, ordinary, senior])).toEqual([scout, senior]);
        expect(manager.validateSacrificeStars(dragon, [])).toBe(false);
        expect(manager.validateSacrificeStars(dragon, [ordinary])).toBe(false);
        expect(manager.validateSacrificeStars(dragon, [scout])).toBe(true);
        expect(manager.validateSacrificeStars(dragon, [senior])).toBe(true);
        const seal = artifacts.artifacts.find(card => card.id === 'AR_QY_TIDE_SEAL');
        expect(dragon.labels).toContain(seal?.equipRequiresLabel);
        const frontGuard = unitSprite('CR_006').getCardData();
        const equippedAttack = dragon.attack + (seal?.attackBonus ?? 0);
        expect(equippedAttack).toBe(22);
        expect(equippedAttack).toBeLessThan(frontGuard.health);
        expect(dragon.health + (seal?.healthBonus ?? 0)).toBe(46);
    });
});
