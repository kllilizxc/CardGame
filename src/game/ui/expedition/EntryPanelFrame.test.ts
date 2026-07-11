import { describe, expect, it } from 'bun:test';

import {
    getEntryPanelTop,
    getEntryShellCenterY,
    type EntryPanelFrame,
} from './EntryPanelFrame';

describe('EntryPanelFrame helpers', () => {
    const desktopDeckManagerFrame: EntryPanelFrame = {
        panelX: 960,
        panelY: 552,
        panelWidth: 1460,
        panelHeight: 920,
    };

    it('keeps the 1920x1080 deck-manager breadcrumb band above the live panel edge', () => {
        const shellHeight = 46;
        const shellCenterY = getEntryShellCenterY(desktopDeckManagerFrame, shellHeight, {
            gap: 18,
            minTopMargin: 10,
        });
        const shellBottom = shellCenterY + shellHeight / 2;

        expect(shellBottom).toBeLessThanOrEqual(getEntryPanelTop(desktopDeckManagerFrame) - 18);
    });

    it('preserves the same separation when the breadcrumb wraps onto a taller line stack', () => {
        const shellHeight = 64;
        const shellCenterY = getEntryShellCenterY(desktopDeckManagerFrame, shellHeight, {
            gap: 18,
            minTopMargin: 10,
        });
        const shellBottom = shellCenterY + shellHeight / 2;

        expect(shellBottom).toBeLessThanOrEqual(getEntryPanelTop(desktopDeckManagerFrame) - 18);
    });

    it('pins the shell on-screen when the panel rises too close to the top edge', () => {
        const shellHeight = 64;
        const shellCenterY = getEntryShellCenterY(
            {
                panelX: 640,
                panelY: 220,
                panelWidth: 980,
                panelHeight: 360,
            },
            shellHeight,
            {
                gap: 18,
                minTopMargin: 24,
            },
        );

        expect(shellCenterY - shellHeight / 2).toBeGreaterThanOrEqual(24);
    });
});
