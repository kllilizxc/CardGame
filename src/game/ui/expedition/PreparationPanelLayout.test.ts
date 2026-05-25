import { describe, expect, it } from 'bun:test';

import {
    calculateActionRailHeight,
    calculateDeckCardHeight,
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
});
