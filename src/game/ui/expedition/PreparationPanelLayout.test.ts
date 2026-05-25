import { describe, expect, it } from 'bun:test';

import {
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

    it('gives the selected-loadout summary enough room for the footer below the readiness and composition stack', () => {
        for (const [nameHeight, footerHeight] of [[29, 30], [58, 30]] as const) {
            const summaryHeight = calculateSelectedLoadoutSummaryHeight(nameHeight, footerHeight);
            const compositionBottom = 200 + nameHeight;
            const footerTop = summaryHeight - 18 - footerHeight;

            expect(footerTop - compositionBottom).toBeGreaterThanOrEqual(8);
        }
    });
});
