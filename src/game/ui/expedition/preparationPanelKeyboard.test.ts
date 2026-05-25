import { describe, expect, it } from 'bun:test';

import {
    getAdjacentPreparationDeckId,
    getPreparationKeyboardShortcut,
} from './preparationPanelKeyboard';

describe('preparationPanelKeyboard helpers', () => {
    const savedDecks = [
        { id: 'alpha', name: '甲', cards: [] },
        { id: 'beta', name: '乙', cards: [] },
        { id: 'gamma', name: '丙', cards: [] },
    ];

    it('maps the supported preparation shortcuts without colliding with modified keys', () => {
        expect(getPreparationKeyboardShortcut({ key: 'ArrowLeft' })).toBe('previous-deck');
        expect(getPreparationKeyboardShortcut({ key: 'ArrowRight' })).toBe('next-deck');
        expect(getPreparationKeyboardShortcut({ key: 'Enter' })).toBe('primary-action');
        expect(getPreparationKeyboardShortcut({ key: 'm' })).toBe('manage');
        expect(getPreparationKeyboardShortcut({ key: 'M' })).toBe('manage');
        expect(getPreparationKeyboardShortcut({ key: 'Enter', ctrlKey: true })).toBeNull();
        expect(getPreparationKeyboardShortcut({ key: 'ArrowLeft', metaKey: true })).toBeNull();
        expect(getPreparationKeyboardShortcut({ key: 'Tab' })).toBeNull();
    });

    it('finds the adjacent deck for keyboard wayfinding and clamps at the ends', () => {
        expect(getAdjacentPreparationDeckId(savedDecks, 'beta', -1)).toBe('alpha');
        expect(getAdjacentPreparationDeckId(savedDecks, 'beta', 1)).toBe('gamma');
        expect(getAdjacentPreparationDeckId(savedDecks, 'alpha', -1)).toBe('alpha');
        expect(getAdjacentPreparationDeckId(savedDecks, 'gamma', 1)).toBe('gamma');
    });

    it('falls back to the first deck when no current selection is available', () => {
        expect(getAdjacentPreparationDeckId(savedDecks, null, -1)).toBe('alpha');
        expect(getAdjacentPreparationDeckId(savedDecks, 'missing', 1)).toBe('alpha');
        expect(getAdjacentPreparationDeckId([], null, 1)).toBeNull();
    });
});
