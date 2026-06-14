import { describe, expect, it } from 'bun:test';

import {
    calculateActionRailHeight,
    calculateDeckCardHeight,
    calculateLoadoutDetailHeight,
    calculateReadinessHeroHeight,
    calculateSelectedLoadoutSummaryHeight,
} from './PreparationPanelLayout';

describe('PreparationPanel layout helpers', () => {
    it('gives deck cards enough room for the comparison panels below typical one-line and two-line names', () => {
        for (const deckNameHeight of [22, 44]) {
            const cardHeight = calculateDeckCardHeight(deckNameHeight);
            const comparisonTop = 86 + deckNameHeight;
            const footerTop = cardHeight - 35;
            const comparisonHeight = footerTop - comparisonTop - 8;

            expect(comparisonHeight).toBeGreaterThanOrEqual(64);
        }
    });

    it('gives the selected-loadout summary enough room for the footer and carried-manifest utility stack', () => {
        for (const [nameHeight, footerHeight, manifestStackHeight] of [[29, 30, 224], [58, 30, 236]] as const) {
            const summaryHeight = calculateSelectedLoadoutSummaryHeight(nameHeight, footerHeight, manifestStackHeight);
            const compositionBottom = 200 + nameHeight;
            const footerTop = summaryHeight - 18 - footerHeight;
            const previewPanelHeight = summaryHeight - 96;

            expect(footerTop - compositionBottom).toBeGreaterThanOrEqual(8);
            expect(previewPanelHeight).toBeGreaterThanOrEqual(manifestStackHeight);
        }
    });

    it('gives the departure readiness rail enough room for wrapped copy and stacked CTAs', () => {
        for (const [headlineHeight, detailHeight, nextStepHeight, shortcutHintHeight] of [[27, 18, 18, 18], [54, 36, 36, 36]] as const) {
            const railHeight = calculateActionRailHeight(
                headlineHeight,
                detailHeight,
                nextStepHeight,
                shortcutHintHeight,
            );
            const shortcutHintBottom = 38 + headlineHeight + 6 + detailHeight + 6 + nextStepHeight + 6 + shortcutHintHeight;

            expect(railHeight - 18 - shortcutHintBottom).toBeGreaterThanOrEqual(0);
            expect(railHeight).toBeGreaterThanOrEqual(148);
        }
    });

    it('gives the readiness hero enough room for the headline stack, support panels, and CTA column', () => {
        for (const [headerHeight, sectionHeight, shortcutHintHeight, actionColumnHeight] of [[150, 88, 18, 188], [214, 116, 36, 214]] as const) {
            const heroHeight = calculateReadinessHeroHeight(
                headerHeight,
                sectionHeight,
                shortcutHintHeight,
                actionColumnHeight,
            );
            const leftColumnBottom = 30 + headerHeight + 12 + sectionHeight + 10 + shortcutHintHeight;
            const rightColumnBottom = 30 + actionColumnHeight;

            expect(heroHeight - Math.max(leftColumnBottom, rightColumnBottom)).toBeGreaterThanOrEqual(22);
            expect(heroHeight).toBeGreaterThanOrEqual(324);
        }
    });

    it('gives the subordinate loadout detail card enough room for manifest content and the carry footer', () => {
        for (const [contentHeight, footerHeight] of [[176, 30], [212, 45]] as const) {
            const detailHeight = calculateLoadoutDetailHeight(contentHeight, footerHeight);
            const contentBottom = 66 + contentHeight + 12 + footerHeight;

            expect(detailHeight - contentBottom).toBeGreaterThanOrEqual(0);
            expect(detailHeight).toBeGreaterThanOrEqual(244);
        }
    });
});
