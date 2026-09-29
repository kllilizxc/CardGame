import { describe, expect, it } from 'bun:test';

import { DESKTOP_GAME_VIEWPORT, PORTRAIT_GAME_VIEWPORT,
    gameViewportForBrowser, isPortraitGameViewport } from './gameViewport';

describe('game viewport', () => {
    it('uses a readable portrait canvas only when the browser has portrait space', () => {
        expect(gameViewportForBrowser(390, 844)).toBe(PORTRAIT_GAME_VIEWPORT);
        expect(gameViewportForBrowser(620, 844)).toBe(PORTRAIT_GAME_VIEWPORT);
        expect(gameViewportForBrowser(844, 390)).toBe(DESKTOP_GAME_VIEWPORT);
        expect(gameViewportForBrowser(1440, 900)).toBe(DESKTOP_GAME_VIEWPORT);
        expect(isPortraitGameViewport(480, 1000)).toBe(true);
    });
});
