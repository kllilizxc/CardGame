import { expect, test } from 'bun:test';
import type { CardSprite } from '../../objects/CardSprite';
import type { BattleContext } from '../../context/BattleContext';
import { SacrificeManager } from './SacrificeManager';
import units from '../../../../public/data/cards/units.json';
import type { UnitCard } from '../../../../public/data/types/cards/unit';

const data = (id: string) => structuredClone(units.units.find(unit => unit.id === id)) as UnitCard;
const unit = (id: string, health?: number, active = true) => {
    const card = data(id);
    if (health !== undefined) card.health = health;
    return { active, getCardData: () => card } as CardSprite;
};
const manager = new SacrificeManager({} as BattleContext);

test('a three-star summon offers only living two-star or higher sacrifices', () => {
    const valid = unit('CR_001'), weak = unit('CR_010'), dead = unit('CR_002', 0), destroyed = unit('CR_003', 2, false);
    expect(manager.getValidSacrifices(data('CR_009'), [weak, valid, dead, destroyed])).toEqual([valid]);
    expect(manager.validateSacrificeStars(data('CR_009'), [weak])).toBe(false);
    expect(manager.validateSacrificeStars(data('CR_009'), [valid])).toBe(true);
});

test('sacrifice confirmation rejects empty, excessive, and duplicate submissions', () => {
    const candidate = unit('CR_001'), target = data('CR_009');
    expect(manager.validateSacrificeStars(target, [])).toBe(false);
    expect(manager.validateSacrificeStars(target, [candidate, candidate])).toBe(false);
    expect(manager.validateSacrificeStars(target, [candidate, unit('CR_002')])).toBe(false);
});

test('high-star summons cannot spend low-star units, and free summons need no sacrifice', () => {
    expect(manager.getValidSacrifices(data('CR_HIGH_001'), [unit('CR_009'), unit('CR_001')])).toEqual([]);
    expect(manager.getSacrificeRequired(data('CR_001'))).toBe(0);
    expect(manager.getSacrificeRequired(data('CR_009'))).toBe(1);
});
