import { describe, expect, it } from 'bun:test';

import catalog from '../../../public/data/content-catalog.json';
import units from '../../../public/data/cards/units.json';
import items from '../../../public/data/world/items.artifacts.json';

import { createContentDisplayNames, getContentDisplayNameResources } from './contentDisplayNames';

describe('contentDisplayNames', () => {
    it('loads every catalog card collection and the shared item registry for player-facing copy', () => {
        const resources = getContentDisplayNameResources(catalog);
        expect(resources.filter((resource) => resource.kind === 'card')).toHaveLength(6);
        expect(resources.find((resource) => resource.kind === 'item')?.publicPath).toBe('data/world/items.artifacts.json');

        const names = createContentDisplayNames([
            { kind: 'card', data: units },
            { kind: 'item', data: items },
        ]);
        expect(names.cardName('CR_001')).toBe('青云山灵狐');
        expect(names.itemName('tool.qa-fog-silver-needle')).toBe('银针');
        expect(names.itemName('consumable.qa-fog-white-leaf')).toBe('白叶草');
        expect(names.cardName('missing.card')).toBe('未收录卡牌');
        expect(names.itemName('missing.item')).toBe('未收录道具');
    });
});
