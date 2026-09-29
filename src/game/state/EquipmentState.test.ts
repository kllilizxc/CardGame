import { describe, expect, it } from 'bun:test';
import { equipmentModifierSources, isValidEquippedItems, pruneUnavailableEquipment, sumEquipmentModifiers } from './EquipmentState';
import { indexItemActionPolicies } from './ItemActionRules';

describe('EquipmentState', () => {
    const items = [
        { id: 'artifact.fox-charm', itemType: 'artifact' as const, count: 1 },
        { id: 'artifact.mist-band', itemType: 'artifact' as const, count: 1 },
    ];
    const policies = indexItemActionPolicies({ artifacts: [
        { id: 'artifact.fox-charm', equipSlot: 'charm', attributeModifiers: { 心性: 5, 悟性: -1 } },
        { id: 'artifact.mist-band', equipSlot: 'band', attributeModifiers: { 心性: 2 } },
    ] });

    it('keeps each modifier tied to its owned item and slot', () => {
        const sources = equipmentModifierSources({ charm: 'artifact.fox-charm', band: 'artifact.mist-band' }, items, policies);
        expect(sources).toEqual([
            { slot: 'charm', itemId: 'artifact.fox-charm', attribute: '心性', delta: 5 },
            { slot: 'charm', itemId: 'artifact.fox-charm', attribute: '悟性', delta: -1 },
            { slot: 'band', itemId: 'artifact.mist-band', attribute: '心性', delta: 2 },
        ]);
        expect(sumEquipmentModifiers(sources)).toEqual({ 心性: 7, 悟性: -1 });
        expect(sumEquipmentModifiers(equipmentModifierSources({ charm: 'artifact.fox-charm' }, [], policies))).toEqual({});
        expect(sumEquipmentModifiers(equipmentModifierSources({ weapon: 'artifact.fox-charm' }, items, policies))).toEqual({});
    });

    it('rejects duplicate, missing, and malformed saved equipment references', () => {
        expect(isValidEquippedItems({ charm: 'artifact.fox-charm' }, items)).toBe(true);
        expect(isValidEquippedItems({ charm: 'artifact.fox-charm', band: 'artifact.fox-charm' }, items)).toBe(false);
        expect(isValidEquippedItems({ charm: 'artifact.missing' }, items)).toBe(false);
        expect(isValidEquippedItems({ 'bad slot': 'artifact.fox-charm' }, items)).toBe(false);
        expect(isValidEquippedItems(JSON.parse('{"__proto__":"artifact.fox-charm"}'), items)).toBe(false);
        expect(pruneUnavailableEquipment({ charm: 'artifact.fox-charm', band: 'artifact.mist-band' }, items.slice(0, 1)))
            .toEqual({ charm: 'artifact.fox-charm' });
    });

    it('rejects an equipment modifier without a usable slot', () => {
        expect(() => indexItemActionPolicies({ consumables: [
            { id: 'salve', equipSlot: 'charm', attributeModifiers: { 心性: 5 } },
        ] })).toThrow('Invalid or duplicate world item policy');
        expect(() => indexItemActionPolicies({ artifacts: [
            { id: 'charm', attributeModifiers: { 心性: 5 } },
        ] })).toThrow('Invalid or duplicate world item policy');
        expect(() => indexItemActionPolicies({ artifacts: [
            { id: 'charm', equipSlot: '__proto__' },
        ] })).toThrow('Invalid or duplicate world item policy');
    });
});
