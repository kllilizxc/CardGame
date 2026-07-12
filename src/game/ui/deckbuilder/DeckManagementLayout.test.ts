import { describe, expect, it } from 'bun:test';

import {
    computeDeckManagementPanelLayout,
    createDeckManagementPanelFrame,
} from './DeckManagementLayout';

describe('DeckManagementLayout', () => {
    it('keeps the default 1920x1080 deck-manager frame dense enough for sectioned deck and pool grids', () => {
        const frame = createDeckManagementPanelFrame(1920, 1080);
        const layout = computeDeckManagementPanelLayout(frame);

        expect(frame).toEqual({
            panelX: 960,
            panelY: 552,
            panelWidth: 1460,
            panelHeight: 920,
        });
        expect(layout.mainDeckGrid.columns).toBeGreaterThanOrEqual(8);
        expect(layout.mainDeckGrid.tileWidth).toBeGreaterThanOrEqual(104);
        expect(layout.cardPoolGrid.columns).toBeGreaterThanOrEqual(5);
        expect(layout.cardPoolGrid.tileWidth).toBeGreaterThanOrEqual(56);
    });

    it('preserves the intended left-heavy split while clamping the right browser column into the supported range', () => {
        const layout = computeDeckManagementPanelLayout(createDeckManagementPanelFrame(1920, 1080));

        expect(layout.leftWorkspace.width).toBeGreaterThan(layout.browser.width);
        expect(layout.browser.width).toBeGreaterThanOrEqual(320);
        expect(layout.browser.width).toBeLessThanOrEqual(360);
        expect(layout.editor.width).toBe(layout.leftWorkspace.innerWidth);
        expect(layout.browser.innerWidth).toBe(layout.browser.width - 32);
    });
});
