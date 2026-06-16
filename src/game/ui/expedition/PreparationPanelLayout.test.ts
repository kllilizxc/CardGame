import { describe, expect, it } from 'bun:test';

import {
    calculateDeckSwitcherHeight,
    calculateDeckCardHeight,
    calculateLoadoutSupportStripHeight,
    calculateReadinessHeroHeight,
} from './PreparationPanelLayout';

describe('PreparationPanel layout helpers', () => {
    it('gives the shorter deck-switch cards enough room for the count row and one-line readiness note below one-line and two-line names', () => {
        for (const deckNameHeight of [22, 44]) {
            const cardHeight = calculateDeckCardHeight(deckNameHeight);
            const noteBottom = 58 + deckNameHeight + 12;

            expect(cardHeight - noteBottom).toBeGreaterThanOrEqual(12);
        }
    });

    it('gives the shorter decision hero enough room for the headline stack, support tiles, and CTA column', () => {
        for (const [headerHeight, sectionHeight, shortcutHintHeight, actionColumnHeight] of [[130, 74, 18, 170], [186, 104, 36, 198]] as const) {
            const heroHeight = calculateReadinessHeroHeight(
                headerHeight,
                sectionHeight,
                shortcutHintHeight,
                actionColumnHeight,
            );
            const leftColumnBottom = 30 + headerHeight + 12 + sectionHeight + 10 + shortcutHintHeight;
            const rightColumnBottom = 30 + actionColumnHeight;

            expect(heroHeight - Math.max(leftColumnBottom, rightColumnBottom)).toBeGreaterThanOrEqual(12);
            expect(heroHeight).toBeGreaterThanOrEqual(200);
        }
    });

    it('gives the quieter loadout support strip enough room for summary lines and a follow-up footer', () => {
        for (const [bodyHeight, footerHeight] of [[34, 24], [68, 36]] as const) {
            const stripHeight = calculateLoadoutSupportStripHeight(bodyHeight, footerHeight);
            const footerBottom = 34 + bodyHeight + 8 + footerHeight;

            expect(stripHeight - footerBottom).toBeGreaterThanOrEqual(12);
            expect(stripHeight).toBeGreaterThanOrEqual(94);
        }
    });

    it('keeps the deck switcher subordinate while leaving room for a compact header and the card row', () => {
        for (const [headerHeight, cardHeight] of [[64, 120], [86, 136]] as const) {
            const switcherHeight = calculateDeckSwitcherHeight(headerHeight, cardHeight);
            const contentBottom = 14 + headerHeight + 8 + cardHeight;

            expect(switcherHeight - contentBottom).toBeGreaterThanOrEqual(12);
            expect(switcherHeight).toBeGreaterThanOrEqual(176);
        }
    });
});
