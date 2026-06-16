import { describe, expect, it } from 'bun:test';

import {
    calculateDeckSwitcherHeight,
    calculateDeckCardHeight,
    calculatePreparationDecisionCardHeight,
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
            const leftColumnBottom = 24 + headerHeight + 10 + sectionHeight + 8 + shortcutHintHeight;
            const rightColumnBottom = 24 + actionColumnHeight;

            expect(heroHeight - Math.max(leftColumnBottom, rightColumnBottom)).toBeGreaterThanOrEqual(10);
            expect(heroHeight).toBeGreaterThanOrEqual(186);
        }
    });

    it('gives the quieter loadout footer strip enough room for summary lines and a follow-up footer', () => {
        for (const [bodyHeight, footerHeight] of [[34, 24], [68, 36]] as const) {
            const stripHeight = calculateLoadoutSupportStripHeight(bodyHeight, footerHeight);
            const footerBottom = 26 + bodyHeight + 6 + footerHeight;

            expect(stripHeight - footerBottom).toBeGreaterThanOrEqual(10);
            expect(stripHeight).toBeGreaterThanOrEqual(82);
        }
    });

    it('keeps the summary stack and quiet footer in one compact decision card', () => {
        for (const [heroHeight, footerHeight] of [[208, 92], [244, 108]] as const) {
            const decisionCardHeight = calculatePreparationDecisionCardHeight(heroHeight, footerHeight);
            const footerBottom = heroHeight + 6 + footerHeight;

            expect(decisionCardHeight - footerBottom).toBeGreaterThanOrEqual(10);
        }
    });

    it('keeps the deck switcher subordinate while leaving room for a compact header and the card row', () => {
        for (const [headerHeight, cardHeight] of [[52, 108], [74, 128]] as const) {
            const switcherHeight = calculateDeckSwitcherHeight(headerHeight, cardHeight);
            const contentBottom = 12 + headerHeight + 6 + cardHeight;

            expect(switcherHeight - contentBottom).toBeGreaterThanOrEqual(10);
            expect(switcherHeight).toBeGreaterThanOrEqual(160);
        }
    });
});
